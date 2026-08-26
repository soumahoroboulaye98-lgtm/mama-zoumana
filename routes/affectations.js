const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

const protegerAdmin = [veriftoken, verifadmin];

// ➕ CRÉER une affectation
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;
    if (!id_prof || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Prof, Classe et Matière obligatoires" });
    const profId = parseInt(id_prof);
    const classeId = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);
    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Identifiants invalides" });
    const { rows: [nouvelle] } = await pool.query(`
      INSERT INTO affectations_ens (id_prof, id_classe, id_matiere, annee_scolaire)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [profId, classeId, matiereId, annee_scolaire || '2026-2027']);
    console.log(`✅ Affectation créée — Prof ${profId} → Classe ${classeId}, Matière ${matiereId}`);
    res.json({ ok: true, message: "✅ Affectation enregistrée !", affectation: nouvelle });
  } catch (e) {
    console.error("❌ ERREUR CRÉATION :", e.code, e.message);
    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Cette affectation existe déjà !" });
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Prof, Classe ou Matière introuvable" });
    res.json({ ok: false, erreur: e.message });
  }
});

// 📋 LIRE TOUTES les affectations — FORMAT ADAPTÉ AU HTML ✅
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id_affectation,
             u.id AS id_prof, u.nom, u.prenom,
             c.id_classe, c.libelle_classe,
             m.id_matiere, m.libelle_matiere,
             a.annee_scolaire
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof = u.id
      JOIN classes c ON a.id_classe = c.id_classe
      JOIN matieres m ON a.id_matiere = m.id_matiere
      ORDER BY u.nom ASC, c.libelle_classe ASC, m.libelle_matiere ASC
    `);
    console.log(`✅ Liste affectations — ${rows.length}`);
    res.json({ ok: true, lignes: rows }); // ✅ "lignes" au lieu de "affectations"
  } catch (e) {
    console.error("❌ ERREUR LISTE :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// 🔍 LIRE UNE SEULE affectation
router.get('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    const { rows: [affectation] } = await pool.query(`
      SELECT a.id_affectation, a.id_prof, a.id_classe, a.id_matiere, a.annee_scolaire
      FROM affectations_ens a
      WHERE a.id_affectation = $1
    `, [id]);
    if (!affectation)
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });
    res.json({ ok: true, affectation });
  } catch (e) {
    console.error("❌ ERREUR LECTURE :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ✏️ MODIFIER une affectation
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;
    if (!id_prof || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Tous les champs obligatoires" });
    const profId = parseInt(id_prof);
    const classeId = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);
    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Identifiants invalides" });
    const { rowCount } = await pool.query(`
      UPDATE affectations_ens
      SET id_prof = $1, id_classe = $2, id_matiere = $3, annee_scolaire = $4
      WHERE id_affectation = $5
    `, [profId, classeId, matiereId, annee_scolaire || '2026-2027', id]);
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });
    console.log(`✅ Modification — ID: ${id}`);
    res.json({ ok: true, message: "✅ Affectation mise à jour !" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION :", e.code, e.message);
    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Cette combinaison existe déjà !" });
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Prof/Classe/Matière introuvable" });
    res.json({ ok: false, erreur: e.message });
  }
});

// 🗑️ SUPPRIMER une affectation
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    const { rowCount } = await pool.query(
      'DELETE FROM affectations_ens WHERE id_affectation = $1',
      [id]
    );
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });
    console.log(`🗑️ Suppression — ID: ${id}`);
    res.json({ ok: true, message: "✅ Affectation supprimée !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Impossible : utilisée dans notes ou emploi" });
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;