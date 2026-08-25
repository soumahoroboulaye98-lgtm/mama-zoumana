const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');


// ✅ Protection groupée uniforme
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📋 LISTE DES AFFECTATIONS → GET /api/affectations
// ==================================================
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
    console.log(`✅ Liste affectations consultée — ${rows.length} élément(s)`);
    res.json({ ok: true, affectations: rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE AFFECTATIONS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🔍 AFFICHER UNE SEULE AFFECTATION → GET /api/affectations/:id
// ==================================================
router.get('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rows: [affectation] } = await pool.query(`
      SELECT a.id_affectation,
             a.id_prof, a.id_classe, a.id_matiere,
             u.nom, u.prenom,
             c.libelle_classe,
             m.libelle_matiere,
             a.annee_scolaire
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof = u.id
      JOIN classes c ON a.id_classe = c.id_classe
      JOIN matieres m ON a.id_matiere = m.id_matiere
      WHERE a.id_affectation = $1
    `, [id_affectation]);

    if (!affectation)
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });

    res.json({ ok: true, affectation });
  } catch (e) {
    console.error("❌ ERREUR DÉTAIL AFFECTATION :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UNE AFFECTATION → POST /api/affectations
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;

    if (!id_prof || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Professeur, Classe et Matière sont obligatoires" });

    const profId = parseInt(id_prof);
    const classeId = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);

    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Identifiants invalides (doivent être des nombres)" });

    const { rows: [nouvelle] } = await pool.query(`
      INSERT INTO affectations_ens (id_prof, id_classe, id_matiere, annee_scolaire)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [profId, classeId, matiereId, annee_scolaire || '2026-2027']);

    console.log(`✅ Affectation créée — Prof ${profId} → Classe ${classeId}, Matière ${matiereId}`);
    res.json({ ok: true, message: "✅ Affectation enregistrée avec succès !", affectation: nouvelle });
  } catch (e) {
    console.error("❌ ERREUR AJOUT AFFECTATION :", e.code, e.message);
    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Cette affectation existe déjà pour cette année scolaire !" });
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Professeur, Classe ou Matière introuvable dans la base" });
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UNE AFFECTATION → PUT /api/affectations/:id
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;

    if (!id_prof || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Professeur, Classe et Matière sont obligatoires" });

    const profId = parseInt(id_prof);
    const classeId = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);

    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Identifiants invalides" });

    const { rowCount } = await pool.query(`
      UPDATE affectations_ens
      SET id_prof = $1, id_classe = $2, id_matiere = $3, annee_scolaire = $4
      WHERE id_affectation = $5
    `, [profId, classeId, matiereId, annee_scolaire || '2026-2027', id_affectation]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });

    console.log(`✅ Affectation modifiée — ID: ${id_affectation}`);
    res.json({ ok: true, message: "✅ Affectation mise à jour avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION AFFECTATION :", e.code, e.message);
    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Cette combinaison existe déjà !" });
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Professeur, Classe ou Matière introuvable" });
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🗑️ SUPPRIMER UNE AFFECTATION → DELETE /api/affectations/:id
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rowCount } = await pool.query(
      'DELETE FROM affectations_ens WHERE id_affectation = $1',
      [id_affectation]
    );

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });

    console.log(`🗑️ Affectation supprimée — ID: ${id_affectation}`);
    res.json({ ok: true, message: "✅ Affectation supprimée avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION AFFECTATION :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Impossible : utilisée dans des notes ou emplois du temps" });
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;