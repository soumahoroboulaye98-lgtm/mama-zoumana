const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({ erreur: "⛔ Token manquant — Connecte-toi !" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ Vérifie le rôle
    if (!['admin', 'prof', 'directeur'].includes(decoded.role)) {
      return res.status(403).json({ erreur: "⛔ Accès réservé aux Professeurs" });
    }

    // ✅ ACCEPTE "id" OU "id_utilisateur" pour éviter l'erreur !
    const id_utilisateur = decoded.id_utilisateur || decoded.id;
    
    if (!id_utilisateur) {
      return res.status(401).json({ erreur: "⛔ Session corrompue — Reconnecte-toi" });
    }

    // ✅ Transmet les infos STANDARDISÉES à la route
    req.user = {
      id_utilisateur: id_utilisateur, // ✅ Garanti présent !
      role: decoded.role,
      nom: decoded.nom
    };
    
    console.log("✅ Utilisateur autorisé : ID =", id_utilisateur, "| Rôle =", decoded.role);
    next();
  } catch (e) {
    console.error("❌ ERREUR TOKEN :", e.message);
    return res.status(401).json({ erreur: "⛔ Session invalide ou expirée — Reconnecte-toi" });
  }
};