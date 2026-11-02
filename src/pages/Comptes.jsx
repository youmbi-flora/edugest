import { useState, useEffect } from 'react';
import {
  FaKey,
  FaUserPlus,
  FaUsers,
  FaTrash,
  FaCheckCircle,
  FaInfoCircle,
} from 'react-icons/fa';
import { SERVEUR, getUtilisateur, remplacerToken } from '../auth';
import '../Inscription.css';
import '../GestionNotes.css';
import '../Listes.css';
import '../Comptes.css';

const nomsRoles = {
  proprietaire: 'Propriétaire',
  superadmin: 'Super administrateur',
  admin: 'Administrateur',
  secretaire: 'Secrétaire',
  enseignant: 'Enseignant',
};

// Le rang de chaque rôle : on gère seulement les rôles en dessous du sien
const RANGS = {
  proprietaire: 4,
  superadmin: 3,
  admin: 2,
  secretaire: 1,
  enseignant: 1,
};

// Envoie des données en JSON au serveur
function envoyer(chemin, methode, corps) {
  return fetch(SERVEUR + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
}

function Comptes() {
  const moi = getUtilisateur();
  const peutGererLesComptes = moi && moi.superAdmin;
  const monRang = moi && moi.proprietaire ? 4 : 3;

  let monRole = nomsRoles[moi.role];
  if (moi.superAdmin) monRole = nomsRoles.superadmin;
  if (moi.proprietaire) monRole = nomsRoles.proprietaire;

  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [comptes, setComptes] = useState([]);

  const [mdp, setMdp] = useState({ ancien: '', nouveau: '', confirmation: '' });
  const [nouveauCompte, setNouveauCompte] = useState({
    identifiant: '',
    nom: '',
    role: 'admin',
    motDePasse: '',
  });

  // Message vert (et efface le rouge)
  const afficherMessage = (texte) => {
    setErreur('');
    setMessage(texte);
    setTimeout(() => setMessage(''), 3500);
  };

  // Message rouge (et efface le vert)
  const afficherErreur = (texte) => {
    setMessage('');
    setErreur(texte);
    setTimeout(() => setErreur(''), 5000);
  };

  const chargerComptes = () => {
    if (!peutGererLesComptes) return;
    fetch(SERVEUR + '/api/utilisateurs')
      .then((reponse) => reponse.json())
      .then((donnees) => {
        if (Array.isArray(donnees)) setComptes(donnees);
      })
      .catch(() => {
        afficherErreur('Le serveur ne répond pas.');
      });
  };

  useEffect(() => {
    chargerComptes();
  }, []);

  // ----- Changer MON mot de passe -----
  const changerMonMotDePasse = async (e) => {
    e.preventDefault();

    if (mdp.nouveau !== mdp.confirmation) {
      afficherErreur('Les deux nouveaux mots de passe ne sont pas identiques.');
      return;
    }

    try {
      const reponse = await envoyer('/api/moi/mot-de-passe', 'PUT', {
        ancien: mdp.ancien,
        nouveau: mdp.nouveau,
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      // Le serveur donne un nouveau badge : on le garde pour rester connecté
      if (donnees.token) remplacerToken(donnees.token);

      setMdp({ ancien: '', nouveau: '', confirmation: '' });
      afficherMessage('Ton mot de passe a été modifié.');
    } catch (err) {
      afficherErreur('Le serveur ne répond pas.');
    }
  };

  // ----- Créer un compte -----
  const creerCompte = async (e) => {
    e.preventDefault();

    try {
      const reponse = await envoyer('/api/utilisateurs', 'POST', nouveauCompte);
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      setNouveauCompte({
        identifiant: '',
        nom: '',
        role: 'admin',
        motDePasse: '',
      });
      afficherMessage('Compte créé avec succès.');
      chargerComptes();
    } catch (err) {
      afficherErreur('Le serveur ne répond pas.');
    }
  };

  // ----- Attribuer un nouveau mot de passe à quelqu'un -----
  const attribuerMotDePasse = async (compte) => {
    const nouveau = window.prompt(
      'Nouveau mot de passe pour ' +
        compte.identifiant +
        ' (10 caractères minimum, avec lettres et chiffres) :'
    );
    if (!nouveau) return;

    try {
      const reponse = await envoyer(
        '/api/utilisateurs/' + compte.id + '/mot-de-passe',
        'PUT',
        { motDePasse: nouveau }
      );
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      afficherMessage('Nouveau mot de passe attribué à ' + compte.identifiant + '.');
    } catch (err) {
      afficherErreur('Le serveur ne répond pas.');
    }
  };

  // ----- Supprimer un compte -----
  const supprimerCompte = async (compte) => {
    const ok = window.confirm(
      'Supprimer le compte ' + compte.identifiant + ' ? Cette action est définitive.'
    );
    if (!ok) return;

    try {
      const reponse = await fetch(SERVEUR + '/api/utilisateurs/' + compte.id, {
        method: 'DELETE',
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      afficherMessage('Compte supprimé.');
      chargerComptes();
    } catch (err) {
      afficherErreur('Le serveur ne répond pas.');
    }
  };

  return (
    <div className="page-form page-notes">
      <div className="entete-form">
        <h1>Mon compte</h1>
        <p>
          {moi.nom} · {monRole}
        </p>
      </div>

      {message && (
        <div className="succes">
          <FaCheckCircle /> {message}
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      {/* Changer mon mot de passe (tous les rôles) */}
      <div className="section">
        <h2>
          <FaKey /> Changer mon mot de passe
        </h2>
        <form onSubmit={changerMonMotDePasse}>
          <div className="grille">
            <div className="champ">
              <label>Ancien mot de passe</label>
              <input
                type="password"
                value={mdp.ancien}
                onChange={(e) => setMdp({ ...mdp, ancien: e.target.value })}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="champ">
              <label>Nouveau mot de passe (10 caractères, lettres et chiffres)</label>
              <input
                type="password"
                value={mdp.nouveau}
                onChange={(e) => setMdp({ ...mdp, nouveau: e.target.value })}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="champ">
              <label>Confirmer le nouveau mot de passe</label>
              <input
                type="password"
                value={mdp.confirmation}
                onChange={(e) =>
                  setMdp({ ...mdp, confirmation: e.target.value })
                }
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <div className="ligne-bouton">
            <button type="submit" className="btn-compte">
              <FaKey /> Modifier mon mot de passe
            </button>
          </div>
        </form>
      </div>

      {/* Message pour les autres rôles */}
      {!peutGererLesComptes && (
        <div className="info-compte">
          <FaInfoCircle />
          <p>
            Seuls le propriétaire et le super administrateur gèrent les comptes
            et attribuent les mots de passe. Si tu as oublié le tien, demande-leur
            d'en attribuer un nouveau.
          </p>
        </div>
      )}

      {/* Partie réservée à ceux qui gèrent les comptes */}
      {peutGererLesComptes && (
        <>
          <div className="section">
            <h2>
              <FaUserPlus /> Créer un compte
            </h2>
            <form onSubmit={creerCompte}>
              <div className="grille">
                <div className="champ">
                  <label>Identifiant</label>
                  <input
                    type="text"
                    value={nouveauCompte.identifiant}
                    onChange={(e) =>
                      setNouveauCompte({
                        ...nouveauCompte,
                        identifiant: e.target.value,
                      })
                    }
                    placeholder="ex : marie.ngo"
                    required
                  />
                </div>
                <div className="champ">
                  <label>Nom affiché</label>
                  <input
                    type="text"
                    value={nouveauCompte.nom}
                    onChange={(e) =>
                      setNouveauCompte({ ...nouveauCompte, nom: e.target.value })
                    }
                    placeholder="ex : Marie Ngo"
                    required
                  />
                </div>
                <div className="champ">
                  <label>Rôle</label>
                  <select
                    value={nouveauCompte.role}
                    onChange={(e) =>
                      setNouveauCompte({ ...nouveauCompte, role: e.target.value })
                    }
                  >
                    {moi.proprietaire && (
                      <option value="superadmin">
                        Super administrateur (direction)
                      </option>
                    )}
                    <option value="admin">Administrateur (secondaire)</option>
                    <option value="secretaire">Secrétaire</option>
                    <option value="enseignant">Enseignant</option>
                  </select>
                </div>
                <div className="champ">
                  <label>Mot de passe attribué (10 caractères, lettres et chiffres)</label>
                  <input
                    type="password"
                    value={nouveauCompte.motDePasse}
                    onChange={(e) =>
                      setNouveauCompte({
                        ...nouveauCompte,
                        motDePasse: e.target.value,
                      })
                    }
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              <div className="ligne-bouton">
                <button type="submit" className="btn-compte">
                  <FaUserPlus /> Créer le compte
                </button>
              </div>
            </form>
          </div>

          <div className="section">
            <h2>
              <FaUsers /> Comptes existants ({comptes.length})
            </h2>
            <div className="zone-tableau">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Identifiant</th>
                    <th>Nom</th>
                    <th>Rôle</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {comptes.map((compte) => {
                    // On gère seulement les rôles en dessous du sien
                    const peutGerer = (RANGS[compte.role] || 0) < monRang;

                    return (
                      <tr key={compte.id}>
                        <td data-label="Identifiant">{compte.identifiant}</td>
                        <td data-label="Nom">{compte.nom}</td>
                        <td data-label="Rôle">
                          <span className={'badge-role ' + compte.role}>
                            {nomsRoles[compte.role]}
                          </span>
                        </td>
                        <td data-label="Action">
                          {peutGerer ? (
                            <div className="actions-compte">
                              <button
                                type="button"
                                className="btn-cle"
                                title="Attribuer un nouveau mot de passe"
                                onClick={() => attribuerMotDePasse(compte)}
                              >
                                <FaKey />
                              </button>
                              <button
                                type="button"
                                className="btn-supprimer"
                                title="Supprimer le compte"
                                onClick={() => supprimerCompte(compte)}
                              >
                                <FaTrash />
                              </button>
                            </div>
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Comptes;