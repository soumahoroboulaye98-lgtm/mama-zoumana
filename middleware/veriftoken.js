const jwt = require('jsonwebtoken');

// ✅ CLÉ EN DUR — VALEUR FIXE, JAMAIS VIDE
const CLE_JWT = 'ma_cle_secrete_pour_le_site_2026';

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ erreur: "⛔ Token manquant — Connectez-vous !" });
  }

  try {
    // ✅ Clé en dur
    const decoded = jwt.verify(token, CLE_JWT);

    req.user = {
      id: decoded.id,
      nom: decoded.nom,
      prenom: decoded.prenom,
      role: decoded.role,
      email: decoded.email
    };

    console.log(`🔑 TOKEN VALIDE — ${decoded.nom} ${decoded.prenom}, Rôle: ${decoded.role}`);
    next();

  } catch (e) {
    console.log("❌ ERREUR TOKEN :", e.message);
    return res.status(401).json({ erreur: "⛔ Token invalide ou expiré" });
  }
};