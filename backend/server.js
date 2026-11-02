
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();

// En ligne ou en local ?
const EN_LIGNE = process.env.NODE_ENV === 'production';

// Derrière l'hébergeur : on lit la vraie adresse du visiteur
if (EN_LIGNE) {
  app.set('trust proxy', 1);
}

// ----- Les protections du navigateur (entêtes de sécurité) -----
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: EN_LIGNE ? [] : null,
      },
    },
  })
);

// En ligne, le site et le serveur ont la même adresse : pas besoin de CORS
app.use(cors({ origin: !EN_LIGNE }));

// On refuse les envois trop gros
app.use(express.json({ limit: '100kb' }));

// ----- Limite de demandes : stoppe les attaques par répétition -----
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erreur: 'Trop de demandes. Réessaie dans quelques minutes.' },
  })
);

const limiteConnexion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erreur: 'Trop de tentatives de connexion depuis cet appareil. Réessaie dans 15 minutes.',
  },
});

// ----- La clé secrète qui signe les badges -----
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (EN_LIGNE) {
    console.error('ERREUR : JWT_SECRET est obligatoire en ligne. Le serveur ne démarre pas.');
    process.exit(1);
  }
  SECRET = 'cle-de-developpement-seulement';
}

// ----- Où ranger le registre et les fichiers -----
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Combien de jours un élément reste dans la corbeille avant d'être supprimé
const DELAI_CORBEILLE_JOURS = 30;

// ----- Le registre (la base de données) -----
const db = new Database(path.join(DATA_DIR, 'ecole.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS etudiants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricule TEXT,
    nom TEXT,
    prenom TEXT,
    date_naissance TEXT,
    sexe TEXT,
    lieu_naissance TEXT,
    classe TEXT,
    parent_nom TEXT,
    parent_tel TEXT,
    parent_email TEXT,
    date_inscription TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricule TEXT,
    nom TEXT,
    filiere TEXT,
    niveau TEXT,
    classe TEXT,
    matiere TEXT,
    semestre TEXT,
    evaluation TEXT,
    note REAL,
    coef INTEGER,
    date_saisie TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifiant TEXT UNIQUE,
    nom TEXT,
    role TEXT,
    mot_de_passe TEXT
  );

  CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_action TEXT DEFAULT CURRENT_TIMESTAMP,
    utilisateur_id INTEGER,
    identifiant TEXT,
    role TEXT,
    action TEXT,
    details TEXT,
    adresse_ip TEXT
  );
`);

// Ajoute les colonnes manquantes (sans rien casser si elles existent déjà)
const nouvellesColonnes = [
  'ALTER TABLE notes ADD COLUMN publie INTEGER DEFAULT 0',
  'ALTER TABLE etudiants ADD COLUMN acte TEXT',
  'ALTER TABLE etudiants ADD COLUMN photo TEXT',
  'ALTER TABLE etudiants ADD COLUMN bulletins TEXT',
  'ALTER TABLE utilisateurs ADD COLUMN jeton_version INTEGER DEFAULT 0',
  'ALTER TABLE etudiants ADD COLUMN supprime_le TEXT',
  'ALTER TABLE notes ADD COLUMN supprime_le TEXT',
];

nouvellesColonnes.forEach((requete) => {
  try {
    db.exec(requete);
  } catch (err) {
    // La colonne existe déjà : tout va bien
  }
});

// ----- Les outils de base -----

// Le rang de chaque rôle : on gère seulement les rôles en dessous du sien
const RANGS = {
  proprietaire: 4,
  superadmin: 3,
  admin: 2,
  secretaire: 1,
  enseignant: 1,
};

function rang(role) {
  return RANGS[role] || 0;
}

const CLASSES = ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'];

// Un mot de passe solide : 10 caractères, avec lettres et chiffres
const MESSAGE_MDP =
  'Le mot de passe doit contenir au moins 10 caractères, avec au moins une lettre et un chiffre.';

function motDePasseValide(motDePasse) {
  return (
    typeof motDePasse === 'string' &&
    motDePasse.length >= 10 &&
    motDePasse.length <= 100 &&
    /[A-Za-z]/.test(motDePasse) &&
    /[0-9]/.test(motDePasse)
  );
}

// Nettoie un texte : retire < > et les caractères cachés, coupe à la bonne taille
function nettoyer(valeur, max) {
  return String(valeur === undefined || valeur === null ? '' : valeur)
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max || 100);
}

function dateValide(texte) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) return false;
  const d = new Date(texte + 'T00:00:00Z');
  return (
    !isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === texte &&
    d.getUTCFullYear() >= 1900 &&
    d <= new Date()
  );
}

// Vérifie qu'un numéro d'identifiant est un vrai nombre
function lireId(valeur) {
  const n = Number(valeur);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Le journal : qui fait quoi (jamais de mot de passe ici)
function journaliser(req, action, details, acteur) {
  try {
    const u = acteur || req.utilisateur || {};
    db.prepare(
      `INSERT INTO journal (utilisateur_id, identifiant, role, action, details, adresse_ip)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      u.id || null,
      u.identifiant || null,
      u.role || null,
      action,
      details ? String(details).slice(0, 300) : null,
      req.ip || null
    );
  } catch (err) {
    console.error('Journal :', err.message);
  }
}

// Fabrique le badge de connexion
function signerToken(user) {
  return jwt.sign(
    {
      id: user.id,
      identifiant: user.identifiant,
      nom: user.nom,
      role: user.role,
      v: user.jeton_version || 0,
    },
    SECRET,
    { expiresIn: '8h' }
  );
}

// ----- Le PROPRIÉTAIRE (le développeur) : créé une seule fois -----
const nbProprietaires = db
  .prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'proprietaire'")
  .get().n;

