const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection : Token + Administrateur uniquement
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 🎨 CONFIGURATION DU SITE
// ==================================================

// 🔓 Lire la configuration — Tout le monde
router.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT cle, valeur FROM configuration_site ORDER BY cle');
    const config = Object.fromEntries(r.rows.map(row => [row.cle, row.valeur]));
    console.log(`✅ Configuration consultée — ${Object.keys(config).length} paramètre(s)`);
    return res.status(200).json({ ok: true, config });
  } catch (e) {
    console.error("❌ ERREUR LECTURE CONFIGURATION :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur serveur", config: {} });
  }
});

// 🔒 Sauvegarder plusieurs valeurs — Admin seul
router.post('/sauvegarder-tout', protegerAdmin, async (req, res) => {
  try {
    const { config } = req.body;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Objet de configuration attendu" });
    }
    const entrees = Object.entries(config);
    if (entrees.length === 0) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Aucune valeur fournie" });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [cle, valeur] of entrees) {
        await client.query(`
          INSERT INTO configuration_site (cle, valeur, date_mise_a_jour)
          VALUES ($1, $2, NOW())
          ON CONFLICT (cle) DO UPDATE 
          SET valeur = $2, date_mise_a_jour = NOW()
        `, [cle, valeur]);
      }
      await client.query('COMMIT');
      console.log(`✅ Configuration mise à jour — ${entrees.length} paramètre(s)`);
      return res.status(200).json({ ok: true, message: "✅ Configuration sauvegardée !" });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("❌ ERREUR SAUVEGARDE :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur lors de la sauvegarde" });
  }
});

// ==================================================
// 📢 ANNONCES
// ==================================================

// 🔓 Lire publiquement
router.get('/annonces', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM annonces WHERE est_publie = true ORDER BY date_creation DESC
    `);
    console.log(`✅ Annonces — ${r.rows.length}`);
    return res.status(200).json({ ok: true, annonces: r.rows });
  } catch (e) {
    console.error("❌ ERREUR ANNONCES :", e.message);
    return res.status(500).json({ ok: true, annonces: [] });
  }
});

// 🔒 Ajouter
router.post('/annonces/ajouter', protegerAdmin, async (req, res) => {
  try {
    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      type_annonce, date_publication, date_expiration, est_actif, est_publie
    } = req.body;

    if (!titre_fr || !contenu_fr) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Titre et contenu FR obligatoires" });
    }

    const valeurs = [
      titre_fr?.trim(), titre_en?.trim(), titre_ar?.trim(),
      contenu_fr?.trim(), contenu_en?.trim(), contenu_ar?.trim(),
      type_annonce || 'information', date_publication || new Date(),
      date_expiration || null, est_actif !== false, est_publie !== false
    ];

    const r = await pool.query(`
      INSERT INTO annonces(
        titre_fr, titre_en, titre_ar, contenu_fr, contenu_en, contenu_ar,
        type_annonce, date_publication, date_expiration, est_actif, est_publie
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, valeurs);

    console.log(`✅ Annonce créée ID:${r.rows[0].id_annonce}`);
    return res.status(201).json({ ok: true, annonce: r.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR CRÉATION ANNONCE :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur création" });
  }
});

// 🔒 Modifier
router.put('/annonces/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });

    const {
      titre_fr, titre_en, titre_ar, contenu_fr, contenu_en, contenu_ar,
      type_annonce, date_expiration, est_actif, est_publie
    } = req.body;

    const r = await pool.query(`
      UPDATE annonces SET
        titre_fr=$1, titre_en=$2, titre_ar=$3, contenu_fr=$4, contenu_en=$5, contenu_ar=$6,
        type_annonce=$7, date_expiration=$8, est_actif=$9, est_publie=$10, date_mise_a_jour=NOW()
      WHERE id_annonce=$11 RETURNING *
    `, [titre_fr?.trim(), titre_en?.trim(), titre_ar?.trim(), contenu_fr?.trim(), contenu_en?.trim(), contenu_ar?.trim(),
        type_annonce, date_expiration, est_actif, est_publie, id]);

    if (r.rows.length === 0) return res.status(404).json({ ok: false, erreur: "⚠️ Annonce introuvable" });
    console.log(`✅ Annonce modifiée ID:${id}`);
    return res.status(200).json({ ok: true, annonce: r.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR MODIF ANNONCE :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur modification" });
  }
});

