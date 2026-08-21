const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    // ❌ Pas de token → 401
    if (!token) {
      return res.status(401).json({ erreur: "⛔ Token manquant — Connectez-vous !" });
    }

    // ✅ Vérification du token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔒 Vérification du rôle : admin OU élève autorisé
    const rolesAutorises = ['admin', 'eleve'];
    if (!rolesAutorises.includes(decoded.role)) {
      return res.status(403).json({ erreur: "⛔ Accès réservé aux Élèves" });
    }

    // ✅ Récupération de l'identifiant (deux formats possibles)
    const id_utilisateur = decoded.id_utilisateur || decoded.id;
    if (!id_utilisateur) {
      return res.status(401).json({ erreur: "⛔ Session corrompue — Reconnectez-vous" });
    }

    // 📋 Uniformisation des données utilisateur pour toutes les routes
    req.user = {
      id: id_utilisateur,
      id_utilisateur: id_utilisateur,
      role: decoded.role,
      nom: decoded.nom || null
    };

    console.log("✅ Élève autorisé : ID =", id_utilisateur, "| Rôle =", decoded.role);
    next();

  } catch (e) {
    console.error("❌ ERREUR TOKEN :", e.message);
    return res.status(401).json({ erreur: "⛔ Session invalide ou expirée — Reconnectez-vous" });
  }
};