if (nbProprietaires === 0) {
  const idProp = nettoyer(process.env.PROPRIETAIRE_IDENTIFIANT, 30).toLowerCase();
  const mdpProp = process.env.PROPRIETAIRE_MOT_DE_PASSE;

  if (idProp && motDePasseValide(mdpProp)) {
    const dejaPris = db
      .prepare('SELECT id FROM utilisateurs WHERE LOWER(identifiant) = ?')
      .get(idProp);

    if (dejaPris) {
      console.log('Propriétaire non créé : cet identifiant existe déjà. Choisis-en un autre.');
    } else {
      db.prepare(
        'INSERT INTO utilisateurs (identifiant, nom, role, mot_de_passe) VALUES (?, ?, ?, ?)'
      ).run(
        idProp,
        nettoyer(process.env.PROPRIETAIRE_NOM, 60) || 'Propriétaire',
        'proprietaire',
        bcrypt.hashSync(mdpProp, 10)
      );
      console.log('Propriétaire créé : ' + idProp);
    }
  } else {
    console.log(
      'Aucun propriétaire : définis PROPRIETAIRE_IDENTIFIANT et PROPRIETAIRE_MOT_DE_PASSE (10 caractères minimum, lettres et chiffres).'
    );
  }
}

// ----- S'il n'y a pas de super administrateur, le plus ancien admin le devient -----
const nbSuper = db
  .prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'superadmin'")
  .get().n;

if (nbSuper === 0) {
  const premier = db
    .prepare("SELECT id, identifiant FROM utilisateurs WHERE role = 'admin' ORDER BY id LIMIT 1")
    .get();

  if (premier) {
    db.prepare("UPDATE utilisateurs SET role = 'superadmin' WHERE id = ?").run(
      premier.id
    );
    console.log(
      'Le compte "' + premier.identifiant + '" est maintenant super administrateur.'
    );
  }
}

// ----- Le vigile : vérifie le badge et le rôle -----
function lireEntete(req) {
  const entete = req.headers.authorization || '';
  return entete.startsWith('Bearer ') ? entete.slice(7) : null;
}

function controleToken(req, res, next, token) {
  if (!token) {
    return res.status(401).json({ erreur: 'Connexion requise.' });
  }

  let contenu;
  try {
    contenu = jwt.verify(token, SECRET);
  } catch (err) {
    return res
      .status(401)
      .json({ erreur: 'Session expirée. Reconnecte-toi.' });
  }

  // Le compte existe-t-il encore ? Avec quel rôle aujourd'hui ?
  const compte = db
    .prepare(
      'SELECT id, identifiant, nom, role, jeton_version FROM utilisateurs WHERE id = ?'
    )
    .get(contenu.id);

  if (!compte) {
    return res.status(401).json({ erreur: "Ce compte n'existe plus." });
  }

  // Le mot de passe a changé depuis ? Alors l'ancien badge ne vaut plus rien
  if ((contenu.v || 0) !== (compte.jeton_version || 0)) {
    return res
      .status(401)
      .json({ erreur: 'Session expirée. Reconnecte-toi.' });
  }

  req.utilisateur = compte;
  next();
}

// Pour les demandes normales : le badge est dans l'en-tête
function verifierToken(req, res, next) {
  controleToken(req, res, next, lireEntete(req));
}

// Pour les fichiers (photos, actes) : le badge peut être dans l'adresse
function verifierTokenFichier(req, res, next) {
  controleToken(req, res, next, lireEntete(req) || req.query.token);
}

// Vérifie que le rôle a le droit d'entrer
function autoriser(...roles) {
  return (req, res, next) => {
    // Le propriétaire et le super administrateur ont le droit de tout faire à l'école
    if (
      req.utilisateur.role === 'superadmin' ||
      req.utilisateur.role === 'proprietaire'
    ) {
      return next();
    }

    if (!roles.includes(req.utilisateur.role)) {
      return res.status(403).json({
        erreur: 'Accès refusé : ton rôle ne permet pas cette action.',
      });
    }
    next();
  };
}

// Réservé à UN rôle précis (par exemple le journal : propriétaire seulement)
function seulement(roleExact) {
  return (req, res, next) => {
    if (req.utilisateur.role !== roleExact) {
      return res.status(403).json({
        erreur: 'Accès refusé : ton rôle ne permet pas cette action.',
      });
    }
    next();
  };
}

const gestionnaireDeComptes = autoriser('superadmin', 'proprietaire');

// ----- La connexion -----
const tentatives = new Map();
const FAUX_HASH = bcrypt.hashSync('mot-de-passe-qui-nexiste-pas', 10);

app.post('/api/login', limiteConnexion, (req, res) => {
  const identifiant = nettoyer(req.body.identifiant, 50);
  const motDePasse = req.body.motDePasse;

  if (
    !identifiant ||
    typeof motDePasse !== 'string' ||
    motDePasse.length === 0 ||
    motDePasse.length > 200
  ) {
    return res
      .status(400)
      .json({ erreur: 'Merci de remplir ton identifiant et ton mot de passe.' });
  }

  // Protection : 5 essais ratés maximum en 10 minutes pour un même identifiant
  const cle = identifiant.toLowerCase();
  if (tentatives.size > 5000) tentatives.clear();

  let essai = tentatives.get(cle) || { n: 0, debut: Date.now() };
  if (Date.now() - essai.debut > 10 * 60 * 1000) {
    essai = { n: 0, debut: Date.now() };
  }
  if (essai.n >= 5) {
    return res.status(429).json({
      erreur: "Trop d'essais ratés. Réessaie dans quelques minutes.",
    });
  }

  const user = db
    .prepare('SELECT * FROM utilisateurs WHERE LOWER(identifiant) = ?')
    .get(cle);

  // On compare toujours un mot de passe, même si le compte n'existe pas
  const correct = bcrypt.compareSync(
    motDePasse,
    user ? user.mot_de_passe : FAUX_HASH
  );

  if (!user || !correct) {
    essai.n += 1;
    tentatives.set(cle, essai);

    journaliser(
      req,
      'Connexion échouée',
      user ? 'Mauvais mot de passe' : 'Identifiant inconnu',
      user
        ? { id: user.id, identifiant: user.identifiant, role: user.role }
        : { identifiant: 'inconnu' }
    );

    return res
      .status(401)
      .json({ erreur: 'Identifiant ou mot de passe incorrect.' });
  }

  tentatives.delete(cle);

  const utilisateur = {
    id: user.id,
    identifiant: user.identifiant,
    nom: user.nom,
    role: user.role,
  };

  journaliser(req, 'Connexion', null, utilisateur);

  res.json({ token: signerToken(user), utilisateur });
});