// 🔒 Supprimer
router.delete('/annonces/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });
    const r = await pool.query('DELETE FROM annonces WHERE id_annonce=$1 RETURNING id_annonce', [id]);
    if (r.rowCount === 0) return res.status(404).json({ ok: false, erreur: "⚠️ Annonce introuvable" });
    console.log(`🗑️ Annonce supprimée ID:${id}`);
    return res.status(200).json({ ok: true, message: "✅ Supprimée" });
  } catch (e) {
    console.error("❌ ERREUR SUPPR ANNONCE :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur suppression" });
  }
});

// ==================================================
// 📰 ACTUALITÉS
// ==================================================

// 🔓 Lire publiquement
router.get('/actualites', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM actualites WHERE est_publie=true ORDER BY date_publication DESC, date_creation DESC
    `);
    console.log(`✅ Actualités — ${r.rows.length}`);
    return res.status(200).json({ ok: true, actualites: r.rows });
  } catch (e) {
    console.error("❌ ERREUR ACTUALITÉS :", e.message);
    return res.status(500).json({ ok: true, actualites: [] });
  }
});

// 🔒 Ajouter
router.post('/actualites/ajouter', protegerAdmin, async (req, res) => {
  try {
    const {
      titre_fr, titre_en, titre_ar,
      resume_fr, resume_en, resume_ar,
      contenu_fr, contenu_en, contenu_ar,
      est_publie, date_publication
    } = req.body;

    if (!titre_fr || !contenu_fr) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Titre et contenu FR obligatoires" });
    }

    const r = await pool.query(`
      INSERT INTO actualites(
        titre_fr, titre_en, titre_ar, resume_fr, resume_en, resume_ar,
        contenu_fr, contenu_en, contenu_ar, est_publie, date_publication
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [
      titre_fr?.trim(), titre_en?.trim(), titre_ar?.trim(),
      resume_fr?.trim(), resume_en?.trim(), resume_ar?.trim(),
      contenu_fr?.trim(), contenu_en?.trim(), contenu_ar?.trim(),
      est_publie !== false, date_publication || new Date()
    ]);

    console.log(`✅ Actu créée ID:${r.rows[0].id}`);
    return res.status(201).json({ ok: true, actualite: r.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR CRÉATION ACTU :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur création actualité" });
  }
});

// 🔒 Modifier
router.put('/actualites/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });

    const {
      titre_fr, titre_en, titre_ar, resume_fr, resume_en, resume_ar,
      contenu_fr, contenu_en, contenu_ar, est_publie, date_publication
    } = req.body;

    const r = await pool.query(`
      UPDATE actualites SET
        titre_fr=$1, titre_en=$2, titre_ar=$3, resume_fr=$4, resume_en=$5, resume_ar=$6,
        contenu_fr=$7, contenu_en=$8, contenu_ar=$9, est_publie=$10,
        date_publication=$11, date_mise_a_jour=NOW()
      WHERE id=$12 RETURNING *
    `, [titre_fr?.trim(), titre_en?.trim(), titre_ar?.trim(), resume_fr?.trim(), resume_en?.trim(), resume_ar?.trim(),
        contenu_fr?.trim(), contenu_en?.trim(), contenu_ar?.trim(), est_publie, date_publication, id]);

    if (r.rows.length === 0) return res.status(404).json({ ok: false, erreur: "⚠️ Actualité introuvable" });
    console.log(`✅ Actu modifiée ID:${id}`);
    return res.status(200).json({ ok: true, actualite: r.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR MODIF ACTU :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur modification" });
  }
});

