const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 📋 LISTER LE CALENDRIER — Publique OU Protégée
// ==================================================
// → Version PUBLIQUE (pour l'accueil) : sans token
router.get('/liste', async (req, res) => {
  try {
    const { type_periode, annee_scolaire } = req.query;
    const conditions = [], valeurs = [];

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
      SELECT id, periode, date_debut, date_fin, type_periode,
             annee_scolaire, description_fr, description_en, description_ar
      FROM calendrier_scolaire
      ${clauseWhere}
      ORDER BY date_debut ASC
    `, valeurs);

    return res.status(200).json({ ok: true, calendrier: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE CALENDRIER :", e.message);
    return res.status(500).json({ ok: false, erreur: "⚠️ Impossible de charger le calendrier" });
  }
});

// → Si tu veux la liste PROTÉGÉE pour l'admin, décommente ci-dessous :
// router.get('/liste-admin', protegerAdmin, async (req, res) => { ... même code ... });

// ==================================================
// ➕ AJOUTER UNE PÉRIODE — Admin seulement
// ==================================================
router.post('/ajouter', protegerAdmin, async (req, res) => {
  try {
    const { periode, date_debut, date_fin, type_periode,
            description_fr, description_en, description_ar, annee_scolaire } = req.body;

    // ✅ Validation complète
    if (!periode || !date_debut || !date_fin || !type_periode) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Période, dates et type sont obligatoires" });
    }
    if (new Date(date_debut) > new Date(date_fin)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ La date de fin doit être postérieure à la date de début" });
    }

    const r = await pool.query(`
      INSERT INTO calendrier_scolaire(
        periode, date_debut, date_fin, type_periode,
        description_fr, description_en, description_ar, annee_scolaire, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id
    `, [
      periode.trim(), date_debut.trim(), date_fin.trim(), type_periode.trim(),
      description_fr?.trim() || null, 
      description_en?.trim() || null, 
      description_ar?.trim() || null,
      (annee_scolaire?.trim() || '2026-2027')
    ]);

    return res.status(201).json({ ok: true, id: r.rows[0].id, message: "✅ Période ajoutée !" });
  } catch (e) {
    console.error("❌ ERREUR AJOUT PÉRIODE :", e.message);
    return res.status(500).json({ ok: false, erreur: e.message || "⚠️ Erreur serveur" });
  }
});

// ==================================================
// ✏️ MODIFIER UNE PÉRIODE — Admin seulement
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });
    }

    const { periode, date_debut, date_fin, type_periode,
            description_fr, description_en, description_ar, annee_scolaire } = req.body;

    if (!periode || !date_debut || !date_fin || !type_periode) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Tous les champs obligatoires doivent être remplis" });
    }
    if (new Date(date_debut) > new Date(date_fin)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ La date de fin doit être postérieure à la date de début" });
    }

    const r = await pool.query(`
      UPDATE calendrier_scolaire SET
        periode = $2, date_debut = $3, date_fin = $4, type_periode = $5,
        description_fr = $6, description_en = $7, description_ar = $8, annee_scolaire = $9
      WHERE id = $1
      RETURNING id
    `, [
      id, periode.trim(), date_debut.trim(), date_fin.trim(), type_periode.trim(),
      description_fr?.trim() || null, 
      description_en?.trim() || null, 
      description_ar?.trim() || null,
      (annee_scolaire?.trim() || '2026-2027')
    ]);

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, erreur: "⚠️ Période introuvable" });
    }

    return res.status(200).json({ ok: true, message: "✅ Période mise à jour !" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION :", e.message);
    return res.status(500).json({ ok: false, erreur: e.message || "⚠️ Erreur serveur" });
  }
});

// ==================================================
// ❌ SUPPRIMER UNE PÉRIODE — Admin seulement
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });
    }

    const r = await pool.query(
      'DELETE FROM calendrier_scolaire WHERE id = $1 RETURNING periode', 
      [id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, erreur: "⚠️ Période introuvable" });
    }

    return res.status(200).json({ ok: true, message: "✅ Période supprimée !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION :", e.message);
    // Clé étrangère / contrainte
    if (e.code === '23503') {
      return res.status(409).json({ ok: false, erreur: "⚠️ Impossible de supprimer : cette période est utilisée ailleurs" });
    }
    return res.status(500).json({ ok: false, erreur: e.message || "⚠️ Erreur serveur" });
  }
});

module.exports = router;