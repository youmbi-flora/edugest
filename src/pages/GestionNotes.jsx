import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaClipboardList,
  FaUsers,
  FaPlus,
  FaSave,
  FaFilePdf,
  FaBullhorn,
  FaTrash,
  FaSyncAlt,
  FaCheckCircle,
} from 'react-icons/fa';
import '../Inscription.css';
import '../GestionNotes.css';
import '../Listes.css';

function GestionNotes() {
  const navigate = useNavigate();

  const [infos, setInfos] = useState({
    filiere: 'Informatique',
    niveau: 'Licence 2',
    classe: '6ème',
    matiere: 'Développement Web',
    semestre: 'Semestre 1',
    evaluation: 'Contrôle continu',
  });

  // La feuille de notes : au départ elle est vide, le serveur la remplit
  const [etudiants, setEtudiants] = useState([]);

  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

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

  // Va chercher dans le registre les étudiants de la classe choisie.
  // avecMessage = true quand c'est toi qui cliques sur "Recharger la liste".
  const chargerEtudiants = (avecMessage) => {
    fetch('http://localhost:3000/api/etudiants')
      .then((reponse) => reponse.json())
      .then((donnees) => {
        const deLaClasse = donnees
          .filter((etu) => etu.classe === infos.classe)
          .reverse()
          .map((etu) => ({
            id: etu.id,
            matricule: etu.matricule,
            nom: etu.nom + ' ' + etu.prenom,
            note: '',
            coef: 2,
          }));
        setEtudiants(deLaClasse);

        if (avecMessage) {
          afficherMessage(
            'Liste rechargée : ' +
              deLaClasse.length +
              ' étudiant(s) inscrit(s) en ' +
              infos.classe +
              '.'
          );
        }
      })
      .catch(() => {
        afficherErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
      });
  };

  // À l'ouverture de la page, et à chaque changement de classe
  useEffect(() => {
    chargerEtudiants(false);
  }, [infos.classe]);

  const changerInfo = (e) => {
    setInfos({ ...infos, [e.target.name]: e.target.value });
  };

  const changerEtudiant = (id, champ, valeur) => {
    const nouvelleListe = etudiants.map((etu) =>
      etu.id === id ? { ...etu, [champ]: valeur } : etu
    );
    setEtudiants(nouvelleListe);
  };

  // Retire un étudiant de la feuille (il reste dans le registre)
  const retirer = (id) => {
    setEtudiants(etudiants.filter((etu) => etu.id !== id));
  };

  const enregistrer = async () => {
    try {
      const reponse = await fetch('http://localhost:3000/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ infos, etudiants }),
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      afficherMessage('Notes enregistrées avec succès !');
    } catch (err) {
      afficherErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
    }
  };

  const publier = async () => {
    try {
      const reponse = await fetch('http://localhost:3000/api/notes/publier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ infos }),
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        afficherErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      afficherMessage('Notes publiées avec succès !');
    } catch (err) {
      afficherErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
    }
  };

  const exporter = () => window.print();

  return (
    <div className="page-form page-notes">
      <div className="entete-form">
        <h1>Gestion des notes des étudiants</h1>
        <p>Année académique : 2026-2027</p>
      </div>

      {message && (
        <div className="succes">
          <FaCheckCircle /> {message}
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      {/* Partie 1 : informations académiques */}
      <div className="section">
        <h2>
          <FaClipboardList /> Informations académiques
        </h2>
        <div className="grille">
          <div className="champ">
            <label>Filière</label>
            <select name="filiere" value={infos.filiere} onChange={changerInfo}>
              <option>Informatique</option>
              <option>Gestion</option>
              <option>Réseaux</option>
            </select>
          </div>
          <div className="champ">
            <label>Niveau</label>
            <select name="niveau" value={infos.niveau} onChange={changerInfo}>
              <option>Licence 1</option>
              <option>Licence 2</option>
              <option>Licence 3</option>
            </select>
          </div>
          <div className="champ">
            <label>Classe</label>
            <select name="classe" value={infos.classe} onChange={changerInfo}>
              <option>6ème</option>
              <option>5ème</option>
              <option>4ème</option>
              <option>3ème</option>
              <option>2nde</option>
              <option>1ère</option>
              <option>Terminale</option>
            </select>
          </div>
          <div className="champ">
            <label>Matière</label>
            <select name="matiere" value={infos.matiere} onChange={changerInfo}>
              <option>Développement Web</option>
              <option>Base de données</option>
              <option>Réseaux</option>
              <option>Communication</option>
            </select>
          </div>
          <div className="champ">
            <label>Semestre</label>
            <select name="semestre" value={infos.semestre} onChange={changerInfo}>
              <option>Semestre 1</option>
              <option>Semestre 2</option>
            </select>
          </div>
          <div className="champ">
            <label>Évaluation</label>
            <select
              name="evaluation"
              value={infos.evaluation}
              onChange={changerInfo}
            >
              <option>Contrôle continu</option>
              <option>Examen</option>
              <option>TP</option>
            </select>
          </div>
        </div>
      </div>

      {/* Partie 2 : liste des étudiants de la classe */}
      <div className="section">
        <h2>
          <FaUsers /> Étudiants de la classe {infos.classe} ({etudiants.length})
        </h2>

        {etudiants.length === 0 ? (
          <p className="vide">
            Aucun étudiant inscrit dans cette classe. Inscris-en un, ou choisis
            une autre classe.
          </p>
        ) : (
          <div className="zone-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Matricule</th>
                  <th>Nom et prénom</th>
                  <th>Note /20</th>
                  <th>Coef.</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {etudiants.map((etu, index) => (
                  <tr key={etu.id}>
                    <td data-label="N°">{index + 1}</td>
                    <td data-label="Matricule">{etu.matricule}</td>
                    <td data-label="Nom et prénom">{etu.nom}</td>
                    <td data-label="Note /20">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        className="petit"
                        value={etu.note}
                        placeholder="--"
                        onChange={(e) =>
                          changerEtudiant(etu.id, 'note', e.target.value)
                        }
                      />
                    </td>
                    <td data-label="Coef.">
                      <input
                        type="number"
                        min="1"
                        className="petit"
                        value={etu.coef}
                        onChange={(e) =>
                          changerEtudiant(etu.id, 'coef', e.target.value)
                        }
                      />
                    </td>
                    <td data-label="Action">
                      <button
                        type="button"
                        className="btn-supprimer"
                        title="Retirer de cette feuille"
                        onClick={() => retirer(etu.id)}
                      >
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Partie 3 : boutons */}
      <div className="boutons multi">
        <button
          type="button"
          className="btn-annuler"
          onClick={() => navigate('/inscription')}
        >
          <FaPlus /> Inscrire un étudiant
        </button>
        <button
          type="button"
          className="btn-annuler"
          onClick={() => chargerEtudiants(true)}
        >
          <FaSyncAlt /> Recharger la liste
        </button>
        <button type="button" className="btn-annuler" onClick={exporter}>
          <FaFilePdf /> Exporter en PDF
        </button>
        <button type="button" className="btn-valider" onClick={enregistrer}>
          <FaSave /> Enregistrer les notes
        </button>
        <button type="button" className="btn-valider" onClick={publier}>
          <FaBullhorn /> Publier les notes
        </button>
      </div>
    </div>
  );
}

export default GestionNotes;