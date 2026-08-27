const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==================================================
// 🔐 MIDDLEWARES DE PROTECTION
// ==================================================
let veriftoken, verifadmin, protegerAdmin;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  protegerAdmin = [veriftoken, verifadmin];
} catch {
  protegerAdmin = []; // Mode développement sans middleware
}

// ==================================================
// 📋 LISTE DES AFFECTATIONS — Admin
// ==================================================
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id_affectation,
             a.id_prof, u.nom, u.prenoms,
             a.id_classe, c.libelle_classe,
             a.id_matiere, m.libelle_matiere,
             a.annee_scolaire
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof = u.id_utilisateur
      JOIN classes c ON a.id_classe = c.id_classe
      JOIN matieres m ON a.id_matiere = m.id_matiere
      ORDER BY u.nom ASC, u.prenoms ASC, c.libelle_classe ASC, m.libelle_matiere ASC
    `);

    console.log(`✅ Liste affectations chargée — ${rows.length} enregistrement(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR chargement affectations :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger les affectations" });
  }
});

// ==================================================
// 🔍 DÉTAIL D'UNE AFFECTATION — Admin
// ==================================================
router.get('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rows: [affectation] } = await pool.query(`
      SELECT a.id_affectation, a.id_prof, a.id_classe, a.id_matiere, a.annee_scolaire,
             u.nom, u.prenoms, c.libelle_classe, m.libelle_matiere
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof = u.id_utilisateur
      JOIN classes c ON a.id_classe = c.id_classe
      JOIN matieres m ON a.id_matiere = m.id_matiere
      WHERE a.id_affectation = $1
    `, [id_affectation]);

    if (!affectation)
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });

    return res.json({ ok: true, affectation });
  } catch (e) {
    console.error("❌ ERREUR détail affectation :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Erreur serveur" });
  }
});

// ==================================================
// ➕ CRÉER UNE AFFECTATION — Admin
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;

    // ✅ Validation champs obligatoires
    if (!id_prof || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Enseignant, Classe et Matière sont obligatoires" });

    // ✅ Conversion et validation des identifiants
    const profId = parseInt(id_prof);
    const classeId = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);

    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Un ou plusieurs identifiants sont invalides" });

    // ✅ Valeur par défaut année scolaire
    const annee = annee_scolaire?.trim() || '2026-2027';

    // ✅ Insertion
    const { rows: [nouvelleAffectation] } = await pool.query(`
      INSERT INTO affectations_ens (id_prof, id_classe, id_matiere, annee_scolaire)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [profId, classeId, matiereId, annee]);

    console.log(`✅ Affectation créée — Enseignant ${profId} → Classe ${classeId}, Matière ${matiereId} (${annee})`);
    return res.json({ ok: true, message: "✅ Affectation enregistrée avec succès", affectation: nouvelleAffectation });
  } catch (e) {
    console.error("❌ ERREUR création affectation :", e.code, e.message);

    if (e.code === '23505') // Erreur clé unique
      return res.json({ ok: false, erreur: "⚠️ Cette affectation existe déjà pour cette année !" });
    if (e.code === '23503') // Erreur clé étrangère
      return res.json({ ok: false, erreur: "⚠️ L'enseignant, la classe ou la matière n'existe pas" });

    return res.json({ ok: false, erreur: "⚠️ Impossible de créer l'affectation" });
  }
});

// ==================================================
// ✏️ MODIFIER UNE AFFECTATION — Admin
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;

    if (!id_prof || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Enseignant, Classe et Matière sont obligatoires" });

    const profId = parseInt(id_prof);
    const classeId = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);

    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Un ou plusieurs identifiants sont invalides" });

    const annee = annee_scolaire?.trim() || '2026-2027';

    // ✅ Mise à jour
    const { rowCount } = await pool.query(`
      UPDATE affectations_ens
      SET id_prof = $1, id_classe = $2, id_matiere = $3, annee_scolaire = $4
      WHERE id_affectation = $5
    `, [profId, classeId, matiereId, annee, id_affectation]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });

    console.log(`✅ Affectation mise à jour — ID: ${id_affectation}`);
    return res.json({ ok: true, message: "✅ Affectation mise à jour avec succès" });
  } catch (e) {
    console.error("❌ ERREUR modification affectation :", e.code, e.message);

    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Cette combinaison existe déjà pour cette année !" });
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ L'enseignant, la classe ou la matière n'existe pas" });

    return res.json({ ok: false, erreur: "⚠️ Impossible de modifier l'affectation" });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UNE AFFECTATION — Admin
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
    return res.json({ ok: true, message: "✅ Affectation supprimée définitivement" });
  } catch (e) {
    console.error("❌ ERREUR suppression affectation :", e.code, e.message);

    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Impossible : utilisée dans des notes ou emplois du temps" });

    return res.json({ ok: false, erreur: "⚠️ Impossible de supprimer l'affectation" });
  }
});

module.exports = router;