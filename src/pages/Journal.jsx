
import { useState, useEffect } from 'react';
import { FaHistory, FaSearch, FaSyncAlt } from 'react-icons/fa';
import { SERVEUR } from '../auth';
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

// La couleur de l'étiquette selon le type d'action
function typeAction(action) {
  const a = (action || '').toLowerCase();
  if (a.includes('échou') || a.includes('supprim')) return 'danger';
  if (a.includes('connexion')) return 'info';
  return 'ok';
}

// "2026-10-29 08:30:00" (heure du serveur) devient "29/10/2026 09:30"
function formaterDate(texte) {
  if (!texte) return '';
  const date = new Date(texte.replace(' ', 'T') + 'Z');
  if (isNaN(date.getTime())) return texte;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Journal() {
  const [liste, setListe] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = () => {
    fetch(SERVEUR + '/api/journal')
      .then((reponse) => reponse.json())
      .then((donnees) => {
        if (Array.isArray(donnees)) {
          setListe(donnees);
          setErreur('');
        } else {
          setErreur(donnees.erreur || 'Impossible de lire le journal.');
        }
      })
      .catch(() => {
        setErreur('Le serveur ne répond pas.');
      });
  };

  useEffect(() => {
    charger();
  }, []);

  const resultat = liste.filter((ligne) =>
    (
      (ligne.identifiant || '') + ' ' +
      (ligne.action || '') + ' ' +
      (ligne.details || '') + ' ' +
      (ligne.adresse_ip || '')
    )
      .toLowerCase()
      .includes(recherche.toLowerCase())
  );

  return (
    <div className="page-form page-notes">
      <div className="entete-form">
        <h1>Journal d'activité</h1>
        <p>Les 500 dernières actions de tous les utilisateurs</p>
      </div>

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="section">
        <h2>
          <FaHistory /> Activité ({resultat.length})
        </h2>

        <div className="outils">
          <div className="barre-recherche">
            <FaSearch />
            <input
              type="text"
              placeholder="Rechercher un utilisateur, une action..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <button type="button" className="btn-rafraichir" onClick={charger}>
            <FaSyncAlt /> Actualiser
          </button>
        </div>

        {resultat.length === 0 ? (
          <p className="vide">Aucune activité à afficher.</p>
        ) : (
          <div className="zone-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Action</th>
                  <th>Détails</th>
                  <th>Adresse IP</th>
                </tr>
              </thead>
              <tbody>
                {resultat.map((ligne) => (
                  <tr key={ligne.id}>
                    <td data-label="Date">{formaterDate(ligne.date_action)}</td>
                    <td data-label="Utilisateur">{ligne.identifiant || '-'}</td>
                    <td data-label="Rôle">
                      {ligne.role ? nomsRoles[ligne.role] || ligne.role : '-'}
                    </td>
                    <td data-label="Action">
                      <span className={'badge-action ' + typeAction(ligne.action)}>
                        {ligne.action}
                      </span>
                    </td>
                    <td data-label="Détails">{ligne.details || '-'}</td>
                    <td data-label="Adresse IP">{ligne.adresse_ip || '-'}</td>
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

export default Journal;