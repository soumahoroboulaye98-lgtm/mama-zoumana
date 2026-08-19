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

    // ✅ Autorise : Admin OU Directeur
    if (!['admin', 'directeur'].includes(decoded.role)) {
      return res.status(403).json({ erreur: "⛔ Accès réservé au Directeur" });
    }

    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ erreur: "⛔ Session invalide ou expirée" });
  }
};