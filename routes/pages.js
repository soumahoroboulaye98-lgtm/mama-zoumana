const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==================================================
// 🔐 MIDDLEWARES DE PROTECTION
// ==================================================
let veriftoken, verifadmin, protegerAdmin;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  protegerAdmin = [veriftoken, verifadmin];
} catch {
  protegerAdmin = []; // Mode développement sans middleware
  console.warn("⚠️ Middlewares introuvables — accès admin ouvert temporairement");
}

// ==================================================
// 🌐 LIRE UNE PAGE PUBLIQUE — /api/pages/:identifiant
// ==================================================
router.get('/:identifiant', async (req, res) => {
  try {
    const { identifiant } = req.params;

    const { rows: [page] } = await pool.query(`
      SELECT id_page, identifiant,
             titre_fr, titre_en, titre_ar,
             contenu_fr, contenu_en, contenu_ar,
             image_principale, est_publie,
             date_creation, date_mise_a_jour
      FROM pages_contenu
      WHERE identifiant = $1 AND est_publie = true
      LIMIT 1
    `, [identifiant]);

    if (!page) {
      return res.json({ ok: false, erreur: "Page introuvable ou non publiée" });
    }

    res.json({ ok: true, page });
  } catch (erreur) {
    console.error("❌ Erreur lecture page :", erreur.message);
    res.json({ ok: false, erreur: erreur.message });
  }
});

// ==================================================
// 📋 LISTER TOUTES LES PAGES — Admin uniquement
// ==================================================
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM pages_contenu ORDER BY identifiant ASC
    `);
    res.json({ ok: true, pages: rows });
  } catch (erreur) {
    console.error("❌ Erreur liste pages :", erreur.message);
    res.json({ ok: false, erreur: erreur.message });
  }
});

// ==================================================
// 💾 SAUVEGARDER / CRÉER UNE PAGE — Admin uniquement
// ==================================================
router.post('/sauvegarder', protegerAdmin, async (req, res) => {
  try {
    const {
      identifiant,
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_principale,
      est_publie
    } = req.body;

    // ✅ Validations
    if (!identifiant || !titre_fr || !contenu_fr) {
      return res.json({
        ok: false,
        erreur: "⚠️ Identifiant, Titre Français et Contenu Français sont obligatoires"
      });
    }

    const idUtilisateur = req.user?.id || null;

    const { rows } = await pool.query(`
      INSERT INTO pages_contenu (
        identifiant,
        titre_fr, titre_en, titre_ar,
        contenu_fr, contenu_en, contenu_ar,
        image_principale,
        est_publie,
        date_mise_a_jour,
        id_utilisateur_modificateur
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
      ON CONFLICT (identifiant) DO UPDATE SET
        titre_fr = EXCLUDED.titre_fr,
        titre_en = EXCLUDED.titre_en,
        titre_ar = EXCLUDED.titre_ar,
        contenu_fr = EXCLUDED.contenu_fr,
        contenu_en = EXCLUDED.contenu_en,
        contenu_ar = EXCLUDED.contenu_ar,
        image_principale = EXCLUDED.image_principale,
        est_publie = EXCLUDED.est_publie,
        date_mise_a_jour = NOW(),
        id_utilisateur_modificateur = $10
      RETURNING *
    `, [
      identifiant,
      titre_fr.trim() || null,
      titre_en?.trim() || null,
      titre_ar?.trim() || null,
      contenu_fr.trim() || null,
      contenu_en?.trim() || null,
      contenu_ar?.trim() || null,
      image_principale?.trim() || null,
      est_publie !== false,
      idUtilisateur
    ]);

    res.json({
      ok: true,
      message: "✅ Page sauvegardée avec succès",
      page: rows[0]
    });
  } catch (erreur) {
    console.error("❌ Erreur sauvegarde page :", erreur.message);
    res.json({ ok: false, erreur: erreur.message });
  }
});

module.exports = router;