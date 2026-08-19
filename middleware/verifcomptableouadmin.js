const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ erreur: "⛔ Token manquant — Connecte-toi !" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ Autorise : Admin OU Comptable
    if (!['admin', 'comptable'].includes(decoded.role)) {
      return res.status(403).json({ erreur: "⛔ Accès réservé à Admin ou Comptable" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ erreur: "⛔ Token invalide — Reconnecte-toi !" });
  }
};