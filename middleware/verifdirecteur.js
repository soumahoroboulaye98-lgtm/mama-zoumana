const jwt = require('jsonwebtoken');
require('dotenv').config();

// ✅ Valeur par défaut si la variable d'environnement est absente
const CLEF_SECRETE = process.env.JWT_SECRET || 'ma_cle_secrete_pour_le_site_2026';


module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <TOKEN>"

    // ✅ Token absent
    if (!token) {
      return res.status(401).json({ erreur: "⛔ Token manquant — Connectez-vous !" });
    }

    // ✅ Vérification avec la clé (variable OU valeur par défaut)
    const decoded = jwt.verify(token, CLEF_SECRETE);

    // ✅ Vérification du rôle autorisé
    const rolesAutorises = ['admin', 'directeur'];
    if (!rolesAutorises.includes(decoded.role)) {
      return res.status(403).json({ erreur: "⛔ Accès réservé à l'Administration et à la Direction" });
    }

    // ✅ Prend en charge "id" OU "id_utilisateur" pour une compatibilité totale
    const id_utilisateur = decoded.id_utilisateur || decoded.id;

    // ✅ Identifiant utilisateur introuvable
    if (!id_utilisateur) {
      return res.status(401).json({ erreur: "⛔ Session corrompue — Reconnectez-vous" });
    }

    // ✅ Objet req.user STANDARDISÉ transmis aux routes
    req.user = {
      id: id_utilisateur,              // ✅ Champ "id" conforme aux autres modules
      id_utilisateur: id_utilisateur,   // ✅ Alias pour rétrocompatibilité
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