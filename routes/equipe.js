const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée uniforme
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 📋 LISTER L'ÉQUIPE — Publique
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout } = req.query;
    const inclureInactifs = tout === '1';

    let conditions = [];
    if (!inclureInactifs) {
      conditions.push('est_actif = true');
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await pool.query(`
      SELECT * FROM equipe_pedagogique
      ${clauseWhere}
      ORDER BY ordre ASC, nom ASC, prenoms ASC
    `);

    console.log(`✅ Liste équipe renvoyée — ${r.rows.length} membre(s)`);
    res.json({ ok: true, membres: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE ÉQUIPE :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur lors de la récupération de la liste" });
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

    // ✅ Validation renforcée
    if (!nom || !prenoms || !poste_fr) {
      return res.status(400).json({
        ok: false,
        erreur: "Nom, prénoms et poste en français sont obligatoires"
      });
    }

    // ✅ Valeurs par défaut nettoyées
    const valeurs = [
      nom.trim(),
      prenoms.trim(),
      poste_fr.trim(),
      poste_en?.trim() || null,
      poste_ar?.trim() || null,
      matiere_fr?.trim() || null,
      matiere_en?.trim() || null,
      matiere_ar?.trim() || null,
      presentation_fr?.trim() || null,
      presentation_en?.trim() || null,
      presentation_ar?.trim() || null,
      photo_url?.trim() || null,
      email?.trim().toLowerCase() || null,
      parseInt(ordre) || 1,
      est_actif !== false
    ];

    const r = await pool.query(`
      INSERT INTO equipe_pedagogique(
        nom, prenoms,
        poste_fr, poste_en, poste_ar,
        matiere_fr, matiere_en, matiere_ar,
        presentation_fr, presentation_en, presentation_ar,
        photo_url, email, ordre, est_actif, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP)
      RETURNING *
    `, valeurs);

    console.log(`✅ Membre ajouté — ${nom} ${prenoms}`);
    res.status(201).json({ ok: true, membre: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR AJOUT MEMBRE :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur lors de l'ajout du membre" });
  }
});

// ==================================================
// ✏️ MODIFIER UN MEMBRE
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ ok: false, erreur: "Identifiant invalide" });
    }

    const {
      nom, prenoms,
      poste_fr, poste_en, poste_ar,
      matiere_fr, matiere_en, matiere_ar,
      presentation_fr, presentation_en, presentation_ar,
      photo_url, email, ordre, est_actif
    } = req.body;

    // ✅ Validation renforcée
    if (!nom || !prenoms || !poste_fr) {
      return res.status(400).json({
        ok: false,
        erreur: "Nom, prénoms et poste en français sont obligatoires"
      });
    }

    // ✅ Valeurs nettoyées
    const valeurs = [
      id,
      nom.trim(),
      prenoms.trim(),
      poste_fr.trim(),
      poste_en?.trim() || null,
      poste_ar?.trim() || null,
      matiere_fr?.trim() || null,
      matiere_en?.trim() || null,
      matiere_ar?.trim() || null,
      presentation_fr?.trim() || null,
      presentation_en?.trim() || null,
      presentation_ar?.trim() || null,
      photo_url?.trim() || null,
      email?.trim().toLowerCase() || null,
      parseInt(ordre) || 1,
      typeof est_actif === 'boolean' ? est_actif : true
    ];

    const r = await pool.query(`
      UPDATE equipe_pedagogique SET
        nom=$2, prenoms=$3,
        poste_fr=$4, poste_en=$5, poste_ar=$6,
        matiere_fr=$7, matiere_en=$8, matiere_ar=$9,
        presentation_fr=$10, presentation_en=$11, presentation_ar=$12,
        photo_url=$13, email=$14, ordre=$15, est_actif=$16,
        date_mise_a_jour=CURRENT_TIMESTAMP
      WHERE id=$1 RETURNING *
    `, valeurs);

    if (r.rows.length) {
      console.log(`✅ Membre modifié — ID: ${id}`);
      res.json({ ok: true, membre: r.rows[0] });
    } else {
      res.status(404).json({ ok: false, erreur: "Membre introuvable" });
    }
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION MEMBRE :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur lors de la modification" });
  }
});

// ==================================================
// ❌ SUPPRIMER UN MEMBRE
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ ok: false, erreur: "Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM equipe_pedagogique WHERE id=$1 RETURNING *',
      [id]
    );

    if (r.rows.length) {
      console.log(`🗑️ Membre supprimé — ID: ${id} | ${r.rows[0].nom} ${r.rows[0].prenoms}`);
      res.json({ ok: true });
    } else {
      res.status(404).json({ ok: false, erreur: "Membre introuvable" });
    }
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION MEMBRE :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur lors de la suppression" });
  }
});

module.exports = router;