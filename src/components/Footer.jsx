
import { FaGraduationCap } from 'react-icons/fa';
import '../Footer.css';

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-contenu">
        <div className="footer-marque">
          <FaGraduationCap />
          <span>EduGest</span>
        </div>
        <p>© 2026 EduGest · Gestion des étudiants</p>
      </div>
    </footer>
  );
}

export default Footer;