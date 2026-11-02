
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaGraduationCap,
  FaUser,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaSignInAlt,
} from 'react-icons/fa';
import { SERVEUR, enregistrerSession } from '../auth';
import '../Connexion.css';

function Connexion() {
  const navigate = useNavigate();

  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const seConnecter = async (e) => {
    e.preventDefault();
    setErreur('');
    setChargement(true);

    try {
      const reponse = await fetch(SERVEUR + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant, motDePasse }),
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.erreur || 'Une erreur est survenue.');
        setChargement(false);
        return;
      }

      // On range le badge dans le navigateur
      enregistrerSession(donnees.token, donnees.utilisateur);
      navigate('/');
    } catch (err) {
      setErreur('Le serveur ne répond pas. Lance-le avec : node server.js');
    }

    setChargement(false);
  };

  return (
    <div className="carte-connexion">
      <div className="logo-connexion">
        <FaGraduationCap />
      </div>
      <h1>EduGest</h1>
      <p className="sous-titre">Connecte-toi pour accéder à la gestion de l'école</p>

      {erreur && <div className="erreur">{erreur}</div>}

      <form onSubmit={seConnecter}>
        <div className="champ-connexion">
          <FaUser />
          <input
            type="text"
            placeholder="Identifiant"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="champ-connexion">
          <FaLock />
          <input
            type={voir ? 'text' : 'password'}
            placeholder="Mot de passe"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="oeil"
            onClick={() => setVoir(!voir)}
            title="Afficher ou cacher le mot de passe"
          >
            {voir ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>

        <button type="submit" className="btn-connexion" disabled={chargement}>
          <FaSignInAlt /> {chargement ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}

export default Connexion;