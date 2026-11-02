




import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { FaBan } from 'react-icons/fa';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Dashboard from './pages/Dashboard';
import Inscription from './pages/Inscription';
import GestionNotes from './pages/GestionNotes';
import Etudiants from './pages/Etudiants';
import ListeNotes from './pages/ListeNotes';
import Connexion from './pages/Connexion';
import Comptes from './pages/Comptes';
import Journal from './pages/Journal';
import Corbeille from './pages/Corbeille';
import { getToken, getUtilisateur } from './auth';
import './App.css';

// Message affiché quand le rôle n'a pas le droit d'entrer
function AccesRefuse() {
  return (
    <div className="acces-refuse">
      <FaBan />
      <h2>Accès refusé</h2>
      <p>Ton rôle ne te permet pas d'ouvrir cette page.</p>
    </div>
  );
}

// Le gardien d'une page : badge obligatoire, et rôle autorisé
function Protegee({ roles, proprietaire, children }) {
  const utilisateur = getUtilisateur();

  if (!getToken() || !utilisateur) {
    return <Navigate to="/connexion" replace />;
  }

  if (roles && !roles.includes(utilisateur.role)) {
    return <AccesRefuse />;
  }

  // Page réservée au propriétaire (le journal)
  if (proprietaire && !utilisateur.proprietaire) {
    return <AccesRefuse />;
  }

  return children;
}

function App() {
  const location = useLocation();
  const surConnexion = location.pathname === '/connexion';

  return (
    <>
      {!surConnexion && <Navbar />}

      <main className={surConnexion ? 'contenu-connexion' : 'contenu'}>
        <Routes>
          <Route path="/connexion" element={<Connexion />} />

          <Route
            path="/"
            element={
              <Protegee>
                <Dashboard />
              </Protegee>
            }
          />
          <Route
            path="/inscription"
            element={
              <Protegee roles={['admin', 'secretaire']}>
                <Inscription />
              </Protegee>
            }
          />
          <Route
            path="/notes"
            element={
              <Protegee roles={['admin', 'enseignant']}>
                <GestionNotes />
              </Protegee>
            }
          />
          <Route
            path="/etudiants"
            element={
              <Protegee>
                <Etudiants />
              </Protegee>
            }
          />
          <Route
            path="/liste-notes"
            element={
              <Protegee>
                <ListeNotes />
              </Protegee>
            }
          />
          <Route
            path="/corbeille"
            element={
              <Protegee roles={['admin']}>
                <Corbeille />
              </Protegee>
            }
          />
          <Route
            path="/comptes"
            element={
              <Protegee>
                <Comptes />
              </Protegee>
            }
          />
          <Route
            path="/journal"
            element={
              <Protegee proprietaire>
                <Journal />
              </Protegee>
            }
          />
        </Routes>
      </main>

      {!surConnexion && <Footer />}
    </>
  );
}

export default App;














