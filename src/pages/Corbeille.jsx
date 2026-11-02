
import { useState, useEffect } from 'react';
import {
  FaTrashRestore,
  FaTrash,
  FaTrashAlt,
  FaUsers,
  FaListAlt,
  FaSyncAlt,
  FaCheckCircle,
} from 'react-icons/fa';
import { SERVEUR, getUtilisateur } from '../auth';
import '../Inscription.css';
import '../GestionNotes.css';
import '../Listes.css';
import '../Actions.css';

// Transforme une date du serveur en objet Date ("2026-10-29 08:30:00" est en heure UTC)
function lireDate(texte) {
  if (!texte) return null;
  const date = new Date(texte.replace(' ', 'T') + 'Z');
  return isNaN(date.getTime()) ? null : date;
}

function formaterDate(texte) {
  const date = lireDate(texte);
  if (!date) return texte || '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Combien de jours avant la suppression automatique ?
function joursRestants(texte, delaiJours) {
  const date = lireDate(texte);
  if (!date) return delaiJours;

  const fin = date.getTime() + delaiJours * 24 * 60 * 60 * 1000;
  const reste = Math.ceil((fin - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, reste);
}

// Une petite étiquette qui devient rouge quand il reste peu de jours
function Delai({ texte, delaiJours }) {
  const jours = joursRestants(texte, delaiJours);

  return (
    <span className={jours <= 3 ? 'delai urgent' : 'delai'}>
      {jours === 0
        ? "Supprimé aujourd'hui"
        : 'Suppression dans ' + jours + ' jour' + (jours > 1 ? 's' : '')}
    </span>
  );
}

const styleVider = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '10px 22px',
  border: 'none',
  borderRadius: '30px',
  background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
  color: '#ffffff',
  fontSize: '1rem',
  fontWeight: 'bold',
  cursor: 'pointer',
  boxShadow: '0 6px 15px rgba(220, 38, 38, 0.3)',
};

function Corbeille() {
  const utilisateur = getUtilisateur();
  // La suppression définitive est réservée à la direction et au propriétaire
  const peutSupprimerDefinitivement = utilisateur && utilisateur.superAdmin;

  const [etudiants, setEtudiants] = useState([]);
  const [notes, setNotes] = useState([]);
  const [delaiJours, setDelaiJours] = useState(30);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = () => {
    fetch(SERVEUR + '/api/corbeille')
      .then((reponse) => reponse.json())
      .then((donnees) => {
        if (donnees && Array.isArray(donnees.etudiants)) {
          setEtudiants(donnees.etudiants);
          setNotes(donnees.notes || []);
          if (donnees.delaiJours) setDelaiJours(donnees.delaiJours);
          setErreur('');
        } else {
          setErreur((donnees && donnees.erreur) || 'Impossible de lire la corbeille.');
        }
      })
      .catch(() => {
        setErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
      });
  };

  useEffect(() => {
    charger();
  }, []);

  const afficherMessage = (texte) => {
    setErreur('');
    setMessage(texte);
    setTimeout(() => setMessage(''), 3500);
  };

  const afficherErreur = (texte) => {
    setMessage('');
    setErreur(texte);
    setTimeout(() => setErreur(''), 5000);
  };

  // Envoie une demande au serveur, puis recharge la corbeille
  const agir = async (chemin, methode, texteSucces) => {
    try {
      const reponse = await fetch(SERVEUR + chemin, { method: methode });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      afficherMessage(texteSucces);
      charger();
    } catch (err) {
      afficherErreur('Le serveur ne répond pas.');
    }
  };

  const restaurerEtudiant = (e) =>
    agir('/api/corbeille/etudiants/' + e.id + '/restaurer', 'POST', 'Étudiant restauré.');

  const restaurerNote = (n) =>
    agir('/api/corbeille/notes/' + n.id + '/restaurer', 'POST', 'Note restaurée.');

  const supprimerEtudiant = (e) => {
    const ok = window.confirm(
      'Supprimer DÉFINITIVEMENT ' + e.nom + ' ' + e.prenom + ' et ses documents ? Impossible de revenir en arrière.'
    );
    if (ok) {
      agir('/api/corbeille/etudiants/' + e.id, 'DELETE', 'Étudiant supprimé définitivement.');
    }
  };

  const supprimerNote = (n) => {
    const ok = window.confirm(
      'Supprimer DÉFINITIVEMENT la note de ' + n.nom + ' ? Impossible de revenir en arrière.'
    );
    if (ok) {
      agir('/api/corbeille/notes/' + n.id, 'DELETE', 'Note supprimée définitivement.');
    }
  };

  const toutVider = () => {
    const ok = window.confirm(
      'Vider TOUTE la corbeille ? Les étudiants, leurs documents et les notes seront perdus pour toujours.'
    );
    if (ok) {
      agir('/api/corbeille', 'DELETE', 'La corbeille a été vidée.');
    }
  };

  const total = etudiants.length + notes.length;

  return (
    <div className="page-form page-notes">
      <div className="entete-form">
        <h1>Corbeille</h1>
        <p>Les éléments supprimés restent ici {delaiJours} jours avant d'être effacés</p>
      </div>

      {message && (
        <div className="succes">
          <FaCheckCircle /> {message}
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="info-corbeille">
        Tu peux <strong>restaurer</strong> ce qui a été supprimé par erreur.
        Après <strong>{delaiJours} jours</strong>, chaque élément est effacé
        automatiquement et définitivement.
        {peutSupprimerDefinitivement
          ? ' En tant que direction, tu peux aussi supprimer tout de suite.'
          : ' La suppression immédiate est réservée à la direction.'}
      </div>

      <div className="outils">
        <button type="button" className="btn-rafraichir" onClick={charger}>
          <FaSyncAlt /> Actualiser
        </button>

        {peutSupprimerDefinitivement && total > 0 && (
          <button type="button" style={styleVider} onClick={toutVider}>
            <FaTrashAlt /> Vider la corbeille
          </button>
        )}
      </div>

      {/* Étudiants supprimés */}
      <div className="section">
        <h2>
          <FaUsers /> Étudiants supprimés ({etudiants.length})
        </h2>

        {etudiants.length === 0 ? (
          <p className="vide">Aucun étudiant dans la corbeille.</p>
        ) : (
          <div className="zone-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Nom et prénom</th>
                  <th>Classe</th>
                  <th>Supprimé le</th>
                  <th>Effacement</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {etudiants.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Matricule">{e.matricule}</td>
                    <td data-label="Nom et prénom">
                      {e.nom} {e.prenom}
                    </td>
                    <td data-label="Classe">{e.classe}</td>
                    <td data-label="Supprimé le">
                      <span className="date-suppression">
                        {formaterDate(e.supprime_le)}
                      </span>
                    </td>
                    <td data-label="Effacement">
                      <Delai texte={e.supprime_le} delaiJours={delaiJours} />
                    </td>
                    <td data-label="Action">
                      <div className="actions-ligne">
                        <button
                          type="button"
                          className="btn-restaurer"
                          title="Restaurer"
                          onClick={() => restaurerEtudiant(e)}
                        >
                          <FaTrashRestore />
                        </button>
                        {peutSupprimerDefinitivement && (
                          <button
                            type="button"
                            className="btn-supprimer"
                            title="Supprimer définitivement"
                            onClick={() => supprimerEtudiant(e)}
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes supprimées */}
      <div className="section">
        <h2>
          <FaListAlt /> Notes supprimées ({notes.length})
        </h2>

        {notes.length === 0 ? (
          <p className="vide">Aucune note dans la corbeille.</p>
        ) : (
          <div className="zone-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Classe</th>
                  <th>Matière</th>
                  <th>Note</th>
                  <th>Supprimée le</th>
                  <th>Effacement</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((n) => (
                  <tr key={n.id}>
                    <td data-label="Nom">{n.nom}</td>
                    <td data-label="Classe">{n.classe}</td>
                    <td data-label="Matière">{n.matiere}</td>
                    <td data-label="Note">{n.note}/20</td>
                    <td data-label="Supprimée le">
                      <span className="date-suppression">
                        {formaterDate(n.supprime_le)}
                      </span>
                    </td>
                    <td data-label="Effacement">
                      <Delai texte={n.supprime_le} delaiJours={delaiJours} />
                    </td>
                    <td data-label="Action">
                      <div className="actions-ligne">
                        <button
                          type="button"
                          className="btn-restaurer"
                          title="Restaurer"
                          onClick={() => restaurerNote(n)}
                        >
                          <FaTrashRestore />
                        </button>
                        {peutSupprimerDefinitivement && (
                          <button
                            type="button"
                            className="btn-supprimer"
                            title="Supprimer définitivement"
                            onClick={() => supprimerNote(n)}
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Corbeille;