// ----- Changer MON mot de passe (tous les rôles) -----
app.put('/api/moi/mot-de-passe', verifierToken, (req, res) => {
  const { ancien, nouveau } = req.body;

  if (!motDePasseValide(nouveau)) {
    return res.status(400).json({ erreur: MESSAGE_MDP });
  }

  const user = db
    .prepare('SELECT * FROM utilisateurs WHERE id = ?')
    .get(req.utilisateur.id);

  if (
    !user ||
    typeof ancien !== 'string' ||
    !bcrypt.compareSync(ancien, user.mot_de_passe)
  ) {
    return res.status(400).json({ erreur: 'Ton ancien mot de passe est incorrect.' });
  }

  const version = (user.jeton_version || 0) + 1;

  db.prepare(
    'UPDATE utilisateurs SET mot_de_passe = ?, jeton_version = ? WHERE id = ?'
  ).run(bcrypt.hashSync(nouveau, 10), version, user.id);

  journaliser(req, 'Mot de passe modifié', 'Son propre compte');

  res.json({
    message: 'Mot de passe modifié',
    token: signerToken({ ...user, jeton_version: version }),
  });
});

// ----- GESTION DES COMPTES (propriétaire et super administrateur) -----
app.get('/api/utilisateurs', verifierToken, gestionnaireDeComptes, (req, res) => {
  const toutes = db
    .prepare('SELECT id, identifiant, nom, role FROM utilisateurs ORDER BY id')
    .all();

  const visibles = toutes.filter(
    (u) => u.id === req.utilisateur.id || rang(u.role) < rang(req.utilisateur.role)
  );

  res.json(visibles);
});

app.post('/api/utilisateurs', verifierToken, gestionnaireDeComptes, (req, res) => {
  const identifiant = nettoyer(req.body.identifiant, 30).toLowerCase();
  const nom = nettoyer(req.body.nom, 60);
  const role = nettoyer(req.body.role, 20);
  const motDePasse = req.body.motDePasse;

  if (!identifiant || !nom || !role || !motDePasse) {
    return res.status(400).json({ erreur: 'Merci de remplir tous les champs.' });
  }

  if (!/^[a-z0-9._-]{3,30}$/.test(identifiant)) {
    return res.status(400).json({
      erreur:
        "L'identifiant doit avoir 3 à 30 caractères (lettres, chiffres, point, tiret).",
    });
  }

  if (!RANGS[role] || rang(role) >= rang(req.utilisateur.role)) {
    return res.status(403).json({
      erreur: 'Tu ne peux pas créer un compte avec ce rôle.',
    });
  }

  if (!motDePasseValide(motDePasse)) {
    return res.status(400).json({ erreur: MESSAGE_MDP });
  }

  const existe = db
    .prepare('SELECT id FROM utilisateurs WHERE identifiant = ?')
    .get(identifiant);
  if (existe) {
    return res.status(409).json({ erreur: 'Cet identifiant est déjà utilisé.' });
  }

  db.prepare(
    'INSERT INTO utilisateurs (identifiant, nom, role, mot_de_passe) VALUES (?, ?, ?, ?)'
  ).run(identifiant, nom, role, bcrypt.hashSync(motDePasse, 10));

  journaliser(req, 'Compte créé', identifiant + ' (' + role + ')');

  res.json({ message: 'Compte créé' });
});

app.put(
  '/api/utilisateurs/:id/mot-de-passe',
  verifierToken,
  gestionnaireDeComptes,
  (req, res) => {
    const idCible = lireId(req.params.id);
    const motDePasse = req.body.motDePasse;

    if (!idCible) {
      return res.status(400).json({ erreur: 'Compte invalide.' });
    }

    if (!motDePasseValide(motDePasse)) {
      return res.status(400).json({ erreur: MESSAGE_MDP });
    }

    const cible = db
      .prepare('SELECT * FROM utilisateurs WHERE id = ?')
      .get(idCible);

    if (!cible) {
      return res.status(404).json({ erreur: 'Compte introuvable.' });
    }

    if (rang(cible.role) >= rang(req.utilisateur.role)) {
      return res.status(403).json({
        erreur:
          'Tu peux seulement gérer les comptes d\'un rang inférieur au tien. Pour ton mot de passe, utilise "Changer mon mot de passe".',
      });
    }

    db.prepare(
      'UPDATE utilisateurs SET mot_de_passe = ?, jeton_version = ? WHERE id = ?'
    ).run(
      bcrypt.hashSync(motDePasse, 10),
      (cible.jeton_version || 0) + 1,
      cible.id
    );

    journaliser(req, 'Mot de passe attribué', 'Compte : ' + cible.identifiant);

    res.json({ message: 'Mot de passe attribué' });
  }
);

app.delete(
  '/api/utilisateurs/:id',
  verifierToken,
  gestionnaireDeComptes,
  (req, res) => {
    const idCible = lireId(req.params.id);

    if (!idCible) {
      return res.status(400).json({ erreur: 'Compte invalide.' });
    }

    const cible = db
      .prepare('SELECT * FROM utilisateurs WHERE id = ?')
      .get(idCible);

    if (!cible) {
      return res.status(404).json({ erreur: 'Compte introuvable.' });
    }

    if (rang(cible.role) >= rang(req.utilisateur.role)) {
      return res.status(403).json({
        erreur: "Tu peux seulement supprimer les comptes d'un rang inférieur au tien.",
      });
    }

    db.prepare('DELETE FROM utilisateurs WHERE id = ?').run(cible.id);

    journaliser(req, 'Compte supprimé', cible.identifiant + ' (' + cible.role + ')');

    res.json({ message: 'Compte supprimé' });
  }
);

