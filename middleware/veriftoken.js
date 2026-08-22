const jwt = require('jsonwebtoken');
require('dotenv').config();

// ✅ CLÉ EN DUR — JAMAIS VIDE, MÊME SI Render n'a pas la variable
const CLE_JWT = 'ma_cle_secrete_pour_le_site_2026';

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // ❌ Pas de token → erreur 401
  if (!token) {
    return res.status(401).json({ erreur: "⛔ Token manquant — Connectez-vous !" });
  }

  try {
    // ✅ Vérifie avec la clé EN DUR
    const decoded = jwt.verify(token, CLE_JWT);

    // ✅ HARMONISÉ : champs conformes à la base Neon (id / prenom)
    req.user = {
      id: decoded.id,
      nom: decoded.nom,
      prenom: decoded.prenom,
      role: decoded.role,
      email: decoded.email
    };

    console.log(`🔑 TOKEN VALIDE — ${decoded.nom || 'Inconnu'} ${decoded.prenom || ''}, Rôle: ${decoded.role}`);

    next();

  } catch (e) {
    console.log("❌ TOKEN INVALIDE ou expiré :", e.message);
    return res.status(401).json({ erreur: "⛔ Token invalide ou expiré" });
  }
};