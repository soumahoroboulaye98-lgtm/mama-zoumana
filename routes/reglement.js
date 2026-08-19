const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');


// ==================================================
// 📋 LISTER LE RÈGLEMENT — Publiques ou complet (Admin)
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout } = req.query;

    let conditions = [];
    let valeurs = [];

    if (tout !== '1') {
      conditions.push('est_publie = true');
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT * FROM reglement_interieur
      ${clauseWhere}
      ORDER BY ordre ASC, id ASC
    `, valeurs);

    res.json({ ok: true, articles: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE RÈGLEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UN ARTICLE — Admin seul
// ==================================================
router.post('/ajouter', verifadmin, async (req, res) => {
  try {
    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      ordre, est_publie
    } = req.body;

    if (!titre_fr || !contenu_fr) {
      return res.json({
        ok: false,
        erreur: "Le titre et le contenu en français sont obligatoires"
      });
    }

    const r = await pool.query(`
      INSERT INTO reglement_interieur(
        titre_fr, titre_en, titre_ar,
        contenu_fr, contenu_en, contenu_ar,
        ordre, est_publie, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      RETURNING *
    `, [
      titre_fr, titre_en || null, titre_ar || null,
      contenu_fr, contenu_en || null, contenu_ar || null,
      ordre || 1, est_publie !== false
    ]);

    res.json({ ok: true, article: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR AJOUT ARTICLE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UN ARTICLE — Admin seul
// ==================================================
router.put('/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      ordre, est_publie
    } = req.body;

    if (!titre_fr || !contenu_fr) {
      return res.json({
        ok: false,
        erreur: "Le titre et le contenu en français sont obligatoires"
      });
    }

    const r = await pool.query(`
      UPDATE reglement_interieur SET
        titre_fr=$2, titre_en=$3, titre_ar=$4,
        contenu_fr=$5, contenu_en=$6, contenu_ar=$7,
        ordre=$8, est_publie=$9, date_modification=NOW()
      WHERE id=$1 RETURNING *
    `, [
      id, titre_fr, titre_en || null, titre_ar || null,
      contenu_fr, contenu_en || null, contenu_ar || null,
      ordre || 1, est_publie
    ]);

    res.json(
      r.rows.length
        ? { ok: true, article: r.rows[0] }
        : { ok: false, erreur: "Article introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION ARTICLE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UN ARTICLE — Admin seul
// ==================================================
router.delete('/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM reglement_interieur WHERE id=$1 RETURNING *',
      [id]
    );

    res.json(
      r.rows.length
        ? { ok: true }
        : { ok: false, erreur: "Article introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION ARTICLE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;