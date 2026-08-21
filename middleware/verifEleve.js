const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ erreur: "⛔ Token manquant — Connectez-vous !" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const rolesAutorises = ['admin', 'eleve'];
    if (!rolesAutorises.includes(decoded.role)) {
      return res.status(403).json({ erreur: "⛔ Accès réservé aux Élèves" });
    }

    const id_utilisateur = decoded.id_utilisateur || decoded.id;

    if (!id_utilisateur) {
      return res.status(401).json({ erreur: "⛔ Session corrompue — Reconnectez-vous" });
    }

    req.user = {
      id: id_utilisateur,
      id_utilisateur: id_utilisateur,
      role: decoded.role,
      nom: decoded.nom || null
    };

    console.log("✅ Utilisateur autorisé : ID =", id_utilisateur, "| Rôle =", decoded.role);
    next();
  } catch (e) {
    console.error("❌ ERREUR TOKEN :", e.message);
    return res.status(401).json({ erreur: "⛔ Session invalide ou expirée — Reconnectez-vous" });
  }
};