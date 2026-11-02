
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaUsers,
  FaSearch,
  FaSyncAlt,
  FaFileAlt,
  FaFileUpload,
  FaTrash,
  FaTrashAlt,
  FaCheckCircle,
  FaEdit,
  FaUserPlus,
  FaSave,
  FaTimes,
} from 'react-icons/fa';
import { SERVEUR, getUtilisateur, urlFichier } from '../auth';
import '../Inscription.css';
import '../GestionNotes.css';
import '../Listes.css';
import '../Actions.css';

const CLASSES = ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'];

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

const AUCUN_FICHIER = { acte: null, photo: null, bulletins: null };

function Etudiants() {
  const navigate = useNavigate();
  const utilisateur = getUtilisateur();
  const role = utilisateur ? utilisateur.role : '';

  // Qui a le droit de faire quoi
  const peutAjouterModifier = role === 'admin' || role === 'secretaire';
  const peutSupprimer = role === 'admin';
  const afficherActions = peutAjouterModifier || peutSupprimer;

  const [liste, setListe] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  // L'étudiant en cours de modification (ou rien)
  const [edition, setEdition] = useState(null);
  const [erreurModal, setErreurModal] = useState('');

  // Les nouveaux documents choisis dans la fenêtre de modification
  const [fichiers, setFichiers] = useState(AUCUN_FICHIER);
  const [cleFichiers, setCleFichiers] = useState(0);

  const charger = () => {
    fetch(SERVEUR + '/api/etudiants')
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

  // ----- Ouvrir la fenêtre de modification -----
  const ouvrirEdition = (etu) => {
    setErreurModal('');
    setFichiers(AUCUN_FICHIER);
    setCleFichiers(cleFichiers + 1);
    setEdition({
      id: etu.id,
      matricule: etu.matricule,
      nom: etu.nom || '',
      prenom: etu.prenom || '',
      dateNaissance: etu.date_naissance || '',
      sexe: etu.sexe || '',
      lieuNaissance: etu.lieu_naissance || '',
      classe: etu.classe || '',
      parentNom: etu.parent_nom || '',
      parentTel: etu.parent_tel || '',
      parentEmail: etu.parent_email || '',
      photoActuelle: etu.photo || null,
      acteActuel: etu.acte || null,
      bulletinsActuels: etu.bulletins || null,
    });
  };

  const fermerEdition = () => {
    setEdition(null);
    setErreurModal('');
    setFichiers(AUCUN_FICHIER);
  };

  const changerChamp = (e) => {
    setEdition({ ...edition, [e.target.name]: e.target.value });
  };

  // Garde le fichier choisi (acte, photo ou bulletins)
  const choisirFichier = (e) => {
    setFichiers({ ...fichiers, [e.target.name]: e.target.files[0] || null });
  };

  // ----- Enregistrer la modification (informations, puis documents) -----
  const enregistrerModification = async (e) => {
    e.preventDefault();
    setErreurModal('');

    try {
      // 1. Les informations
      const reponse = await fetch(SERVEUR + '/api/etudiants/' + edition.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edition),
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreurModal(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      // 2. Les documents, seulement si on en a choisi
      if (fichiers.acte || fichiers.photo || fichiers.bulletins) {
        const colis = new FormData();
        if (fichiers.acte) colis.append('acte', fichiers.acte);
        if (fichiers.photo) colis.append('photo', fichiers.photo);
        if (fichiers.bulletins) colis.append('bulletins', fichiers.bulletins);

        const reponseDocs = await fetch(
          SERVEUR + '/api/etudiants/' + edition.id + '/documents',
          { method: 'PUT', body: colis }
        );
        const donneesDocs = await reponseDocs.json();

        if (!reponseDocs.ok) {
          charger();
          setErreurModal(
            'Les informations sont enregistrées, mais les documents ont été refusés : ' +
              (donneesDocs.erreur || 'erreur inconnue.')
          );
          return;
        }
      }

      fermerEdition();
      afficherMessage('Étudiant modifié avec succès.');
      charger();
    } catch (err) {
      setErreurModal('Le serveur ne répond pas.');
    }
  };

  // ----- Mettre UN étudiant à la corbeille -----
  const supprimer = async (etu) => {
    const ok = window.confirm(
      'Mettre ' + etu.nom + ' ' + etu.prenom + ' à la corbeille ? Tu pourras le restaurer.'
    );
    if (!ok) return;

    try {
      const reponse = await fetch(SERVEUR + '/api/etudiants/' + etu.id, {
        method: 'DELETE',
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      afficherMessage('Étudiant mis à la corbeille.');
      charger();
    } catch (err) {
      afficherErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
    }
  };

  // ----- Mettre TOUS les étudiants à la corbeille -----
  const toutSupprimer = async () => {
    const ok = window.confirm(
      'Mettre TOUS les étudiants à la corbeille ? Tu pourras les restaurer.'
    );
    if (!ok) return;

    try {
      const reponse = await fetch(SERVEUR + '/api/etudiants', {
        method: 'DELETE',
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      afficherMessage('Tous les étudiants sont à la corbeille.');
      charger();
    } catch (err) {
      afficherErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
    }
  };

  const resultat = liste.filter((etu) =>
    (etu.nom + ' ' + etu.prenom + ' ' + etu.matricule + ' ' + etu.classe)
      .toLowerCase()
      .includes(recherche.toLowerCase())
  );

  return (
    <div className="page-form page-notes">
      <div className="entete-form">
        <h1>Liste des étudiants</h1>
        <p>Étudiants inscrits pour l'année 2026-2027</p>
      </div>

      {message && (
        <div className="succes">
          <FaCheckCircle /> {message}
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="section">
        <h2>
          <FaUsers /> Étudiants inscrits ({resultat.length})
        </h2>

        <div className="outils">
          <div className="barre-recherche">
            <FaSearch />
            <input
              type="text"
              placeholder="Rechercher..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          {peutAjouterModifier && (
            <button
              type="button"
              className="btn-ajouter"
              onClick={() => navigate('/inscription')}
            >
              <FaUserPlus /> Ajouter un étudiant
            </button>
          )}

          <button type="button" className="btn-rafraichir" onClick={charger}>
            <FaSyncAlt /> Actualiser
          </button>

          {peutSupprimer && liste.length > 0 && (
            <button
              type="button"
              className="btn-tout-supprimer"
              style={styleToutSupprimer}
              onClick={toutSupprimer}
            >
              <FaTrashAlt /> Tout mettre à la corbeille
            </button>
          )}
        </div>

        {resultat.length === 0 ? (
          <p className="vide">Aucun étudiant à afficher.</p>
        ) : (
          <div className="zone-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Matricule</th>
                  <th>Nom et prénom</th>
                  <th>Classe</th>
                  <th>Parent</th>
                  <th>Téléphone</th>
                  <th>Documents</th>
                  {afficherActions && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {resultat.map((etu, index) => (
                  <tr key={etu.id}>
                    <td data-label="N°">{index + 1}</td>
                    <td data-label="Matricule">{etu.matricule}</td>
                    <td data-label="Nom et prénom">
                      <div className="cellule-nom">
                        {etu.photo ? (
                          <img
                            className="photo-mini"
                            src={urlFichier(etu.photo)}
                            alt={etu.nom}
                          />
                        ) : (
                          <span className="photo-mini lettre">
                            {(etu.nom || '?')[0]}
                          </span>
                        )}
                        <span>
                          {etu.nom} {etu.prenom}
                        </span>
                      </div>
                    </td>
                    <td data-label="Classe">{etu.classe}</td>
                    <td data-label="Parent">{etu.parent_nom}</td>
                    <td data-label="Téléphone">{etu.parent_tel}</td>
                    <td data-label="Documents">
                      <div className="docs">
                        {etu.acte && (
                          <a
                            className="doc-lien"
                            href={urlFichier(etu.acte)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FaFileAlt /> Acte
                          </a>
                        )}
                        {etu.bulletins && (
                          <a
                            className="doc-lien"
                            href={urlFichier(etu.bulletins)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FaFileAlt /> Bulletins
                          </a>
                        )}
                        {!etu.acte && !etu.bulletins && <span>-</span>}
                      </div>
                    </td>
                    {afficherActions && (
                      <td data-label="Action">
                        <div className="actions-ligne">
                          {peutAjouterModifier && (
                            <button
                              type="button"
                              className="btn-modifier"
                              title="Modifier"
                              onClick={() => ouvrirEdition(etu)}
                            >
                              <FaEdit />
                            </button>
                          )}
                          {peutSupprimer && (
                            <button
                              type="button"
                              className="btn-supprimer"
                              title="Mettre à la corbeille"
                              onClick={() => supprimer(etu)}
                            >
                              <FaTrash />
                            </button>
                          )}
                        </div>
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
              <FaEdit /> Modifier l'étudiant
            </h2>
            <p className="modal-nom">Matricule : {edition.matricule}</p>

            <form onSubmit={enregistrerModification}>
              <div className="grille">
                <div className="champ">
                  <label>Nom</label>
                  <input
                    type="text"
                    name="nom"
                    value={edition.nom}
                    onChange={changerChamp}
                    required
                  />
                </div>
                <div className="champ">
                  <label>Prénom</label>
                  <input
                    type="text"
                    name="prenom"
                    value={edition.prenom}
                    onChange={changerChamp}
                    required
                  />
                </div>
                <div className="champ">
                  <label>Date de naissance</label>
                  <input
                    type="date"
                    name="dateNaissance"
                    value={edition.dateNaissance}
                    onChange={changerChamp}
                    required
                  />
                </div>
                <div className="champ">
                  <label>Sexe</label>
                  <select
                    name="sexe"
                    value={edition.sexe}
                    onChange={changerChamp}
                    required
                  >
                    <option value="">Sélectionner</option>
                    <option value="Masculin">Masculin</option>
                    <option value="Féminin">Féminin</option>
                  </select>
                </div>
                <div className="champ">
                  <label>Lieu de naissance</label>
                  <input
                    type="text"
                    name="lieuNaissance"
                    value={edition.lieuNaissance}
                    onChange={changerChamp}
                  />
                </div>
                <div className="champ">
                  <label>Classe</label>
                  <select
                    name="classe"
                    value={edition.classe}
                    onChange={changerChamp}
                    required
                  >
                    <option value="">Sélectionner</option>
                    {CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="champ">
                  <label>Nom du parent</label>
                  <input
                    type="text"
                    name="parentNom"
                    value={edition.parentNom}
                    onChange={changerChamp}
                    required
                  />
                </div>
                <div className="champ">
                  <label>Téléphone</label>
                  <input
                    type="tel"
                    name="parentTel"
                    value={edition.parentTel}
                    onChange={changerChamp}
                    required
                  />
                </div>
                <div className="champ large">
                  <label>Adresse e-mail</label>
                  <input
                    type="email"
                    name="parentEmail"
                    value={edition.parentEmail}
                    onChange={changerChamp}
                  />
                </div>
              </div>

              {/* Les documents */}
              <h3 className="modal-sous-titre">
                <FaFileUpload /> Documents
              </h3>
              <p className="aide">
                Laisse vide pour garder les documents actuels. Un nouveau fichier
                remplace l'ancien. Images JPG, PNG, WEBP ou PDF, 5 Mo maximum.
              </p>

              <div className="grille">
                <div className="champ">
                  <label>Photo d'identité</label>
                  <div className="doc-actuel">
                    {edition.photoActuelle ? (
                      <>
                        <img
                          className="photo-mini"
                          src={urlFichier(edition.photoActuelle)}
                          alt="Photo actuelle"
                        />
                        <span>Photo actuelle</span>
                      </>
                    ) : (
                      <span>Aucune photo pour le moment</span>
                    )}
                  </div>
                  <input
                    key={'photo' + cleFichiers}
                    type="file"
                    name="photo"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={choisirFichier}
                  />
                </div>

                <div className="champ">
                  <label>Acte de naissance</label>
                  <div className="doc-actuel">
                    {edition.acteActuel ? (
                      <a
                        className="doc-lien"
                        href={urlFichier(edition.acteActuel)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FaFileAlt /> Voir l'acte actuel
                      </a>
                    ) : (
                      <span>Aucun acte pour le moment</span>
                    )}
                  </div>
                  <input
                    key={'acte' + cleFichiers}
                    type="file"
                    name="acte"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={choisirFichier}
                  />
                </div>

                <div className="champ large">
                  <label>Bulletins scolaires</label>
                  <div className="doc-actuel">
                    {edition.bulletinsActuels ? (
                      <a
                        className="doc-lien"
                        href={urlFichier(edition.bulletinsActuels)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FaFileAlt /> Voir les bulletins actuels
                      </a>
                    ) : (
                      <span>Aucun bulletin pour le moment</span>
                    )}
                  </div>
                  <input
                    key={'bulletins' + cleFichiers}
                    type="file"
                    name="bulletins"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={choisirFichier}
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

export default Etudiants;