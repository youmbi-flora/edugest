
import { useState } from 'react';
import {
  FaUserGraduate,
  FaUserFriends,
  FaFileUpload,
  FaPaperPlane,
  FaTimes,
  FaCheckCircle,
} from 'react-icons/fa';
import '../Inscription.css';
import '../Listes.css';

function Inscription() {
  const vide = {
    nom: '',
    prenom: '',
    dateNaissance: '',
    sexe: '',
    lieuNaissance: '',
    classe: '',
    parentNom: '',
    parentTel: '',
    parentEmail: '',
    certifie: false,
  };

  const [form, setForm] = useState(vide);
  const [fichiers, setFichiers] = useState({
    acte: null,
    photo: null,
    bulletins: null,
  });
  // Cette clé sert à vider les champs fichiers après l'envoi
  const [cleFichiers, setCleFichiers] = useState(0);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState('');

  const changer = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  // Garde le fichier choisi (acte, photo ou bulletins)
  const choisirFichier = (e) => {
    setFichiers({ ...fichiers, [e.target.name]: e.target.files[0] || null });
  };

  const tout_vider = () => {
    setForm(vide);
    setFichiers({ acte: null, photo: null, bulletins: null });
    setCleFichiers(cleFichiers + 1);
  };

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur('');

    // FormData : le "colis" qui contient les textes ET les fichiers
    const colis = new FormData();
    Object.keys(form).forEach((cle) => colis.append(cle, form[cle]));
    if (fichiers.acte) colis.append('acte', fichiers.acte);
    if (fichiers.photo) colis.append('photo', fichiers.photo);
    if (fichiers.bulletins) colis.append('bulletins', fichiers.bulletins);

    try {
      const reponse = await fetch('http://localhost:3000/api/etudiants', {
        method: 'POST',
        body: colis,
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.erreur || 'Une erreur est survenue.');
        return;
      }

      setEnvoye(true);
      tout_vider();
      setTimeout(() => setEnvoye(false), 4000);
    } catch (err) {
      setErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
    }
  };

  const annuler = () => {
    tout_vider();
    setErreur('');
  };

  return (
    <div className="page-form">
      <div className="entete-form">
        <h1>Formulaire d'inscription</h1>
        <p>Année scolaire 2026-2027</p>
      </div>

      {envoye && (
        <div className="succes">
          <FaCheckCircle /> Inscription enregistrée avec succès !
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      <form className="formulaire" onSubmit={soumettre}>
        {/* Section 1 */}
        <div className="section">
          <h2>
            <FaUserGraduate /> 1. Informations sur l'élève
          </h2>
          <div className="grille">
            <div className="champ">
              <label>Nom</label>
              <input
                type="text"
                name="nom"
                value={form.nom}
                onChange={changer}
                required
              />
            </div>
            <div className="champ">
              <label>Prénom</label>
              <input
                type="text"
                name="prenom"
                value={form.prenom}
                onChange={changer}
                required
              />
            </div>
            <div className="champ">
              <label>Date de naissance</label>
              <input
                type="date"
                name="dateNaissance"
                value={form.dateNaissance}
                onChange={changer}
                required
              />
            </div>
            <div className="champ">
              <label>Sexe</label>
              <select
                name="sexe"
                value={form.sexe}
                onChange={changer}
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
                value={form.lieuNaissance}
                onChange={changer}
                required
              />
            </div>
            <div className="champ">
              <label>Classe souhaitée</label>
              <select
                name="classe"
                value={form.classe}
                onChange={changer}
                required
              >
                <option value="">Sélectionner</option>
                <option value="6ème">6ème</option>
                <option value="5ème">5ème</option>
                <option value="4ème">4ème</option>
                <option value="3ème">3ème</option>
                <option value="2nde">2nde</option>
                <option value="1ère">1ère</option>
                <option value="Terminale">Terminale</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2 */}
        <div className="section">
          <h2>
            <FaUserFriends /> 2. Parent ou tuteur
          </h2>
          <div className="grille">
            <div className="champ">
              <label>Nom complet</label>
              <input
                type="text"
                name="parentNom"
                value={form.parentNom}
                onChange={changer}
                required
              />
            </div>
            <div className="champ">
              <label>Téléphone</label>
              <input
                type="tel"
                name="parentTel"
                value={form.parentTel}
                onChange={changer}
                required
              />
            </div>
            <div className="champ large">
              <label>Adresse e-mail</label>
              <input
                type="email"
                name="parentEmail"
                value={form.parentEmail}
                onChange={changer}
              />
            </div>
          </div>
        </div>

        {/* Section 3 */}
        <div className="section">
          <h2>
            <FaFileUpload /> 3. Documents à fournir
          </h2>
          <p className="aide">Images ou PDF, 5 Mo maximum par fichier.</p>
          <div className="grille">
            <div className="champ">
              <label>Acte de naissance</label>
              <input
                key={'acte' + cleFichiers}
                type="file"
                name="acte"
                accept="image/*,application/pdf"
                onChange={choisirFichier}
              />
            </div>
            <div className="champ">
              <label>Photo d'identité</label>
              <input
                key={'photo' + cleFichiers}
                type="file"
                name="photo"
                accept="image/*"
                onChange={choisirFichier}
              />
            </div>
            <div className="champ">
              <label>Bulletins scolaires</label>
              <input
                key={'bulletins' + cleFichiers}
                type="file"
                name="bulletins"
                accept="image/*,application/pdf"
                onChange={choisirFichier}
              />
            </div>
          </div>
        </div>

        {/* Certification */}
        <label className="certif">
          <input
            type="checkbox"
            name="certifie"
            checked={form.certifie}
            onChange={changer}
            required
          />
          Je certifie l'exactitude des informations.
        </label>

        {/* Boutons */}
        <div className="boutons">
          <button type="button" className="btn-annuler" onClick={annuler}>
            <FaTimes /> Annuler
          </button>
          <button type="submit" className="btn-valider">
            <FaPaperPlane /> Soumettre l'inscription
          </button>
        </div>
      </form>
    </div>
  );
}

export default Inscription;