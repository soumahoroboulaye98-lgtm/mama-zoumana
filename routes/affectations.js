const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée uniforme
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 📋 LISTE DES AFFECTATIONS  →  /api/affectations
// ==================================================
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT a.id_affectation,
             u.nom AS nom_prof, u.prenom AS prenoms_prof,
             c.libelle_classe AS classe,
             m.libelle_matiere AS matiere
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof = u.id
      JOIN classes c ON a.id_classe = c.id_classe
      JOIN matieres m ON a.id_matiere = m.id_matiere
      ORDER BY u.nom, c.libelle_classe, m.libelle_matiere
    `);

    console.log(`✅ Liste affectations consultée — ${r.rows.length} affectation(s)`);
    res.json({ ok: true, affectations: r.rows, lignes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE AFFECTATIONS :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// ➕ AJOUTER UNE AFFECTATION  →  /api/affectations
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { id_prof, id_classe, id_matiere } = req.body;

    // ✅ Validation des champs
    if (!id_prof || !id_classe || !id_matiere) {
      return res.json({ ok: false, erreur: "⚠️ Tous les champs sont obligatoires" });
    }

    // ✅ Conversion et validation des identifiants
    const profId = parseInt(id_prof);
    const classeId = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);

    if (isNaN(profId) || isNaN(classeId) || isNaN(matiereId)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiants invalides" });
    }

    const r = await pool.query(`
      INSERT INTO affectations_ens (id_prof, id_classe, id_matiere)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [profId, classeId, matiereId]);

    console.log(`✅ Affectation créée — Prof ${profId} → Classe ${classeId}, Matière ${matiereId}`);
    res.json({ ok: true, message: "✅ Affectation enregistrée !", donnee: r.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR AJOUT AFFECTATION :", e.message);
    if (e.code === '23505') {
      return res.json({ ok: false, erreur: "⚠️ Cette affectation existe déjà !" });
    }
    if (e.code === '23503') {
      return res.json({ ok: false, erreur: "⚠️ Un des éléments référencés n'existe pas" });
    }
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UNE AFFECTATION  →  /api/affectations/:id
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM affectations_ens WHERE id_affectation = $1 RETURNING *',
      [id]
    );

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });
    }

    console.log(`✅ Affectation supprimée — ID: ${id}`);
    res.json({ ok: true, message: "✅ Affectation supprimée !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION AFFECTATION :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

module.exports = router;