const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté systématiquement
const verifadmin = require('../middleware/verifadmin');   // ✅ Middleware spécifique Administrateur

// ✅ Protection groupée uniforme : token + vérification du rôle Administrateur
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📋 CHARGER LES ZONES DE LA PAGE D'ACCUEIL
// 🌐 Publique — Consultable par tout le monde
// ==================================================
router.get('/accueil', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM corps_de_page
      WHERE page_identifiant = 'index' AND est_visible = true
      ORDER BY ordre_affichage ASC
    `);

    console.log(`✅ Zones de la page d'accueil chargées — ${r.rows.length} zone(s)`);
    res.json({ ok: true, zones: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT ZONES PAGE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UNE NOUVELLE ZONE DE CONTENU
// 🔒 Réservé : Administrateur authentifié
// ==================================================
router.post('/zone/enregistrer', protegerAdmin, async (req, res) => {
  try {
    const id_utilisateur = req.user?.id_utilisateur;

    const {
      page_identifiant, zone_identifiant,
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_url, ordre_affichage, est_visible
    } = req.body;

    // Validation des champs obligatoires
    if (!zone_identifiant || !contenu_fr || contenu_fr.trim() === '') {
      return res.json({
        ok: false,
        erreur: "⚠️ Identifiant de zone et contenu en français sont obligatoires"
      });
    }

    // Insertion dans la base de données
    const r = await pool.query(`
      INSERT INTO corps_de_page(
        page_identifiant, zone_identifiant,
        titre_fr, titre_en, titre_ar,
        contenu_fr, contenu_en, contenu_ar,
        image_url, ordre_affichage, est_visible,
        id_utilisateur, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `, [
      page_identifiant || 'index', zone_identifiant,
      titre_fr || null, titre_en || null, titre_ar || null,
      contenu_fr, contenu_en || null, contenu_ar || null,
      image_url || null, ordre_affichage || 0, est_visible !== false,
      id_utilisateur
    ]);

    console.log(`✅ Zone créée — Identifiant: ${zone_identifiant}, Page: ${page_identifiant || 'index'}`);
    res.json({ ok: true, zone: r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR CRÉATION ZONE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UNE ZONE DE CONTENU EXISTANTE
// 🔒 Réservé : Administrateur authentifié
// ==================================================
router.put('/zone/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant de zone invalide" });
    }

    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_url, ordre_affichage, est_visible
    } = req.body;

    // Mise à jour de la zone
    const r = await pool.query(`
      UPDATE corps_de_page SET
        titre_fr = $2, titre_en = $3, titre_ar = $4,
        contenu_fr = $5, contenu_en = $6, contenu_ar = $7,
        image_url = $8, ordre_affichage = $9, est_visible = $10,
        date_modification = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      id, titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_url, ordre_affichage, est_visible
    ]);

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Zone introuvable" });
    }

    console.log(`✅ Zone mise à jour — ID: ${id}`);
    res.json({ ok: true, zone: r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR MODIFICATION ZONE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UNE ZONE DE CONTENU
// 🔒 Réservé : Administrateur authentifié
// ==================================================
router.delete('/zone/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant de zone invalide" });
    }

    const r = await pool.query('DELETE FROM corps_de_page WHERE id = $1 RETURNING *', [id]);

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Zone introuvable" });
    }

    console.log(`🗑️ Zone supprimée — ID: ${id}`);
    res.json({ ok: true });

  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION ZONE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;