// ----- LE JOURNAL D'ACTIVITÉ (propriétaire seulement, jamais effaçable) -----
app.get('/api/journal', verifierToken, seulement('proprietaire'), (req, res) => {
  const lignes = db
    .prepare('SELECT * FROM journal ORDER BY id DESC LIMIT 500')
    .all();
  res.json(lignes);
});

// ----- L'armoire à dossiers (les fichiers envoyés) -----
const dossierUploads = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(dossierUploads)) {
  fs.mkdirSync(dossierUploads, { recursive: true });
}

const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dossierUploads),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
});

const TYPES_ACCEPTES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const upload = multer({
  storage: stockage,
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 20, fieldSize: 5000 },
  fileFilter: (req, file, cb) => {
    if (TYPES_ACCEPTES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('TYPE'));
    }
  },
});

const champsFichiers = upload.fields([
  { name: 'acte', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
  { name: 'bulletins', maxCount: 1 },
]);

// Regarde les premiers octets du fichier pour connaître son VRAI type
function typeReel(chemin) {
  try {
    const tampon = Buffer.alloc(12);
    const fd = fs.openSync(chemin, 'r');
    fs.readSync(fd, tampon, 0, 12, 0);
    fs.closeSync(fd);

    if (tampon.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
    if (
      tampon
        .slice(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'png';
    }
    if (tampon.slice(0, 4).toString('latin1') === '%PDF') return 'pdf';
    if (
      tampon.slice(0, 4).toString('latin1') === 'RIFF' &&
      tampon.slice(8, 12).toString('latin1') === 'WEBP'
    ) {
      return 'webp';
    }
  } catch (err) {
    // Fichier illisible : il sera refusé
  }
  return null;
}

const TYPES_PAR_CHAMP = {
  photo: ['jpg', 'png', 'webp'],
  acte: ['jpg', 'png', 'webp', 'pdf'],
  bulletins: ['jpg', 'png', 'webp', 'pdf'],
};

// Vérifie le vrai contenu de chaque fichier et lui donne la bonne extension
function verifierFichiers(fichiers) {
  for (const champ of Object.keys(fichiers)) {
    for (const f of fichiers[champ]) {
      const type = typeReel(f.path);

      if (!type || !TYPES_PAR_CHAMP[champ] || !TYPES_PAR_CHAMP[champ].includes(type)) {
        return false;
      }

      const nouveauChemin = f.path + '.' + type;
      fs.renameSync(f.path, nouveauChemin);
      f.path = nouveauChemin;
      f.filename = f.filename + '.' + type;
    }
  }
  return true;
}

// Les fichiers ne s'ouvrent qu'avec un badge valide
app.use(
  '/uploads',
  verifierTokenFichier,
  express.static(dossierUploads, {
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=3600');
    },
  })
);

// Supprime les fichiers reçus si le dossier est refusé
function supprimerFichiers(fichiers) {
  if (!fichiers) return;
  Object.values(fichiers).forEach((liste) => {
    liste.forEach((f) => {
      fs.unlink(f.path, () => {});
    });
  });
}

// Refuse un dossier : on jette les fichiers reçus et on répond
function refuser(res, fichiers, statut, texte) {
  supprimerFichiers(fichiers);
  return res.status(statut).json({ erreur: texte });
}

// Supprime de l'armoire les fichiers d'un étudiant (suppression définitive)
function jeterPapiers(etudiant) {
  [etudiant.acte, etudiant.photo, etudiant.bulletins].forEach((nom) => {
    if (nom) {
      fs.unlink(path.join(dossierUploads, path.basename(nom)), () => {});
    }
  });
}

// Traduit une erreur d'envoi de fichier en message clair
function messageErreurFichier(erreurUpload) {
  if (erreurUpload.code === 'LIMIT_FILE_SIZE') {
    return 'Un fichier dépasse 5 Mo.';
  }
  if (erreurUpload.message === 'TYPE') {
    return 'Seuls les images JPG, PNG, WEBP et les PDF sont acceptés.';
  }
  return "Erreur lors de l'envoi des fichiers.";
}

// Nettoie et vérifie les informations d'un étudiant (inscription ET modification)
function lireEtudiant(e) {
  const v = {
    nom: nettoyer(e.nom, 60),
    prenom: nettoyer(e.prenom, 60),
    dateNaissance: nettoyer(e.dateNaissance, 10),
    sexe: nettoyer(e.sexe, 10),
    lieuNaissance: nettoyer(e.lieuNaissance, 80),
    classe: nettoyer(e.classe, 20),
    parentNom: nettoyer(e.parentNom, 80),
    parentTel: nettoyer(e.parentTel, 25),
    parentEmail: nettoyer(e.parentEmail, 100),
  };

  if (
    !v.nom || !v.prenom || !v.classe || !v.parentNom ||
    !v.parentTel || !v.dateNaissance
  ) {
    return { erreur: 'Merci de remplir tous les champs obligatoires.' };
  }
  if (!CLASSES.includes(v.classe)) {
    return { erreur: 'Classe inconnue.' };
  }
  if (!['Masculin', 'Féminin'].includes(v.sexe)) {
    return { erreur: 'Merci de choisir le sexe.' };
  }
  if (!dateValide(v.dateNaissance)) {
    return { erreur: 'La date de naissance est invalide.' };
  }
  if (v.parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.parentEmail)) {
    return { erreur: "L'adresse e-mail est invalide." };
  }

  const chiffres = v.parentTel.replace(/\D/g, '');
  if (!/^[0-9+\s().-]{8,25}$/.test(v.parentTel) || chiffres.length < 8) {
    return { erreur: 'Le numéro de téléphone est invalide.' };
  }

  return { valeurs: v };
}

// ----- LIRE la liste des étudiants (tous les rôles) -----
app.get('/api/etudiants', verifierToken, (req, res) => {
  const lignes = db
    .prepare('SELECT * FROM etudiants WHERE supprime_le IS NULL ORDER BY id DESC')
    .all();
  res.json(lignes);
});

// ----- ENREGISTRER un étudiant (admin et secrétaire) -----
app.post(
  '/api/etudiants',
  verifierToken,
  autoriser('admin', 'secretaire'),
  (req, res) => {
    champsFichiers(req, res, (erreurUpload) => {
      if (erreurUpload) {
        return res
          .status(400)
          .json({ erreur: messageErreurFichier(erreurUpload) });
      }

      const fichiers = req.files || {};

      if (!verifierFichiers(fichiers)) {
        return refuser(
          res,
          fichiers,
          400,
          "Un fichier n'est pas valide : seules les images JPG, PNG, WEBP et les PDF sont acceptés."
        );
      }

      const lu = lireEtudiant(req.body || {});
      if (lu.erreur) {
        return refuser(res, fichiers, 400, lu.erreur);
      }
      const v = lu.valeurs;

      // Pas de doublon (corbeille comprise)
      const doublon = db
        .prepare(
          `SELECT id, supprime_le FROM etudiants
           WHERE LOWER(nom) = LOWER(?) AND LOWER(prenom) = LOWER(?)
           AND date_naissance = ?`
        )
        .get(v.nom, v.prenom, v.dateNaissance);

      if (doublon) {
        return refuser(
          res,
          fichiers,
          409,
          doublon.supprime_le
            ? 'Cet étudiant est dans la corbeille. Restaure-le depuis la page Corbeille.'
            : 'Cet étudiant est déjà inscrit.'
        );
      }

      const acte = fichiers.acte ? fichiers.acte[0].filename : null;
      const photo = fichiers.photo ? fichiers.photo[0].filename : null;
      const bulletins = fichiers.bulletins
        ? fichiers.bulletins[0].filename
        : null;

      const info = db
        .prepare(
          `INSERT INTO etudiants
           (nom, prenom, date_naissance, sexe, lieu_naissance, classe,
            parent_nom, parent_tel, parent_email, acte, photo, bulletins)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          v.nom, v.prenom, v.dateNaissance, v.sexe, v.lieuNaissance, v.classe,
          v.parentNom, v.parentTel, v.parentEmail, acte, photo, bulletins
        );

      const matricule = 'ETU' + String(info.lastInsertRowid).padStart(3, '0');
      db.prepare('UPDATE etudiants SET matricule = ? WHERE id = ?').run(
        matricule,
        info.lastInsertRowid
      );

      journaliser(req, 'Étudiant inscrit', v.nom + ' ' + v.prenom + ' (' + matricule + ')');

      res.json({ message: 'Étudiant enregistré', matricule });
    });
  }
);

// ----- MODIFIER un étudiant (admin et secrétaire) -----
app.put(
  '/api/etudiants/:id',
  verifierToken,
  autoriser('admin', 'secretaire'),
  (req, res) => {
    const id = lireId(req.params.id);
    if (!id) {
      return res.status(400).json({ erreur: 'Étudiant invalide.' });
    }

    const existant = db
      .prepare('SELECT * FROM etudiants WHERE id = ? AND supprime_le IS NULL')
      .get(id);
    if (!existant) {
      return res.status(404).json({ erreur: 'Étudiant introuvable.' });
    }

    const lu = lireEtudiant(req.body || {});
    if (lu.erreur) {
      return res.status(400).json({ erreur: lu.erreur });
    }
    const v = lu.valeurs;

    const doublon = db
      .prepare(
        `SELECT id FROM etudiants
         WHERE LOWER(nom) = LOWER(?) AND LOWER(prenom) = LOWER(?)
         AND date_naissance = ? AND id != ?`
      )
      .get(v.nom, v.prenom, v.dateNaissance, id);
    if (doublon) {
      return res
        .status(409)
        .json({ erreur: 'Un autre étudiant a déjà ce nom et cette date de naissance.' });
    }

    db.prepare(
      `UPDATE etudiants SET nom = ?, prenom = ?, date_naissance = ?, sexe = ?,
       lieu_naissance = ?, classe = ?, parent_nom = ?, parent_tel = ?, parent_email = ?
       WHERE id = ?`
    ).run(
      v.nom, v.prenom, v.dateNaissance, v.sexe, v.lieuNaissance, v.classe,
      v.parentNom, v.parentTel, v.parentEmail, id
    );

    journaliser(
      req,
      'Étudiant modifié',
      v.nom + ' ' + v.prenom + ' (' + existant.matricule + ')'
    );

    res.json({ message: 'Étudiant modifié' });
  }
);

// ----- REMPLACER les documents d'un étudiant (admin et secrétaire) -----
app.put(
  '/api/etudiants/:id/documents',
  verifierToken,
  autoriser('admin', 'secretaire'),
  (req, res) => {
    champsFichiers(req, res, (erreurUpload) => {
      if (erreurUpload) {
        return res
          .status(400)
          .json({ erreur: messageErreurFichier(erreurUpload) });
      }

      const fichiers = req.files || {};
      const id = lireId(req.params.id);

      if (!id) {
        return refuser(res, fichiers, 400, 'Étudiant invalide.');
      }

      if (Object.keys(fichiers).length === 0) {
        return res.status(400).json({ erreur: 'Aucun fichier choisi.' });
      }

      if (!verifierFichiers(fichiers)) {
        return refuser(
          res,
          fichiers,
          400,
          "Un fichier n'est pas valide : seules les images JPG, PNG, WEBP et les PDF sont acceptés."
        );
      }

      const etudiant = db
        .prepare('SELECT * FROM etudiants WHERE id = ? AND supprime_le IS NULL')
        .get(id);

      if (!etudiant) {
        return refuser(res, fichiers, 404, 'Étudiant introuvable.');
      }

      // On garde les anciens documents, sauf ceux qu'on remplace
      const documents = {
        acte: etudiant.acte,
        photo: etudiant.photo,
        bulletins: etudiant.bulletins,
      };
      const anciens = [];
      const remplaces = [];

      ['acte', 'photo', 'bulletins'].forEach((champ) => {
        if (fichiers[champ]) {
          if (etudiant[champ]) anciens.push(etudiant[champ]);
          documents[champ] = fichiers[champ][0].filename;
          remplaces.push(champ);
        }
      });

      db.prepare(
        'UPDATE etudiants SET acte = ?, photo = ?, bulletins = ? WHERE id = ?'
      ).run(documents.acte, documents.photo, documents.bulletins, id);

      // Les anciens fichiers remplacés sont jetés de l'armoire
      anciens.forEach((nom) => {
        fs.unlink(path.join(dossierUploads, path.basename(nom)), () => {});
      });

      journaliser(
        req,
        'Documents modifiés',
        etudiant.nom + ' ' + etudiant.prenom + ' : ' + remplaces.join(', ')
      );

      res.json({ message: 'Documents modifiés' });
    });
  }
);

// ----- METTRE un étudiant à la corbeille (admin) -----
app.delete(
  '/api/etudiants/:id',
  verifierToken,
  autoriser('admin'),
  (req, res) => {
    const id = lireId(req.params.id);
    if (!id) {
      return res.status(400).json({ erreur: 'Étudiant invalide.' });
    }

    const etudiant = db
      .prepare('SELECT * FROM etudiants WHERE id = ? AND supprime_le IS NULL')
      .get(id);
    if (!etudiant) {
      return res.status(404).json({ erreur: 'Étudiant introuvable.' });
    }

    db.prepare("UPDATE etudiants SET supprime_le = datetime('now') WHERE id = ?").run(id);

    journaliser(
      req,
      'Étudiant supprimé (corbeille)',
      etudiant.nom + ' ' + etudiant.prenom + ' (' + etudiant.matricule + ')'
    );

    res.json({ message: 'Étudiant mis à la corbeille' });
  }
);

// ----- METTRE TOUS les étudiants à la corbeille (admin) -----
app.delete('/api/etudiants', verifierToken, autoriser('admin'), (req, res) => {
  const resultat = db
    .prepare("UPDATE etudiants SET supprime_le = datetime('now') WHERE supprime_le IS NULL")
    .run();

  journaliser(
    req,
    'Tous les étudiants supprimés (corbeille)',
    resultat.changes + ' étudiant(s)'
  );

  res.json({ message: 'Tous les étudiants ont été mis à la corbeille' });
});

// ----- LIRE la liste des notes (tous les rôles) -----
app.get('/api/notes', verifierToken, (req, res) => {
  const lignes = db
    .prepare('SELECT * FROM notes WHERE supprime_le IS NULL ORDER BY id DESC')
    .all();
  res.json(lignes);
});

// Nettoie les informations académiques (classe, matière...)
function lireInfos(infos) {
  if (!infos || typeof infos !== 'object') return null;

  const propre = {
    filiere: nettoyer(infos.filiere, 60),
    niveau: nettoyer(infos.niveau, 60),
    classe: nettoyer(infos.classe, 20),
    matiere: nettoyer(infos.matiere, 80),
    semestre: nettoyer(infos.semestre, 40),
    evaluation: nettoyer(infos.evaluation, 60),
  };

  if (
    !propre.filiere || !propre.niveau || !propre.matiere ||
    !propre.semestre || !propre.evaluation || !CLASSES.includes(propre.classe)
  ) {
    return null;
  }

  return propre;
}

// ----- ENREGISTRER les notes (admin et enseignant) -----
app.post(
  '/api/notes',
  verifierToken,
  autoriser('admin', 'enseignant'),
  (req, res) => {
    const infos = lireInfos(req.body.infos);
    const liste = req.body.etudiants;

    if (!infos) {
      return res
        .status(400)
        .json({ erreur: 'Les informations académiques sont incomplètes.' });
    }

    if (!Array.isArray(liste) || liste.length === 0 || liste.length > 500) {
      return res
        .status(400)
        .json({ erreur: 'Aucun étudiant à enregistrer.' });
    }

    const lignes = [];

    for (const etu of liste) {
      const nom = nettoyer(etu && etu.nom, 100);
      const matricule = nettoyer(etu && etu.matricule, 20);

      if (!nom) {
        return res
          .status(400)
          .json({ erreur: 'Chaque étudiant doit avoir un nom.' });
      }
      if (etu.note === '' || etu.note === null || etu.note === undefined) {
        return res
          .status(400)
          .json({ erreur: 'La note de ' + nom + ' est vide.' });
      }

      const note = Number(etu.note);
      if (!Number.isFinite(note) || note < 0 || note > 20) {
        return res.status(400).json({
          erreur: 'La note de ' + nom + ' doit être entre 0 et 20.',
        });
      }

      const coef = Number(etu.coef);
      if (!Number.isFinite(coef) || coef < 1 || coef > 20) {
        return res.status(400).json({
          erreur: 'Le coefficient de ' + nom + ' doit être entre 1 et 20.',
        });
      }

      lignes.push({ matricule, nom, note, coef });
    }

    const ajouter = db.prepare(`
      INSERT INTO notes
      (matricule, nom, filiere, niveau, classe, matiere, semestre, evaluation, note, coef)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const toutRanger = db.transaction((lesLignes) => {
      for (const l of lesLignes) {
        ajouter.run(
          l.matricule, l.nom, infos.filiere, infos.niveau, infos.classe,
          infos.matiere, infos.semestre, infos.evaluation, l.note, l.coef
        );
      }
    });

    toutRanger(lignes);

    journaliser(
      req,
      'Notes enregistrées',
      infos.classe + ' · ' + infos.matiere + ' · ' + lignes.length + ' note(s)'
    );

    res.json({ message: 'Notes enregistrées' });
  }
);

// ----- METTRE PLUSIEURS notes à la corbeille d'un coup (admin) -----
app.post(
  '/api/notes/corbeille-lot',
  verifierToken,
  autoriser('admin'),
  (req, res) => {
    const ids = req.body.ids;

    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 2000) {
      return res.status(400).json({ erreur: 'Aucune note à supprimer.' });
    }

    const propres = ids.map(lireId).filter(Boolean);
    if (propres.length === 0) {
      return res.status(400).json({ erreur: 'Aucune note valide.' });
    }

    const mettre = db.prepare(
      "UPDATE notes SET supprime_le = datetime('now') WHERE id = ? AND supprime_le IS NULL"
    );

    const toutMettre = db.transaction((liste) => {
      let compteur = 0;
      for (const id of liste) {
        compteur += mettre.run(id).changes;
      }
      return compteur;
    });

    const nombre = toutMettre(propres);

    journaliser(req, 'Notes supprimées (corbeille)', nombre + ' note(s) d\'un coup');

    res.json({ message: 'Notes mises à la corbeille', nombre });
  }
);

// ----- MODIFIER une note (admin et enseignant) -----
app.put(
  '/api/notes/:id',
  verifierToken,
  autoriser('admin', 'enseignant'),
  (req, res) => {
    const id = lireId(req.params.id);
    if (!id) {
      return res.status(400).json({ erreur: 'Note invalide.' });
    }

    const n = db
      .prepare('SELECT * FROM notes WHERE id = ? AND supprime_le IS NULL')
      .get(id);
    if (!n) {
      return res.status(404).json({ erreur: 'Note introuvable.' });
    }

    // Une note publiée : seule la direction (admin) peut la changer
    if (n.publie && req.utilisateur.role === 'enseignant') {
      return res.status(403).json({
        erreur: 'Cette note est publiée : seul un administrateur peut la modifier.',
      });
    }

    const note = Number(req.body.note);
    if (req.body.note === '' || !Number.isFinite(note) || note < 0 || note > 20) {
      return res.status(400).json({ erreur: 'La note doit être entre 0 et 20.' });
    }

    const coef = Number(req.body.coef);
    if (!Number.isFinite(coef) || coef < 1 || coef > 20) {
      return res.status(400).json({ erreur: 'Le coefficient doit être entre 1 et 20.' });
    }

    db.prepare('UPDATE notes SET note = ?, coef = ? WHERE id = ?').run(note, coef, id);

    journaliser(
      req,
      'Note modifiée',
      n.nom + ' · ' + n.matiere + ' : ' + n.note + ' → ' + note
    );

    res.json({ message: 'Note modifiée' });
  }
);

// ----- METTRE une note à la corbeille (admin et enseignant) -----
app.delete(
  '/api/notes/:id',
  verifierToken,
  autoriser('admin', 'enseignant'),
  (req, res) => {
    const id = lireId(req.params.id);
    if (!id) {
      return res.status(400).json({ erreur: 'Note invalide.' });
    }

    const n = db
      .prepare('SELECT * FROM notes WHERE id = ? AND supprime_le IS NULL')
      .get(id);
    if (!n) {
      return res.status(404).json({ erreur: 'Note introuvable.' });
    }

    if (n.publie && req.utilisateur.role === 'enseignant') {
      return res.status(403).json({
        erreur: 'Cette note est publiée : seul un administrateur peut la supprimer.',
      });
    }

    db.prepare("UPDATE notes SET supprime_le = datetime('now') WHERE id = ?").run(id);

    journaliser(
      req,
      'Note supprimée (corbeille)',
      n.nom + ' · ' + n.matiere + ' · ' + n.note + '/20'
    );

    res.json({ message: 'Note mise à la corbeille' });
  }
);

// ----- PUBLIER les notes d'une classe (admin et enseignant) -----
app.post(
  '/api/notes/publier',
  verifierToken,
  autoriser('admin', 'enseignant'),
  (req, res) => {
    const infos = lireInfos(req.body.infos);

    if (!infos) {
      return res.status(400).json({ erreur: 'Informations manquantes.' });
    }

    const resultat = db
      .prepare(
        `UPDATE notes SET publie = 1
         WHERE classe = ? AND matiere = ? AND semestre = ? AND evaluation = ?
         AND supprime_le IS NULL`
      )
      .run(infos.classe, infos.matiere, infos.semestre, infos.evaluation);

    if (resultat.changes === 0) {
      return res.status(404).json({
        erreur:
          "Aucune note enregistrée pour cette classe. Enregistre d'abord les notes.",
      });
    }

    journaliser(req, 'Notes publiées', infos.classe + ' · ' + infos.matiere);

    res.json({ message: 'Notes publiées', nombre: resultat.changes });
  }
);

// ----- LA CORBEILLE -----
// Voir ce qui a été supprimé (admin)
app.get('/api/corbeille', verifierToken, autoriser('admin'), (req, res) => {
  const etudiants = db
    .prepare('SELECT * FROM etudiants WHERE supprime_le IS NOT NULL ORDER BY supprime_le DESC')
    .all();
  const notes = db
    .prepare('SELECT * FROM notes WHERE supprime_le IS NOT NULL ORDER BY supprime_le DESC')
    .all();

  res.json({ etudiants, notes, delaiJours: DELAI_CORBEILLE_JOURS });
});

// Restaurer un étudiant (admin)
app.post(
  '/api/corbeille/etudiants/:id/restaurer',
  verifierToken,
  autoriser('admin'),
  (req, res) => {
    const id = lireId(req.params.id);
    if (!id) {
      return res.status(400).json({ erreur: 'Étudiant invalide.' });
    }

    const e = db
      .prepare('SELECT * FROM etudiants WHERE id = ? AND supprime_le IS NOT NULL')
      .get(id);
    if (!e) {
      return res.status(404).json({ erreur: 'Introuvable dans la corbeille.' });
    }

    db.prepare('UPDATE etudiants SET supprime_le = NULL WHERE id = ?').run(id);

    journaliser(req, 'Étudiant restauré', e.nom + ' ' + e.prenom + ' (' + e.matricule + ')');

    res.json({ message: 'Étudiant restauré' });
  }
);

// Restaurer une note (admin)
app.post(
  '/api/corbeille/notes/:id/restaurer',
  verifierToken,
  autoriser('admin'),
  (req, res) => {
    const id = lireId(req.params.id);
    if (!id) {
      return res.status(400).json({ erreur: 'Note invalide.' });
    }

    const n = db
      .prepare('SELECT * FROM notes WHERE id = ? AND supprime_le IS NOT NULL')
      .get(id);
    if (!n) {
      return res.status(404).json({ erreur: 'Introuvable dans la corbeille.' });
    }

    db.prepare('UPDATE notes SET supprime_le = NULL WHERE id = ?').run(id);

    journaliser(req, 'Note restaurée', n.nom + ' · ' + n.matiere);

    res.json({ message: 'Note restaurée' });
  }
);

// Supprimer DÉFINITIVEMENT un étudiant (direction et propriétaire seulement)
app.delete(
  '/api/corbeille/etudiants/:id',
  verifierToken,
  autoriser('superadmin'),
  (req, res) => {
    const id = lireId(req.params.id);
    if (!id) {
      return res.status(400).json({ erreur: 'Étudiant invalide.' });
    }

    const e = db
      .prepare('SELECT * FROM etudiants WHERE id = ? AND supprime_le IS NOT NULL')
      .get(id);
    if (!e) {
      return res.status(404).json({ erreur: 'Introuvable dans la corbeille.' });
    }

    jeterPapiers(e);
    db.prepare('DELETE FROM etudiants WHERE id = ?').run(id);

    journaliser(
      req,
      'Étudiant supprimé définitivement',
      e.nom + ' ' + e.prenom + ' (' + e.matricule + ')'
    );

    res.json({ message: 'Étudiant supprimé définitivement' });
  }
);

// Supprimer DÉFINITIVEMENT une note (direction et propriétaire seulement)
app.delete(
  '/api/corbeille/notes/:id',
  verifierToken,
  autoriser('superadmin'),
  (req, res) => {
    const id = lireId(req.params.id);
    if (!id) {
      return res.status(400).json({ erreur: 'Note invalide.' });
    }

    const n = db
      .prepare('SELECT * FROM notes WHERE id = ? AND supprime_le IS NOT NULL')
      .get(id);
    if (!n) {
      return res.status(404).json({ erreur: 'Introuvable dans la corbeille.' });
    }

    db.prepare('DELETE FROM notes WHERE id = ?').run(id);

    journaliser(req, 'Note supprimée définitivement', n.nom + ' · ' + n.matiere);

    res.json({ message: 'Note supprimée définitivement' });
  }
);

// VIDER la corbeille (direction et propriétaire seulement)
app.delete('/api/corbeille', verifierToken, autoriser('superadmin'), (req, res) => {
  const etudiants = db
    .prepare('SELECT * FROM etudiants WHERE supprime_le IS NOT NULL')
    .all();
  etudiants.forEach(jeterPapiers);
  db.prepare('DELETE FROM etudiants WHERE supprime_le IS NOT NULL').run();

  const notes = db
    .prepare('DELETE FROM notes WHERE supprime_le IS NOT NULL')
    .run();

  journaliser(
    req,
    'Corbeille vidée définitivement',
    etudiants.length + ' étudiant(s), ' + notes.changes + ' note(s)'
  );

  res.json({ message: 'Corbeille vidée' });
});

// ----- LE CONCIERGE : vide tout seul ce qui est dans la corbeille depuis trop longtemps -----
function nettoyerCorbeille() {
  try {
    const limite = '-' + DELAI_CORBEILLE_JOURS + ' days';

    const vieux = db
      .prepare(
        "SELECT * FROM etudiants WHERE supprime_le IS NOT NULL AND supprime_le < datetime('now', ?)"
      )
      .all(limite);

    vieux.forEach(jeterPapiers);

    const etudiants = db
      .prepare(
        "DELETE FROM etudiants WHERE supprime_le IS NOT NULL AND supprime_le < datetime('now', ?)"
      )
      .run(limite);

    const notes = db
      .prepare(
        "DELETE FROM notes WHERE supprime_le IS NOT NULL AND supprime_le < datetime('now', ?)"
      )
      .run(limite);

    if (etudiants.changes > 0 || notes.changes > 0) {
      journaliser(
        {},
        'Corbeille nettoyée automatiquement',
        etudiants.changes + ' étudiant(s) et ' + notes.changes +
          ' note(s) de plus de ' + DELAI_CORBEILLE_JOURS + ' jours',
        { identifiant: 'système', role: 'système' }
      );
    }
  } catch (err) {
    console.error('Nettoyage de la corbeille :', err.message);
  }
}

// Au démarrage, puis une fois par jour
nettoyerCorbeille();
setInterval(nettoyerCorbeille, 24 * 60 * 60 * 1000);

// ----- Les chiffres du dashboard (tous les rôles) -----
app.get('/api/stats', verifierToken, (req, res) => {
  const etudiants = db
    .prepare('SELECT COUNT(*) AS n FROM etudiants WHERE supprime_le IS NULL')
    .get().n;
  const classes = db
    .prepare(
      'SELECT COUNT(DISTINCT classe) AS n FROM etudiants WHERE supprime_le IS NULL'
    )
    .get().n;
  const notes = db
    .prepare('SELECT COUNT(*) AS n FROM notes WHERE supprime_le IS NULL')
    .get().n;
  const moy = db
    .prepare('SELECT AVG(note) AS m FROM notes WHERE supprime_le IS NULL')
    .get().m;

  res.json({
    etudiants,
    classes,
    notes,
    moyenne: moy ? moy.toFixed(1) : '0',
  });
});

// ----- Le site React (après "npm run build") -----
const dossierSite = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dossierSite)) {
  app.use(express.static(dossierSite));

  app.use((req, res, next) => {
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads')
    ) {
      return next();
    }
    res.sendFile(path.join(dossierSite, 'index.html'));
  });
}

// ----- Les erreurs : on ne révèle jamais les détails du serveur -----
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ erreur: 'Données invalides.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ erreur: 'Données trop volumineuses.' });
  }

  console.error(err);
  res.status(500).json({ erreur: 'Erreur du serveur.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Serveur démarré sur le port ' + PORT);
});
