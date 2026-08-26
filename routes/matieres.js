const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 📖 LISTE DES MATIÈRES (Publique) — FORMAT ADAPTÉ AU HTML
// ==================================================
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id_matiere,
        libelle_matiere,
        libelle_matiere_ar,
        coefficient,
        volume_horaire,
        langue_ens
      FROM matieres
      ORDER BY libelle_matiere ASC
    `);
    console.log(`✅ Matières chargées — ${rows.length} matière(s)`);
    res.json({ ok: true, lignes: rows }); // ✅ "lignes" au lieu de "matieres"
  } catch (e) {
    console.error("❌ ERREUR /matieres :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ➕ CRÉER UNE MATIÈRE — Admin
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { libelle_matiere, libelle_matiere_ar, coefficient, volume_horaire, langue_ens } = req.body;
    if (!libelle_matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de la matière obligatoire" });
    const coef = parseFloat(coefficient) || 1;
    const vol = parseInt(volume_horaire) || 3;
    const langue = ['fr','ar','en'].includes(langue_ens) ? langue_ens : 'fr';
    const { rows: [{ prochain }] } = await pool.query(
      'SELECT COALESCE(MAX(id_matiere),0)+1 AS prochain FROM matieres'
    );
    await pool.query(`
      INSERT INTO matieres(id_matiere, libelle_matiere, libelle_matiere_ar, coefficient, volume_horaire, langue_ens)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [prochain, libelle_matiere.trim(), libelle_matiere_ar || null, coef, vol, langue]);
    console.log(`✅ Matière créée — ${libelle_matiere} (ID: ${prochain})`);
    res.json({ ok: true, message: "✅ Matière créée", id_matiere: prochain });
  } catch (e) {
    console.error("❌ ERREUR création matière :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UNE MATIÈRE — Admin
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    const { libelle_matiere, libelle_matiere_ar, coefficient, volume_horaire, langue_ens } = req.body;
    if (!libelle_matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de la matière obligatoire" });
    const coef = parseFloat(coefficient) || 1;
    const vol = parseInt(volume_horaire) || 3;
    const langue = ['fr','ar','en'].includes(langue_ens) ? langue_ens : 'fr';
    const { rowCount } = await pool.query(`
      UPDATE matieres
      SET libelle_matiere = $1, libelle_matiere_ar = $2, coefficient = $3, volume_horaire = $4, langue_ens = $5
      WHERE id_matiere = $6
    `, [libelle_matiere.trim(), libelle_matiere_ar || null, coef, vol, langue, id_matiere]);
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Matière introuvable" });
    console.log(`✅ Matière mise à jour — ID: ${id_matiere}`);
    res.json({ ok: true, message: "✅ Matière mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR modification matière :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UNE MATIÈRE — Admin
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    const { rowCount } = await pool.query(
      'DELETE FROM matieres WHERE id_matiere = $1', [id_matiere]
    );
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Matière introuvable" });
    console.log(`🗑️ Matière supprimée — ID: ${id_matiere}`);
    res.json({ ok: true, message: "✅ Matière supprimée" });
  } catch (e) {
    console.error("❌ ERREUR suppression matière :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Impossible : utilisée dans des notes ou emplois du temps" });
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;