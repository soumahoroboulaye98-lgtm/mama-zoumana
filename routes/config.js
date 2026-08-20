const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté systématiquement
const verifadmin = require('../middleware/verifadmin');   // ✅ Middleware spécifique Administrateur

// ✅ Protection groupée uniforme : token + vérification du rôle Administrateur
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 🎨 CONFIGURATION DU SITE (Clé / Valeur)
// ==================================================

// 🔓 Lire la configuration — Tout le monde peut consulter
router.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT cle, valeur FROM configuration_site ORDER BY cle');
    const config = {};
    r.rows.forEach(row => { config[row.cle] = row.valeur; });

    console.log(`✅ Configuration du site consultée — ${Object.keys(config).length} paramètre(s)`);
    res.json({ ok: true, config });

  } catch (e) {
    console.error("❌ ERREUR LECTURE CONFIGURATION :", e.message);
    res.json({ ok: true, config: {} });
  }
});


// 🔒 Sauvegarder plusieurs valeurs — Administrateur seul
router.post('/sauvegarder-tout', protegerAdmin, async (req, res) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.json({ ok: false, erreur: "⚠️ Aucune valeur de configuration fournie" });
    }

    for (const cle in config) {
      await pool.query(`
        INSERT INTO configuration_site (cle, valeur, date_mise_a_jour)
        VALUES ($1, $2, NOW())
        ON CONFLICT (cle) DO UPDATE 
        SET valeur = $2, date_mise_a_jour = NOW()
      `, [cle, config[cle]]);
    }

    console.log(`✅ Configuration mise à jour — ${Object.keys(config).length} paramètre(s) modifié(s)`);
    res.json({ ok: true, message: "✅ Configuration mise à jour avec succès !" });

  } catch (e) {
    console.error("❌ ERREUR SAUVEGARDE CONFIGURATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📢 ANNONCES
// ==================================================

// 🔓 Lire les annonces publiques
router.get('/annonces', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM annonces 
      WHERE est_publie = true 
      ORDER BY date_creation DESC
    `);

    console.log(`✅ Annonces publiques consultées — ${r.rows.length} enregistrement(s)`);
    res.json({ ok: true, annonces: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT ANNONCES :", e.message);
    res.json({ ok: true, annonces: [] });
  }
});


// 🔓 Ajouter une annonce — Administrateur seul
router.post('/annonces/ajouter', protegerAdmin, async (req, res) => {
  try {
    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      type_annonce, date_publication, date_expiration, est_actif, est_publie
    } = req.body;

    const r = await pool.query(`
      INSERT INTO annonces(
        titre_fr, titre_en, titre_ar,
        contenu_fr, contenu_en, contenu_ar,
        type_annonce, date_publication, date_expiration, est_actif, est_publie
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *
    `, [
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      type_annonce, date_publication || new Date(), date_expiration,
      est_actif !== false, est_publie !== false
    ]);

    console.log(`✅ Annonce créée — ID: ${r.rows[0].id_annonce}`);
    res.json({ ok: true, annonce: r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR CRÉATION ANNONCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// 🔓 Modifier une annonce — Administrateur seul
router.put('/annonces/:id', protegerAdmin, async (req, res) => {
  try {
    const id_annonce = parseInt(req.params.id);
    if (isNaN(id_annonce)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant d'annonce invalide" });
    }

    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      type_annonce, date_expiration, est_actif, est_publie
    } = req.body;

    const r = await pool.query(`
      UPDATE annonces SET
        titre_fr = $1, titre_en = $2, titre_ar = $3,
        contenu_fr = $4, contenu_en = $5, contenu_ar = $6,
        type_annonce = $7, date_expiration = $8, 
        est_actif = $9, est_publie = $10, date_mise_a_jour = NOW()
      WHERE id_annonce = $11 RETURNING *
    `, [
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      type_annonce, date_expiration, est_actif, est_publie, id_annonce
    ]);

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Annonce introuvable" });
    }

    console.log(`✅ Annonce mise à jour — ID: ${id_annonce}`);
    res.json({ ok: true, annonce: r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR MODIFICATION ANNONCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// 🔓 Supprimer une annonce — Administrateur seul
router.delete('/annonces/:id', protegerAdmin, async (req, res) => {
  try {
    const id_annonce = parseInt(req.params.id);
    if (isNaN(id_annonce)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant d'annonce invalide" });
    }

    const r = await pool.query('DELETE FROM annonces WHERE id_annonce = $1 RETURNING id_annonce', [id_annonce]);

    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "⚠️ Annonce introuvable" });
    }

    console.log(`🗑️ Annonce supprimée — ID: ${id_annonce}`);
    res.json({ ok: true });

  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION ANNONCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📰 ACTUALITÉS PUBLIQUES
// ==================================================

router.get('/actualites', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM actualites 
      WHERE est_publie = true 
      ORDER BY date_publication DESC, date_creation DESC
    `);

    console.log(`✅ Actualités publiques consultées — ${r.rows.length} enregistrement(s)`);
    res.json({ ok: true, actualites: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT ACTUALITÉS :", e.message);
    res.json({ ok: true, actualites: [] });
  }
});


// ==================================================
// 📅 ÉVÉNEMENTS PUBLICS
// ==================================================

router.get('/evenements', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM evenements 
      WHERE est_publie = true 
      ORDER BY date_evenement ASC
    `);

    console.log(`✅ Événements publics consultés — ${r.rows.length} enregistrement(s)`);
    res.json({ ok: true, evenements: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT ÉVÉNEMENTS :", e.message);
    res.json({ ok: true, evenements: [] });
  }
});


module.exports = router;