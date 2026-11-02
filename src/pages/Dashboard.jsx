

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FaBell,
  FaUserGraduate,
  FaBookOpen,
  FaClipboardCheck,
  FaChartLine,
  FaCheckCircle,
  FaExclamationCircle,
  FaUserPlus,
  FaEdit,
  FaUsers,
  FaListAlt,
  FaArrowRight,
} from 'react-icons/fa';
import { SERVEUR, getUtilisateur, urlFichier } from '../auth';
import '../Dashboard.css';

// Un chiffre qui compte de 0 jusqu'à sa vraie valeur
function Chiffre({ valeur, decimales = 0 }) {
  const [affiche, setAffiche] = useState(0);

  useEffect(() => {
    if (valeur === null) return;

    const cible = Number(valeur) || 0;
    const total = 30;
    let etape = 0;

    const minuteur = setInterval(() => {
      etape += 1;
      setAffiche((cible * etape) / total);
      if (etape >= total) clearInterval(minuteur);
    }, 25);

    return () => clearInterval(minuteur);
  }, [valeur]);

  if (valeur === null) return <>-</>;
  return <>{affiche.toFixed(decimales).replace('.', ',')}</>;
}

// Transforme une liste de nombres en dessin de courbe douce
function construireCourbe(valeurs) {
  const n = valeurs.length;
  const largeur = 400;
  const bas = 150;
  const haut = 20;
  const max = Math.max(1, ...valeurs);

  // Un point par mois, au milieu de sa colonne
  const points = valeurs.map((v, i) => ({
    x: ((i + 0.5) * largeur) / n,
    y: bas - (v / max) * (bas - haut),
  }));

  // Le trait : on relie les points par des courbes
  let trait = 'M ' + points[0].x + ' ' + points[0].y;
  for (let i = 1; i < n; i++) {
    const milieu = (points[i - 1].x + points[i].x) / 2;
    trait +=
      ' C ' + milieu + ' ' + points[i - 1].y +
      ', ' + milieu + ' ' + points[i].y +
      ', ' + points[i].x + ' ' + points[i].y;
  }

  // La zone colorée sous le trait
  const zone =
    trait + ' L ' + points[n - 1].x + ' ' + bas + ' L ' + points[0].x + ' ' + bas + ' Z';

  return { points, trait, zone };
}

