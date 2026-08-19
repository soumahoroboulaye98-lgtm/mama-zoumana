const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');

// 📋 LIRE LES ZONES VISIBLES SUR L'INDEX (Tout le monde)
router.get('/accueil', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM corps_de_page
      WHERE page_identifiant = 'index' AND est_visible = true
      ORDER BY ordre_affichage ASC
    `);
    res.json({ ok: true, zones: r.rows });
  } catch (e) {
    console.log("❌ ERREUR CORPS PAGE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ➕ AJOUTER UNE ZONE (En-tête / Section / Pied) — Admin seul
router.post('/zone/enregistrer', verifadmin, async (req, res) => {
  try {
    const id_utilisateur = req.user?.id_utilisateur;
    const {
      page_identifiant, zone_identifiant,
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_url, ordre_affichage, est_visible
    } = req.body;

    if (!zone_identifiant || !contenu_fr) {
      return res.json({ ok: false, erreur: "Identifiant et contenu en français sont obligatoires" });
    }

    const r = await pool.query(`
      INSERT INTO corps_de_page(
        page_identifiant, zone_identifiant,
        titre_fr, titre_en, titre_ar,
        contenu_fr, contenu_en, contenu_ar,
        image_url, ordre_affichage, est_visible,
        id_utilisateur, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      RETURNING *
    `, [
      page_identifiant || 'index', zone_identifiant,
      titre_fr || null, titre_en || null, titre_ar || null,
      contenu_fr, contenu_en || null, contenu_ar || null,
      image_url || null, ordre_affichage || 0, est_visible !== false,
      id_utilisateur
    ]);

    res.json({ ok: true, zone: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR AJOUT ZONE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ✏️ MODIFIER UNE ZONE (Admin seul)
router.put('/zone/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_url, ordre_affichage, est_visible
    } = req.body;

    const r = await pool.query(`
      UPDATE corps_de_page SET
        titre_fr=$2, titre_en=$3, titre_ar=$4,
        contenu_fr=$5, contenu_en=$6, contenu_ar=$7,
        image_url=$8, ordre_affichage=$9, est_visible=$10,
        date_modification=NOW()
      WHERE id=$1 RETURNING *
    `, [
      id, titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_url, ordre_affichage, est_visible
    ]);

    res.json(r.rows.length ? { ok: true, zone: r.rows[0] } : { ok: false, erreur: "Zone introuvable" });
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION ZONE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ❌ SUPPRIMER UNE ZONE (Admin seul)
router.delete('/zone/:id', verifadmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM corps_de_page WHERE id=$1 RETURNING *', [parseInt(req.params.id)]);
    res.json(r.rows.length ? { ok: true } : { ok: false, erreur: "Zone introuvable" });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;