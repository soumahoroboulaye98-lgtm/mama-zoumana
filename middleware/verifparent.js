const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <TOKEN>"

    // ✅ Token absent
    if (!token) {
      return res.status(401).json({ erreur: "⛔ Token manquant — Connectez-vous !" });
    }

    // ✅ Vérification et décodage du token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Vérification du rôle autorisé
    const rolesAutorises = ['admin', 'parent', 'eleve'];
    if (!rolesAutorises.includes(decoded.role)) {
      return res.status(403).json({ erreur: "⛔ Accès réservé aux Élèves et Parents" });
    }

    // ✅ Prend en charge "id" OU "id_utilisateur" pour une compatibilité totale
    const id_utilisateur = decoded.id_utilisateur || decoded.id;

    // ✅ Identifiant utilisateur introuvable
    if (!id_utilisateur) {
      return res.status(401).json({ erreur: "⛔ Session corrompue — Reconnectez-vous" });
    }

    // ✅ Objet req.user STANDARDISÉ transmis aux routes
    req.user = {
      id: id_utilisateur,           // ✅ Champ "id" conforme aux autres modules
      id_utilisateur: id_utilisateur,// ✅ Alias pour rétrocompatibilité
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