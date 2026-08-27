const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Seul l'admin peut ajouter/modifier/supprimer
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 📋 LISTE PUBLIQUE — AFFICHAGE SUR L'ACCUEIL
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { type_evenement, annee_scolaire } = req.query;
    const conditions = [];
    const valeurs = [];

    if (type_evenement) {
      valeurs.push(type_evenement);
      conditions.push(`type_evenement = $${valeurs.length}`);
    }
    if (annee_scolaire) {
      valeurs.push(annee_scolaire);
      conditions.push(`annee_scolaire = $${valeurs.length}`);
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT id, 
             titre_fr, titre_en, titre_ar,
             date_debut, date_fin, 
             type_evenement,
             annee_scolaire, 
             description_fr, description_en, description_ar
      FROM calendrier_scolaire
      ${clauseWhere}
      ORDER BY date_debut ASC
    `, valeurs);

    return res.status(200).json({ 
      ok: true, 
      calendrier: r.rows 
    });
  } catch (e) {
    console.error("❌ ERREUR LISTE CALENDRIER :", e.message);
    return res.status(500).json({ 
      ok: false, 
      erreur: "⚠️ Impossible de charger le calendrier" 
    });
  }
});

// ==================================================
// 📋 LISTE ADMIN
// ==================================================
router.get('/liste-admin', protegerAdmin, async (req, res) => {
  try {
    const { type_evenement, annee_scolaire } = req.query;
    const conditions = [];
    const valeurs = [];

    if (type_evenement) {
      valeurs.push(type_evenement);
      conditions.push(`type_evenement = $${valeurs.length}`);
    }
    if (annee_scolaire) {
      valeurs.push(annee_scolaire);
      conditions.push(`annee_scolaire = $${valeurs.length}`);
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT id, 
             titre_fr, titre_en, titre_ar,
             date_debut, date_fin, 
             type_evenement,
             annee_scolaire, 
             description_fr, description_en, description_ar,
             date_creation
      FROM calendrier_scolaire
      ${clauseWhere}
      ORDER BY date_debut DESC
    `, valeurs);

    return res.status(200).json({ 
      ok: true, 
      calendrier: r.rows 
    });
  } catch (e) {
    console.error("❌ ERREUR LISTE ADMIN :", e.message);
    return res.status(500).json({ 
      ok: false, 
      erreur: "⚠️ Impossible de charger le calendrier" 
    });
  }
});

// ==================================================
// ➕ AJOUTER UN ÉVÉNEMENT CALENDRIER
// ==================================================
router.post('/ajouter', protegerAdmin, async (req, res) => {
  try {
    const { 
      titre_fr, titre_en, titre_ar,
      date_debut, date_fin, type_evenement,
      description_fr, description_en, description_ar, 
      annee_scolaire
    } = req.body;

    // ✅ Validation
    if (!titre_fr || !date_debut || !date_fin || !type_evenement) {
      return res.status(400).json({ 
        ok: false, 
        erreur: "⚠️ Titre (FR), dates et type sont obligatoires" 
      });
    }
    if (new Date(date_debut) > new Date(date_fin)) {
      return res.status(400).json({ 
        ok: false, 
        erreur: "⚠️ La date de fin doit être postérieure à la date de début" 
      });
    }

    const r = await pool.query(`
      INSERT INTO calendrier_scolaire(
        titre_fr, titre_en, titre_ar,
        date_debut, date_fin, type_evenement,
        description_fr, description_en, description_ar, 
        annee_scolaire, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id
    `, [
      titre_fr.trim(),
      titre_en?.trim() || null,
      titre_ar?.trim() || null,
      date_debut, 
      date_fin, 
      type_evenement.trim(),
      description_fr?.trim() || null, 
      description_en?.trim() || null, 
      description_ar?.trim() || null,
      (annee_scolaire?.trim() || '2026-2027')
    ]);

    return res.status(201).json({ 
      ok: true, 
      id: r.rows[0].id, 
      message: "✅ Événement ajouté avec succès !" 
    });
  } catch (e) {
    console.error("❌ ERREUR AJOUT CALENDRIER :", e.message);
    return res.status(500).json({ 
      ok: false, 
      erreur: e.message || "⚠️ Erreur serveur" 
    });
  }
});

// ==================================================
// ✏️ MODIFIER UN ÉVÉNEMENT
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });
    }

    const { 
      titre_fr, titre_en, titre_ar,
      date_debut, date_fin, type_evenement,
      description_fr, description_en, description_ar, 
      annee_scolaire
    } = req.body;

    if (!titre_fr || !date_debut || !date_fin || !type_evenement) {
      return res.status(400).json({ 
        ok: false, 
        erreur: "⚠️ Tous les champs obligatoires doivent être remplis" 
      });
    }
    if (new Date(date_debut) > new Date(date_fin)) {
      return res.status(400).json({ 
        ok: false, 
        erreur: "⚠️ La date de fin doit être postérieure à la date de début" 
      });
    }

    const r = await pool.query(`
      UPDATE calendrier_scolaire SET
        titre_fr = $2, titre_en = $3, titre_ar = $4,
        date_debut = $5, date_fin = $6, type_evenement = $7,
        description_fr = $8, description_en = $9, description_ar = $10, 
        annee_scolaire = $11
      WHERE id = $1
      RETURNING id
    `, [
      id, 
      titre_fr.trim(),
      titre_en?.trim() || null,
      titre_ar?.trim() || null,
      date_debut, 
      date_fin, 
      type_evenement.trim(),
      description_fr?.trim() || null, 
      description_en?.trim() || null, 
      description_ar?.trim() || null,
      (annee_scolaire?.trim() || '2026-2027')
    ]);

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, erreur: "⚠️ Événement introuvable" });
    }
    return res.status(200).json({ 
      ok: true, 
      message: "✅ Événement mis à jour avec succès !" 
    });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION CALENDRIER :", e.message);
    return res.status(500).json({ 
      ok: false, 
      erreur: e.message || "⚠️ Erreur serveur" 
    });
  }
});

// ==================================================
// ❌ SUPPRIMER UN ÉVÉNEMENT
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ ID invalide" });
    }

    const r = await pool.query(
      'DELETE FROM calendrier_scolaire WHERE id = $1 RETURNING titre_fr', 
      [id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, erreur: "⚠️ Événement introuvable" });
    }
    return res.status(200).json({ 
      ok: true, 
      message: `✅ Événement "${r.rows[0].titre_fr}" supprimé !` 
    });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION CALENDRIER :", e.message);
    if (e.code === '23503') {
      return res.status(409).json({ 
        ok: false, 
        erreur: "⚠️ Impossible de supprimer : utilisé ailleurs" 
      });
    }
    return res.status(500).json({ 
      ok: false, 
      erreur: e.message || "⚠️ Erreur serveur" 
    });
  }
});

module.exports = router;