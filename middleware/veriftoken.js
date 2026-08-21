const jwt = require('jsonwebtoken');
require('dotenv').config(); // ✅ Charge les variables d'environnement


module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // ❌ Pas de token → renvoie une erreur 401
  if (!token) {
    return res.status(401).json({ erreur: "⛔ Token manquant — Connectez-vous !" });
  }

  try {
    // ✅ Vérifie le token avec la clé du fichier .env
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;

    // Log pour le suivi
    console.log(`🔑 TOKEN VALIDE — Utilisateur: ${decoded.nom || 'inconnu'}, Rôle: ${decoded.role}`);

    next(); // ✅ Token valide → passe à la suite

  } catch (e) {
    console.log("❌ TOKEN INVALIDE ou expiré :", e.message);
    return res.status(401).json({ erreur: "⛔ Token invalide ou expiré" });
  }
};