const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.json({ erreur: "⛔ Token manquant — Connectez-vous !" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    console.log(`🔑 TOKEN VALIDE — Utilisateur: ${decoded.nom || 'inconnu'}, Rôle: ${decoded.role}`);
    next();
  } catch (e) {
    console.log("❌ TOKEN INVALIDE ou expiré :", e.message);
    return res.json({ erreur: "⛔ Token invalide ou expiré" });
  }
};