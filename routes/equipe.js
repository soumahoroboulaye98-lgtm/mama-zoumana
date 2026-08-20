const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté systématiquement
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée uniforme pour les routes d'administration
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📋 LISTER L'ÉQUIPE — Publique
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout } = req.query;
    let conditions = [];
    let valeurs = [];

    if (tout !== '1') {
      conditions.push('est_actif = true');
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT * FROM equipe_pedagogique
      ${clauseWhere}
      ORDER BY ordre ASC, nom ASC
    `, valeurs);

    console.log(`✅ Liste équipe renvoyée — ${r.rows.length} membre(s)`);
    res.json({ ok: true, membres: r.rows });

  } catch (e) {
    console.log("❌ ERREUR LISTE ÉQUIPE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UN MEMBRE
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.post('/ajouter', protegerAdmin, async (req, res) => {
  try {
    const {
      nom, prenoms,
      poste_fr, poste_en, poste_ar,
      matiere_fr, matiere_en, matiere_ar,
      presentation_fr, presentation_en, presentation_ar,
      photo_url, email, ordre, est_actif
    } = req.body;

    if (!nom || !prenoms || !poste_fr) {
      return res.json({
        ok: false,
        erreur: "Nom, prénoms et poste en français sont obligatoires"
      });
    }

    const r = await pool.query(`
      INSERT INTO equipe_pedagogique(
        nom, prenoms,
        poste_fr, poste_en, poste_ar,
        matiere_fr, matiere_en, matiere_ar,
        presentation_fr, presentation_en, presentation_ar,
        photo_url, email, ordre, est_actif, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
      RETURNING *
    `, [
      nom, prenoms,
      poste_fr, poste_en || null, poste_ar || null,
      matiere_fr || null, matiere_en || null, matiere_ar || null,
      presentation_fr || null, presentation_en || null, presentation_ar || null,
      photo_url || null, email || null, ordre || 1, est_actif !== false
    ]);

    console.log(`✅ Membre ajouté — ${nom} ${prenoms}`);
    res.json({ ok: true, membre: r.rows[0] });

  } catch (e) {
    console.log("❌ ERREUR AJOUT MEMBRE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UN MEMBRE
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const {
      nom, prenoms,
      poste_fr, poste_en, poste_ar,
      matiere_fr, matiere_en, matiere_ar,
      presentation_fr, presentation_en, presentation_ar,
      photo_url, email, ordre, est_actif
    } = req.body;

    if (!nom || !prenoms || !poste_fr) {
      return res.json({
        ok: false,
        erreur: "Nom, prénoms et poste en français sont obligatoires"
      });
    }

    const r = await pool.query(`
      UPDATE equipe_pedagogique SET
        nom=$2, prenoms=$3,
        poste_fr=$4, poste_en=$5, poste_ar=$6,
        matiere_fr=$7, matiere_en=$8, matiere_ar=$9,
        presentation_fr=$10, presentation_en=$11, presentation_ar=$12,
        photo_url=$13, email=$14, ordre=$15, est_actif=$16
      WHERE id=$1 RETURNING *
    `, [
      id, nom, prenoms,
      poste_fr, poste_en || null, poste_ar || null,
      matiere_fr || null, matiere_en || null, matiere_ar || null,
      presentation_fr || null, presentation_en || null, presentation_ar || null,
      photo_url || null, email || null, ordre || 1, est_actif
    ]);

    if (r.rows.length) {
      console.log(`✅ Membre modifié — ID: ${id}`);
      res.json({ ok: true, membre: r.rows[0] });
    } else {
      res.json({ ok: false, erreur: "Membre introuvable" });
    }

  } catch (e) {
    console.log("❌ ERREUR MODIFICATION MEMBRE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UN MEMBRE
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM equipe_pedagogique WHERE id=$1 RETURNING *',
      [id]
    );

    if (r.rows.length) {
      console.log(`🗑️ Membre supprimé — ID: ${id}`);
      res.json({ ok: true });
    } else {
      res.json({ ok: false, erreur: "Membre introuvable" });
    }

  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION MEMBRE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;