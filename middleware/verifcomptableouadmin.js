const jwt = require('jsonwebtoken');
require('dotenv').config();
const CLEF_SECRETE = process.env.JWT_SECRET || 'ma_cle_secrete_pour_le_site_2026';

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token)
      return res.status(401).json({ erreur: "⛔ Token manquant — Connectez-vous !" });

    const decoded = jwt.verify(token, CLEF_SECRETE);
    const rolesAutorises = ['admin', 'comptable'];

    if (!rolesAutorises.includes(decoded.role))
      return res.status(403).json({ erreur: "⛔ Accès réservé à l'Administration et à la Comptabilité" });

    const id_utilisateur = decoded.id_utilisateur || decoded.id;
    if (!id_utilisateur)
      return res.status(401).json({ erreur: "⛔ Session corrompue — Reconnectez-vous" });

    // ✅ Injecte l'utilisateur dans la requête pour toutes les routes
    req.user = {
      id: id_utilisateur,
      id_utilisateur,
      role: decoded.role,
      nom: decoded.nom || null
    };

    console.log("✅ Autorisé : ID =", id_utilisateur, "| Rôle =", decoded.role);
    next();
  } catch (e) {
    console.error("❌ ERREUR TOKEN :", e.message);
    return res.status(401).json({ erreur: "⛔ Session invalide ou expirée — Reconnectez-vous" });
  }
};