// "2026-10-27 08:30:00" devient "27 oct."
function formaterDate(texte) {
  if (!texte) return '';
  const date = new Date(texte.replace(' ', 'T') + 'Z');
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function Dashboard() {
  const utilisateur = getUtilisateur();
  const role = utilisateur ? utilisateur.role : '';

  const [etudiants, setEtudiants] = useState([]);
  const [notes, setNotes] = useState([]);
  const [erreur, setErreur] = useState('');

  // Au chargement : on va chercher les étudiants et les notes
  useEffect(() => {
    Promise.all([
      fetch(SERVEUR + '/api/etudiants').then((r) => r.json()),
      fetch(SERVEUR + '/api/notes').then((r) => r.json()),
    ])
      .then(([listeEtudiants, listeNotes]) => {
        if (Array.isArray(listeEtudiants)) setEtudiants(listeEtudiants);
        if (Array.isArray(listeNotes)) setNotes(listeNotes);
      })
      .catch(() => {
        setErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
      });
  }, []);

  // ----- La date et le salut -----
  const maintenant = new Date();
  const salut = maintenant.getHours() < 18 ? 'Bonjour' : 'Bonsoir';
  const jourSemaine = maintenant.toLocaleDateString('fr-FR', { weekday: 'long' });
  const numero = maintenant.getDate();
  const nomMois = maintenant.toLocaleDateString('fr-FR', { month: 'long' });

  // ----- Les chiffres -----
  // Set = une liste sans doublons : on compte les classes différentes
  const nbClasses = new Set(etudiants.map((e) => e.classe)).size;

  let totalPoints = 0;
  let totalCoef = 0;
  let reussites = 0;

  notes.forEach((n) => {
    const coef = Number(n.coef) || 1;
    totalPoints += Number(n.note) * coef;
    totalCoef += coef;
    if (Number(n.note) >= 10) reussites += 1;
  });

  const moyenne = totalCoef > 0 ? totalPoints / totalCoef : null;
  const tauxReussite =
    notes.length > 0 ? Math.round((reussites * 100) / notes.length) : 0;

  const stats = [
    { titre: 'Étudiants inscrits', valeur: etudiants.length, decimales: 0, icone: <FaUserGraduate /> },
    { titre: 'Classes', valeur: nbClasses, decimales: 0, icone: <FaBookOpen /> },
    { titre: 'Notes saisies', valeur: notes.length, decimales: 0, icone: <FaClipboardCheck /> },
    { titre: 'Moyenne générale', valeur: moyenne, decimales: 1, icone: <FaChartLine /> },
  ];

  // ----- Les inscriptions des 6 derniers mois -----
  const mois = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    const cle = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const nb = etudiants.filter(
      (e) => (e.date_inscription || '').slice(0, 7) === cle
    ).length;

    mois.push({
      nom: d.toLocaleDateString('fr-FR', { month: 'short' }),
      nb: nb,
    });
  }
  const totalMois = mois.reduce((somme, m) => somme + m.nb, 0);
  const courbe = construireCourbe(mois.map((m) => m.nb));

  // ----- Les étudiants par classe -----
  const compteClasses = {};
  etudiants.forEach((e) => {
    compteClasses[e.classe] = (compteClasses[e.classe] || 0) + 1;
  });

  const classes = Object.keys(compteClasses)
    .map((nom) => ({ nom: nom, nb: compteClasses[nom] }))
    .sort((a, b) => b.nb - a.nb)
    .slice(0, 6);

  const maxClasse = classes.length > 0 ? classes[0].nb : 1;

  // ----- Les 5 dernières inscriptions (la liste est déjà du plus récent au plus ancien) -----
  const derniers = etudiants.slice(0, 5);

  // ----- La liste "À faire" (vraie) -----
  const brouillons = notes.filter((n) => !n.publie).length;
  const sansActe = etudiants.filter((e) => !e.acte).length;
  const sansPhoto = etudiants.filter((e) => !e.photo).length;

  const taches = [
    {
      texte:
        brouillons === 0
          ? 'Toutes les notes sont publiées'
          : brouillons + ' note(s) en brouillon à publier',
      fait: brouillons === 0,
    },
    {
      texte:
        sansActe === 0
          ? "Tous les actes de naissance sont fournis"
          : sansActe + " étudiant(s) sans acte de naissance",
      fait: sansActe === 0,
    },
    {
      texte:
        sansPhoto === 0
          ? "Toutes les photos d'identité sont fournies"
          : sansPhoto + " étudiant(s) sans photo d'identité",
      fait: sansPhoto === 0,
    },
  ];
  const aFaire = taches.filter((t) => !t.fait).length;

  // ----- Les actions rapides selon le rôle -----
  const toutesActions = [
    { texte: 'Inscrire un étudiant', lien: '/inscription', icone: <FaUserPlus />,
      roles: ['admin', 'secretaire'] },
    { texte: 'Saisir des notes', lien: '/notes', icone: <FaEdit />,
      roles: ['admin', 'enseignant'] },
    { texte: 'Voir les étudiants', lien: '/etudiants', icone: <FaUsers />,
      roles: ['admin', 'secretaire', 'enseignant'] },
    { texte: 'Voir les notes', lien: '/liste-notes', icone: <FaListAlt />,
      roles: ['admin', 'secretaire', 'enseignant'] },
  ];
  const actions = toutesActions.filter((a) => a.roles.includes(role));
  const principale = actions[0];

  return (
    <div className="dashboard">
      {/* Barre du haut */}
      <div className="db-haut">
        <div className="db-titre">
          <h1>Tableau de bord</h1>
          <p>Année scolaire 2026-2027</p>
        </div>

        <div className="db-outils">
          <div
            className={aFaire > 0 ? 'db-cloche sonne' : 'db-cloche'}
            title={aFaire + ' chose(s) à faire'}
          >
            <FaBell />
            {aFaire > 0 && <span className="db-badge">{aFaire}</span>}
          </div>

          <Link to="/comptes" className="db-profil">
            <span className="db-avatar">
              {((utilisateur && utilisateur.nom) || '?')[0]}
            </span>
            <span className="db-profil-nom">
              {utilisateur ? utilisateur.nom : ''}
            </span>
          </Link>
        </div>
      </div>

      {erreur && <div className="db-erreur">{erreur}</div>}

      {/* Accueil + date */}
      <div className="db-accueil">
        <div className="db-bienvenue">
          <h2>
            {salut}, {utilisateur ? utilisateur.nom : ''}
          </h2>
          <p>
            {etudiants.length === 0
              ? "Ton école est prête. Commence par inscrire ton premier étudiant."
              : 'Voici le résumé de ton école : ' +
                etudiants.length +
                ' étudiant(s) inscrit(s).'}
          </p>
          {principale && (
            <Link to={principale.lien} className="db-bouton">
              {principale.texte} <FaArrowRight />
            </Link>
          )}
        </div>

        <div className="db-date">
          <small>{jourSemaine}</small>
          <strong>{numero}</strong>
          <small>{nomMois}</small>
        </div>
      </div>

      {/* Les 4 chiffres */}
      <div className="db-stats">
        {stats.map((s) => (
          <div className="db-stat" key={s.titre}>
            <div className="db-stat-icone">{s.icone}</div>
            <div>
              <strong>
                <Chiffre valeur={s.valeur} decimales={s.decimales} />
              </strong>
              <small>{s.titre}</small>
            </div>
          </div>
        ))}
      </div>

      {/* Courbe + anneau */}
      <div className="db-milieu">
        <div className="db-carte">
          <h3>Inscriptions des 6 derniers mois</h3>

          {totalMois === 0 ? (
            <p className="db-vide">Aucune inscription sur cette période.</p>
          ) : (
            <>
              <svg viewBox="0 0 400 170" className="db-courbe">
                <defs>
                  <linearGradient id="db-degrade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path className="db-zone" d={courbe.zone} fill="url(#db-degrade)" />
                <path
                  className="db-trait"
                  pathLength="1"
                  d={courbe.trait}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                {courbe.points.map((p, i) => (
                  <circle
                    key={i}
                    className="db-point"
                    cx={p.x}
                    cy={p.y}
                    r="6"
                    style={{ animationDelay: 0.6 + i * 0.15 + 's' }}
                  />
                ))}
              </svg>

              <div className="db-mois">
                {mois.map((m, i) => (
                  <div key={i}>
                    <strong>{m.nb}</strong>
                    <span>{m.nom}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="db-carte db-centre">
          <h3>Taux de réussite</h3>

          {notes.length === 0 ? (
            <p className="db-vide">Aucune note enregistrée pour le moment.</p>
          ) : (
            <>
              <div
                className="db-anneau"
                style={{
                  background:
                    'conic-gradient(#2563eb ' + tauxReussite + '%, #dbeafe 0)',
                }}
              >
                <div className="db-anneau-centre">{tauxReussite}%</div>
              </div>
              <p className="db-legende">
                {reussites} note(s) sur {notes.length} sont de 10 ou plus
              </p>
            </>
          )}
        </div>
      </div>

      {/* Classes + dernières inscriptions */}
      <div className="db-bas">
        <div className="db-carte">
          <h3>Étudiants par classe</h3>

          {classes.length === 0 ? (
            <p className="db-vide">Aucun étudiant inscrit.</p>
          ) : (
            classes.map((c) => (
              <div className="db-classe" key={c.nom}>
                <span className="db-classe-nom">{c.nom}</span>
                <div className="db-piste">
                  <div
                    className="db-remplissage"
                    style={{ width: (c.nb * 100) / maxClasse + '%' }}
                  ></div>
                </div>
                <strong>{c.nb}</strong>
              </div>
            ))
          )}
        </div>

        <div className="db-carte">
          <h3>Dernières inscriptions</h3>

          {derniers.length === 0 ? (
            <p className="db-vide">Aucune inscription pour le moment.</p>
          ) : (
            derniers.map((e) => (
              <div className="db-ligne" key={e.id}>
                {e.photo ? (
                  <img
                    className="db-photo"
                    src={urlFichier(e.photo)}
                    alt={e.nom}
                  />
                ) : (
                  <span className="db-photo db-lettre">
                    {(e.nom || '?')[0]}
                  </span>
                )}
                <div className="db-ligne-texte">
                  <strong>
                    {e.nom} {e.prenom}
                  </strong>
                  <small>{e.classe}</small>
                </div>
                <small className="db-ligne-date">
                  {formaterDate(e.date_inscription)}
                </small>
              </div>
            ))
          )}
        </div>
      </div>

      {/* À faire + actions rapides */}
      <div className="db-bas">
        <div className="db-carte">
          <h3>À faire</h3>
          {taches.map((t) => (
            <div className={t.fait ? 'db-tache fait' : 'db-tache'} key={t.texte}>
              {t.fait ? <FaCheckCircle /> : <FaExclamationCircle />}
              <p>{t.texte}</p>
            </div>
          ))}
        </div>

        <div className="db-carte">
          <h3>Actions rapides</h3>
          <div className="db-actions">
            {actions.map((a) => (
              <Link to={a.lien} className="db-action" key={a.texte}>
                {a.icone}
                <span>{a.texte}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
