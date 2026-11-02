
// En ligne, le serveur a la même adresse que le site.
// En local, il est sur le port 3000.
export const SERVEUR = import.meta.env.PROD
  ? window.location.origin
  : 'http://localhost:3000';

export function getToken() {
  return localStorage.getItem('token');
}

// Pour les pages de l'école, le propriétaire et le super administrateur
// comptent comme des administrateurs. Les étiquettes "superAdmin" et
// "proprietaire" leur donnent en plus la gestion des comptes (et le journal).
export function getUtilisateur() {
  try {
    const utilisateur = JSON.parse(localStorage.getItem('utilisateur'));

    if (utilisateur && utilisateur.role === 'proprietaire') {
      return { ...utilisateur, role: 'admin', superAdmin: true, proprietaire: true };
    }

    if (utilisateur && utilisateur.role === 'superadmin') {
      return { ...utilisateur, role: 'admin', superAdmin: true };
    }

    return utilisateur;
  } catch (err) {
    return null;
  }
}

export function enregistrerSession(token, utilisateur) {
  localStorage.setItem('token', token);
  localStorage.setItem('utilisateur', JSON.stringify(utilisateur));
}

// Après un changement de mot de passe : on garde la session avec un nouveau badge
export function remplacerToken(token) {
  localStorage.setItem('token', token);
}

export function deconnecter() {
  localStorage.removeItem('token');
  localStorage.removeItem('utilisateur');
}

// Adresse d'un fichier (photo, acte...) avec le badge
export function urlFichier(nom) {
  return SERVEUR + '/uploads/' + nom + '?token=' + getToken();
}

// Le gardien : colle automatiquement le badge sur chaque demande
// envoyée au serveur, et renvoie à la connexion si le badge est refusé.
if (!window.__gardienActif) {
  window.__gardienActif = true;
  const fetchOriginal = window.fetch.bind(window);

  window.fetch = async (url, options = {}) => {
    // Les pages écrivent l'adresse de test : en ligne, on la remplace
    const adresse = String(url).replace('http://localhost:3000', SERVEUR);
    const versServeur = adresse.startsWith(SERVEUR);

    if (versServeur && getToken()) {
      options = {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: 'Bearer ' + getToken(),
        },
      };
    }

    const reponse = await fetchOriginal(adresse, options);

    if (
      versServeur &&
      reponse.status === 401 &&
      !adresse.includes('/api/login')
    ) {
      deconnecter();
      window.location.href = '/connexion';
    }

    return reponse;
  };
}