
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaListAlt,
  FaSearch,
  FaSyncAlt,
  FaEdit,
  FaTrash,
  FaTrashAlt,
  FaPlus,
  FaSave,
  FaTimes,
  FaCheckCircle,
} from 'react-icons/fa';
import { SERVEUR, getUtilisateur } from '../auth';
import '../Inscription.css';
import '../GestionNotes.css';
import '../Listes.css';
import '../Actions.css';

// Le style rouge du bouton "Tout mettre à la corbeille"
const styleToutSupprimer = {
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

function ListeNotes() {
  const navigate = useNavigate();
  const utilisateur = getUtilisateur();
  const role = utilisateur ? utilisateur.role : '';

  // Admin et enseignant peuvent agir sur les notes
  const peutAgir = role === 'admin' || role === 'enseignant';
  // Seul l'admin peut mettre plusieurs notes à la corbeille d'un coup
  const peutSupprimerEnLot = role === 'admin';

  const [liste, setListe] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  // La note en cours de modification (ou rien)
  const [edition, setEdition] = useState(null);
  const [erreurModal, setErreurModal] = useState('');

  const charger = () => {
    fetch(SERVEUR + '/api/notes')
      .then((reponse) => reponse.json())
      .then((donnees) => {
        if (Array.isArray(donnees)) {
          setListe(donnees);
          setErreur('');
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

  // Un enseignant ne touche plus aux notes publiées
  const peutToucher = (n) => peutAgir && !(n.publie && role === 'enseignant');

  const ouvrirEdition = (n) => {
    setErreurModal('');
    setEdition({ id: n.id, nom: n.nom, matiere: n.matiere, note: n.note, coef: n.coef });
  };

  const fermerEdition = () => {
    setEdition(null);
    setErreurModal('');
  };

  // ----- Enregistrer la modification d'une note -----
  const enregistrerModification = async (e) => {
    e.preventDefault();
    setErreurModal('');

    try {
      const reponse = await fetch(SERVEUR + '/api/notes/' + edition.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: edition.note, coef: edition.coef }),
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreurModal(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      fermerEdition();
      afficherMessage('Note modifiée avec succès.');
      charger();
    } catch (err) {
      setErreurModal('Le serveur ne répond pas.');
    }
  };

  // ----- Mettre une note à la corbeille -----
  const supprimer = async (n) => {
    const ok = window.confirm(
      'Mettre la note de ' + n.nom + ' à la corbeille ? Tu pourras la restaurer.'
    );
    if (!ok) return;

    try {
      const reponse = await fetch(SERVEUR + '/api/notes/' + n.id, {
        method: 'DELETE',
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      afficherMessage('Note mise à la corbeille.');
      charger();
    } catch (err) {
      afficherErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
    }
  };

  const resultat = liste.filter((n) =>
    (n.nom + ' ' + n.matricule + ' ' + n.matiere + ' ' + n.classe)
      .toLowerCase()
      .includes(recherche.toLowerCase())
  );

  // ----- Mettre TOUTES les notes affichées à la corbeille -----
  const toutMettreALaCorbeille = async () => {
    const filtre = recherche.trim();

    const cible = filtre
      ? 'les ' + resultat.length + ' note(s) qui correspondent à « ' + filtre + ' »'
      : 'TOUTES les ' + resultat.length + ' notes';

    const ok = window.confirm(
      'Mettre ' + cible + ' à la corbeille ? Tu pourras les restaurer.'
    );
    if (!ok) return;

    try {
      const reponse = await fetch(SERVEUR + '/api/notes/corbeille-lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: resultat.map((n) => n.id) }),
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      afficherMessage(donnees.nombre + ' note(s) mise(s) à la corbeille.');
      charger();
    } catch (err) {
      afficherErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
    }
  };

  return (
    <div className="page-form page-notes">
      <div className="entete-form">
        <h1>Liste des notes</h1>
        <p>Notes enregistrées pour l'année 2026-2027</p>
      </div>

      {message && (
        <div className="succes">
          <FaCheckCircle /> {message}
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="section">
        <h2>
          <FaListAlt /> Notes enregistrées ({resultat.length})
        </h2>

        <div className="outils">
          <div className="barre-recherche">
            <FaSearch />
            <input
              type="text"
              placeholder="Rechercher (ex : GL2)..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          {peutAgir && (
            <button
              type="button"
              className="btn-ajouter"
              onClick={() => navigate('/notes')}
            >
              <FaPlus /> Ajouter des notes
            </button>
          )}

          <button type="button" className="btn-rafraichir" onClick={charger}>
            <FaSyncAlt /> Actualiser
          </button>

          {peutSupprimerEnLot && resultat.length > 0 && (
            <button
              type="button"
              className="btn-tout-supprimer"
              style={styleToutSupprimer}
              onClick={toutMettreALaCorbeille}
            >
              <FaTrashAlt /> Tout mettre à la corbeille ({resultat.length})
            </button>
          )}
        </div>

        {resultat.length === 0 ? (
          <p className="vide">Aucune note à afficher.</p>
        ) : (
          <div className="zone-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Nom</th>
                  <th>Classe</th>
                  <th>Matière</th>
                  <th>Évaluation</th>
                  <th>Note</th>
                  <th>Coef.</th>
                  <th>Statut</th>
                  {peutAgir && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {resultat.map((n) => (
                  <tr key={n.id}>
                    <td data-label="Matricule">{n.matricule}</td>
                    <td data-label="Nom">{n.nom}</td>
                    <td data-label="Classe">{n.classe}</td>
                    <td data-label="Matière">{n.matiere}</td>
                    <td data-label="Évaluation">{n.evaluation}</td>
                    <td data-label="Note">
                      <span className={n.note >= 10 ? 'note bonne' : 'note faible'}>
                        {n.note}/20
                      </span>
                    </td>
                    <td data-label="Coef.">{n.coef}</td>
                    <td data-label="Statut">
                      <span
                        className={n.publie ? 'statut publiee' : 'statut brouillon'}
                      >
                        {n.publie ? 'Publiée' : 'Brouillon'}
                      </span>
                    </td>
                    {peutAgir && (
                      <td data-label="Action">
                        {peutToucher(n) ? (
                          <div className="actions-ligne">
                            <button
                              type="button"
                              className="btn-modifier"
                              title="Modifier"
                              onClick={() => ouvrirEdition(n)}
                            >
                              <FaEdit />
                            </button>
                            <button
                              type="button"
                              className="btn-supprimer"
                              title="Mettre à la corbeille"
                              onClick={() => supprimer(n)}
                            >
                              <FaTrash />
                            </button>
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* La fenêtre de modification */}
      {edition && (
        <div className="modal-fond" onClick={fermerEdition}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              <FaEdit /> Modifier la note
            </h2>
            <p className="modal-nom">
              {edition.nom} · {edition.matiere}
            </p>

            <form onSubmit={enregistrerModification}>
              <div className="grille">
                <div className="champ">
                  <label>Note sur 20</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.25"
                    value={edition.note}
                    onChange={(e) =>
                      setEdition({ ...edition, note: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="champ">
                  <label>Coefficient</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={edition.coef}
                    onChange={(e) =>
                      setEdition({ ...edition, coef: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              {erreurModal && <div className="erreur">{erreurModal}</div>}

              <div className="modal-boutons">
                <button
                  type="button"
                  className="btn-annuler-modal"
                  onClick={fermerEdition}
                >
                  <FaTimes /> Annuler
                </button>
                <button type="submit" className="btn-valider-modal">
                  <FaSave /> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ListeNotes;