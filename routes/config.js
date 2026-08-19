const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');


// ==================================================
// 🎨 CONFIGURATION DU SITE — cle / valeur
// ==================================================

// ✅ LIRE LA CONFIGURATION (TOUS PEUVENT LIRE)
router.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT cle, valeur FROM configuration_site ORDER BY cle');
    const config = {};
    r.rows.forEach(row => { config[row.cle] = row.valeur; });
    res.json({ ok: true, config });
  } catch (e) {
    // console.log("❌ ERREUR CONFIG :", e.message);
    res.json({ ok: true, config: {} });
  }
});


// ✏️ SAUVEGARDER PLUSIEURS VALEURS (ADMIN SEUL)
router.post('/sauvegarder-tout', verifadmin, async (req, res) => {
  try {
    const { config } = req.body;
    for (const cle in config) {
      await pool.query(`
        INSERT INTO configuration_site (cle, valeur, date_mise_a_jour)
        VALUES ($1, $2, NOW())
        ON CONFLICT (cle) DO UPDATE 
        SET valeur = $2, date_mise_a_jour = NOW()
      `, [cle, config[cle]]);
    }
    res.json({ ok: true, message: "✅ Configuration mise à jour !" });
  } catch (e) {
    // console.log("❌ ERREUR SAUVEGARDE CONFIG :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📢 ANNONCES
// ==================================================

// ✅ LIRE LES ANNONCES PUBLIQUES
router.get('/annonces', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM annonces 
      WHERE est_publie = true 
      ORDER BY date_creation DESC
    `);
    res.json({ ok: true, annonces: r.rows });
  } catch (e) {
    // console.log("❌ ERREUR LISTE ANNONCES :", e.message);
    res.json({ ok: true, annonces: [] });
  }
});


// ➕ AJOUTER UNE ANNONCE (ADMIN)
router.post('/annonces/ajouter', verifadmin, async (req, res) => {
  try {
    const { titre_fr, titre_en, titre_ar, contenu_fr, contenu_en, contenu_ar, type_annonce, date_publication, date_expiration, est_actif, est_publie } = req.body;
    const r = await pool.query(`
      INSERT INTO annonces(
        titre_fr, titre_en, titre_ar, 
        contenu_fr, contenu_en, contenu_ar, 
        type_annonce, date_publication, date_expiration, est_actif, est_publie
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *
    `, [titre_fr, titre_en, titre_ar, contenu_fr, contenu_en, contenu_ar, type_annonce, date_publication || new Date(), date_expiration, est_actif || true, est_publie || true]);
    res.json({ ok: true, annonce: r.rows[0] });
  } catch (e) {
    // console.log("❌ ERREUR AJOUT ANNONCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ✏️ MODIFIER UNE ANNONCE
router.put('/annonces/:id', verifadmin, async (req, res) => {
  try {
    const { titre_fr, titre_en, titre_ar, contenu_fr, contenu_en, contenu_ar, type_annonce, date_expiration, est_actif, est_publie } = req.body;
    const r = await pool.query(`
      UPDATE annonces SET
        titre_fr = $1, titre_en = $2, titre_ar = $3,
        contenu_fr = $4, contenu_en = $5, contenu_ar = $6,
        type_annonce = $7, date_expiration = $8, 
        est_actif = $9, est_publie = $10, date_mise_a_jour = NOW()
      WHERE id_annonce = $11 RETURNING *
    `, [titre_fr, titre_en, titre_ar, contenu_fr, contenu_en, contenu_ar, type_annonce, date_expiration, est_actif, est_publie, req.params.id]);
    res.json({ ok: true, annonce: r.rows[0] });
  } catch (e) {
    // console.log("❌ ERREUR MODIF ANNONCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// 🗑️ SUPPRIMER UNE ANNONCE
router.delete('/annonces/:id', verifadmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM annonces WHERE id_annonce = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    // console.log("❌ ERREUR SUPPR ANNONCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📰 ACTUALITÉS
// ==================================================

router.get('/actualites', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM actualites 
      WHERE est_publie = true 
      ORDER BY date_publication DESC, date_creation DESC
    `);
    res.json({ ok: true, actualites: r.rows });
  } catch (e) {
    // console.log("❌ ERREUR ACTUALITES :", e.message);
    res.json({ ok: true, actualites: [] });
  }
});


// ==================================================
// 📅 ÉVÉNEMENTS
// ==================================================

router.get('/evenements', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM evenements 
      WHERE est_publie = true 
      ORDER BY date_evenement ASC
    `);
    res.json({ ok: true, evenements: r.rows });
  } catch (e) {
    // console.log("❌ ERREUR EVENEMENTS :", e.message);
    res.json({ ok: true, evenements: [] });
  }
});


module.exports = router;