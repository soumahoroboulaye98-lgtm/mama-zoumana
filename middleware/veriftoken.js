const jwt = require('jsonwebtoken');
require('dotenv').config(); // ✅ Charge les variables d'environnement

// ✅ Clé unifiée : même valeur partout
const CLE_JWT = process.env.JWT_SECRET || 'ma_cle_secrete_pour_le_site_2026';

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // ❌ Pas de token → renvoie une erreur 401
  if (!token) {
    return res.status(401).json({ erreur: "⛔ Token manquant — Connectez-vous !" });
  }

  try {
    // ✅ Vérifie le token avec la clé unifiée
    const decoded = jwt.verify(token, CLE_JWT);

    // ✅ HARMONISÉ : utilise id et prenom (conforme à la base Neon)
    req.user = {
      id: decoded.id,           // ← id (PAS id_utilisateur)
      nom: decoded.nom,
      prenom: decoded.prenom,   // ← prenom (PAS prenoms)
      role: decoded.role,
      email: decoded.email
    };

    // ✅ Log harmonisé
    console.log(`🔑 TOKEN VALIDE — Utilisateur: ${decoded.nom || 'Inconnu'} ${decoded.prenom || ''}, Rôle: ${decoded.role}`);

    next(); // ✅ Token valide → passe à la suite

  } catch (e) {
    console.log("❌ TOKEN INVALIDE ou expiré :", e.message);
    return res.status(401).json({ erreur: "⛔ Token invalide ou expiré" });
  }
};