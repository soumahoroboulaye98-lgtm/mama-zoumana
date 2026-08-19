const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');


// ==================================================
// 📋 LISTER LE CALENDRIER — Publiques ou complet (Admin)
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout, type_periode, annee_scolaire } = req.query;

    let conditions = [];
    let valeurs = [];

    if (type_periode) {
      valeurs.push(type_periode);
      conditions.push(`type_periode = $${valeurs.length}`);
    }

    if (annee_scolaire) {
      valeurs.push(annee_scolaire);
      conditions.push(`annee_scolaire = $${valeurs.length}`);
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT * FROM calendrier_scolaire
      ${clauseWhere}
      ORDER BY date_debut ASC
    `, valeurs);

    res.json({ ok: true, calendrier: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE CALENDRIER :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UNE PÉRIODE — Admin seul
// ==================================================
router.post('/ajouter', verifadmin, async (req, res) => {
  try {
    const {
      periode, date_debut, date_fin, type_periode,
      description_fr, description_en, description_ar,
      annee_scolaire
    } = req.body;

    if (!periode || !date_debut || !date_fin || !type_periode) {
      return res.json({
        ok: false,
        erreur: "La période, les dates et le type sont obligatoires"
      });
    }

    const r = await pool.query(`
      INSERT INTO calendrier_scolaire(
        periode, date_debut, date_fin, type_periode,
        description_fr, description_en, description_ar,
        annee_scolaire, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      RETURNING *
    `, [
      periode, date_debut, date_fin, type_periode,
      description_fr || null, description_en || null, description_ar || null,
      annee_scolaire || '2026-2027'
    ]);

    res.json({ ok: true, periode: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR AJOUT PÉRIODE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UNE PÉRIODE — Admin seul
// ==================================================
router.put('/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const {
      periode, date_debut, date_fin, type_periode,
      description_fr, description_en, description_ar,
      annee_scolaire
    } = req.body;

    if (!periode || !date_debut || !date_fin || !type_periode) {
      return res.json({
        ok: false,
        erreur: "La période, les dates et le type sont obligatoires"
      });
    }

    const r = await pool.query(`
      UPDATE calendrier_scolaire SET
        periode=$2, date_debut=$3, date_fin=$4, type_periode=$5,
        description_fr=$6, description_en=$7, description_ar=$8,
        annee_scolaire=$9
      WHERE id=$1 RETURNING *
    `, [
      id, periode, date_debut, date_fin, type_periode,
      description_fr || null, description_en || null, description_ar || null,
      annee_scolaire || '2026-2027'
    ]);

    res.json(
      r.rows.length
        ? { ok: true, periode: r.rows[0] }
        : { ok: false, erreur: "Période introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION PÉRIODE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UNE PÉRIODE — Admin seul
// ==================================================
router.delete('/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM calendrier_scolaire WHERE id=$1 RETURNING *',
      [id]
    );

    res.json(
      r.rows.length
        ? { ok: true }
        : { ok: false, erreur: "Période introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION PÉRIODE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;