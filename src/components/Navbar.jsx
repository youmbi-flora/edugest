
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FaGraduationCap,
  FaChartPie,
  FaUserPlus,
  FaEdit,
  FaUsers,
  FaListAlt,
  FaHistory,
  FaTrashRestore,
  FaBars,
  FaTimes,
  FaUserShield,
  FaSignOutAlt,
} from 'react-icons/fa';
import { getUtilisateur, deconnecter } from '../auth';
import '../Navbar.css';
import '../Compte.css';
import '../Actions.css';

const nomsRoles = {
  admin: 'Administrateur',
  secretaire: 'Secrétaire',
  enseignant: 'Enseignant',
};

// Chaque lien indique quels rôles ont le droit de le voir
const tousLesLiens = [
  { to: '/', texte: 'Dashboard', icone: <FaChartPie />, end: true,
    roles: ['admin', 'secretaire', 'enseignant'] },
  { to: '/inscription', texte: 'Inscription', icone: <FaUserPlus />,
    roles: ['admin', 'secretaire'] },
  { to: '/notes', texte: 'Notes', icone: <FaEdit />,
    roles: ['admin', 'enseignant'] },
  { to: '/etudiants', texte: 'Étudiants', icone: <FaUsers />,
    roles: ['admin', 'secretaire', 'enseignant'] },
  { to: '/liste-notes', texte: 'Liste des notes', icone: <FaListAlt />,
    roles: ['admin', 'secretaire', 'enseignant'] },
  { to: '/corbeille', texte: 'Corbeille', icone: <FaTrashRestore />,
    roles: ['admin'] },
  { to: '/journal', texte: 'Journal', icone: <FaHistory />,
    roles: ['admin'], proprietaire: true },
];

function Navbar() {
  const [ouvert, setOuvert] = useState(false);
  const navigate = useNavigate();
  const utilisateur = getUtilisateur();

  const fermer = () => setOuvert(false);

  const sortir = () => {
    deconnecter();
    fermer();
    navigate('/connexion');
  };

  // Seulement les liens autorisés pour ce rôle
  const liensVisibles = tousLesLiens.filter(
    (lien) =>
      utilisateur &&
      lien.roles.includes(utilisateur.role) &&
      (!lien.proprietaire || utilisateur.proprietaire)
  );

  let etiquette = '';
  if (utilisateur) {
    etiquette = nomsRoles[utilisateur.role];
    if (utilisateur.superAdmin) etiquette = 'Super administrateur';
    if (utilisateur.proprietaire) etiquette = 'Propriétaire';
  }

  return (
    <nav className="navbar">
      <h2 className="logo">
        <FaGraduationCap /> EduGest
      </h2>

      <button className="burger" onClick={() => setOuvert(!ouvert)}>
        {ouvert ? <FaTimes /> : <FaBars />}
      </button>

      <div className={ouvert ? 'liens ouvert' : 'liens'}>
        {liensVisibles.map((lien) => (
          <NavLink key={lien.to} to={lien.to} end={lien.end} onClick={fermer}>
            {lien.icone} {lien.texte}
          </NavLink>
        ))}

        {utilisateur && (
          <>
            <NavLink
              to="/comptes"
              className="compte"
              onClick={fermer}
              title="Mon compte"
            >
              <span className="compte-avatar">
                <FaUserShield />
              </span>
              <span className="compte-info">
                <strong>{utilisateur.nom}</strong>
                <small>{etiquette}</small>
              </span>
            </NavLink>

            <button type="button" className="btn-deconnexion" onClick={sortir}>
              <FaSignOutAlt /> Déconnexion
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;