// 🔒 Supprimer
router.delete('/actualites/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });
    const r = await pool.query('DELETE FROM actualites WHERE id=$1 RETURNING id', [id]);
    if (r.rowCount === 0) return res.status(404).json({ ok: false, erreur: "⚠️ Actualité introuvable" });
    console.log(`🗑️ Actu supprimée ID:${id}`);
    return res.status(200).json({ ok: true, message: "✅ Supprimée" });
  } catch (e) {
    console.error("❌ ERREUR SUPPR ACTU :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur suppression" });
  }
});

// ==================================================
// 📅 ÉVÉNEMENTS
// ==================================================

// 🔓 Lire publiquement
router.get('/evenements', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM evenements WHERE est_publie=true ORDER BY date_evenement ASC
    `);
    console.log(`✅ Événements — ${r.rows.length}`);
    return res.status(200).json({ ok: true, evenements: r.rows });
  } catch (e) {
    console.error("❌ ERREUR ÉVÉNEMENTS :", e.message);
    return res.status(500).json({ ok: true, evenements: [] });
  }
});

// 🔒 Ajouter
router.post('/evenements/ajouter', protegerAdmin, async (req, res) => {
  try {
    const {
      titre_fr, titre_en, titre_ar, description_fr, description_en, description_ar,
      date_evenement, lieu, est_publie
    } = req.body;

    if (!titre_fr || !date_evenement) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Titre et date obligatoires" });
    }

    const r = await pool.query(`
      INSERT INTO evenements(
        titre_fr, titre_en, titre_ar, description_fr, description_en, description_ar,
        date_evenement, lieu, est_publie
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [titre_fr?.trim(), titre_en?.trim(), titre_ar?.trim(), description_fr?.trim(), description_en?.trim(), description_ar?.trim(),
        date_evenement, lieu?.trim(), est_publie !== false]);

    console.log(`✅ Événement créé ID:${r.rows[0].id}`);
    return res.status(201).json({ ok: true, evenement: r.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR CRÉATION ÉVÉNEMENT :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur création événement" });
  }
});

// 🔒 Modifier
router.put('/evenements/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });

    const {
      titre_fr, titre_en, titre_ar, description_fr, description_en, description_ar,
      date_evenement, lieu, est_publie
    } = req.body;

    const r = await pool.query(`
      UPDATE evenements SET
        titre_fr=$1, titre_en=$2, titre_ar=$3, description_fr=$4, description_en=$5, description_ar=$6,
        date_evenement=$7, lieu=$8, est_publie=$9, date_mise_a_jour=NOW()
      WHERE id=$10 RETURNING *
    `, [titre_fr?.trim(), titre_en?.trim(), titre_ar?.trim(), description_fr?.trim(), description_en?.trim(), description_ar?.trim(),
        date_evenement, lieu?.trim(), est_publie, id]);

    if (r.rows.length === 0) return res.status(404).json({ ok: false, erreur: "⚠️ Événement introuvable" });
    console.log(`✅ Événement modifié ID:${id}`);
    return res.status(200).json({ ok: true, evenement: r.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR MODIF ÉVÉNEMENT :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur modification" });
  }
});

// 🔒 Supprimer
router.delete('/evenements/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });
    const r = await pool.query('DELETE FROM evenements WHERE id=$1 RETURNING id', [id]);
    if (r.rowCount === 0) return res.status(404).json({ ok: false, erreur: "⚠️ Événement introuvable" });
    console.log(`🗑️ Événement supprimé ID:${id}`);
    return res.status(200).json({ ok: true, message: "✅ Supprimé" });
  } catch (e) {
    console.error("❌ ERREUR SUPPR ÉVÉNEMENT :", e.message);
    return res.status(500).json({ ok: false, erreur: "Erreur suppression" });
  }
});

module.exports = router;