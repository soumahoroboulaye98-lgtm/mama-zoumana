const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==================================================
// 🔐 MIDDLEWARES DE PROTECTION — Mode secours inclus
// ==================================================
let veriftoken, verifadmin, verifprof, protegerAdmin, protegerProf;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  verifprof  = require('../middleware/verifprof');
  protegerAdmin = [veriftoken, verifadmin]; // Admin uniquement
  protegerProf  = [veriftoken, verifprof];  // Enseignant connecté
} catch {
  protegerAdmin = [];
  protegerProf  = [];
  console.warn("⚠️ Middlewares introuvables — Mode développement");
}

// ✅ Année scolaire par défaut (ex: août → année en cours, sept → année+1)
const MOIS_RENTRÉE = 8;
const annee = new Date().getFullYear();
const mois = new Date().getMonth() + 1;
const ANNEE_SCOLAIRE_DEFAUT = mois >= MOIS_RENTRÉE
  ? `${annee}-${annee + 1}`
  : `${annee - 1}-${annee}`;

// ==================================================
// 📋 LISTE TOUTES AFFECTATIONS — Admin
// → GET /api/affectations
// ==================================================
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        a.id_affectation,
        a.id_prof,
        u.nom,
        u.prenoms,
        a.id_classe,
        c.libelle_classe,
        c.libelle_classe_ar,
        a.id_matiere,
        m.libelle_matiere,
        m.libelle_matiere_ar,
        m.coefficient,
        a.annee_scolaire
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof  = u.id_utilisateur
      JOIN classes c     ON a.id_classe = c.id_classe
      JOIN matieres m    ON a.id_matiere = m.id_matiere
      ORDER BY 
        u.nom ASC, 
        u.prenoms ASC, 
        c.libelle_classe ASC, 
        m.libelle_matiere ASC
    `);
    console.log(`✅ Liste affectations chargée — ${rows.length} enregistrement(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR liste affectations :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger les affectations" });
  }
});

// ==================================================
// 👨‍🏫 MES AFFECTATIONS — Enseignant connecté
// → GET /api/affectations/prof/miennes
// ==================================================
router.get('/prof/miennes', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user?.id_utilisateur || req.user?.id;
    if (!id_prof)
      return res.json({ ok: false, erreur: "⚠️ Identifiant enseignant introuvable" });

    const { rows } = await pool.query(`
      SELECT 
        a.id_affectation,
        a.id_classe,
        c.libelle_classe,
        c.libelle_classe_ar,
        c.cycle,
        a.id_matiere,
        m.libelle_matiere,
        m.libelle_matiere_ar,
        m.coefficient,
        a.annee_scolaire
      FROM affectations_ens a
      JOIN classes c  ON a.id_classe  = c.id_classe
      JOIN matieres m ON a.id_matiere = m.id_matiere
      WHERE a.id_prof = $1
      ORDER BY c.libelle_classe ASC, m.libelle_matiere ASC
    `, [id_prof]);

    console.log(`✅ Mes affectations — ${rows.length} enregistrement(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR mes affectations :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger vos affectations" });
  }
});

// ==================================================
// 🔍 DÉTAIL UNE AFFECTATION — Admin
// → GET /api/affectations/:id
// ==================================================
router.get('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rows: [affectation] } = await pool.query(`
      SELECT 
        a.id_affectation, a.id_prof, a.id_classe, a.id_matiere, a.annee_scolaire,
        u.nom, u.prenoms, c.libelle_classe, m.libelle_matiere
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof  = u.id_utilisateur
      JOIN classes c     ON a.id_classe = c.id_classe
      JOIN matieres m    ON a.id_matiere = m.id_matiere
      WHERE a.id_affectation = $1
    `, [id_affectation]);

    if (!affectation)
      return res.json({ ok: false, erreur: "⚠️ Affectation INTROUVABLE" });

    console.log(`✅ Détail affectation — ID: ${id_affectation}`);
    return res.json({ ok: true, affectation });
  } catch (e) {
    console.error("❌ ERREUR détail affectation :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Erreur serveur" });
  }
});

// ==================================================
// ➕ CRÉER UNE AFFECTATION — Admin
// → POST /api/affectations
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;

    // ✅ Validation champs obligatoires
    if (!id_prof || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Enseignant, Classe et Matière OBLIGATOIRES" });

    const profId   = parseInt(id_prof);
    const classeId = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);

    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Un ou plusieurs identifiants sont invalides" });

    const annee = annee_scolaire?.trim() || ANNEE_SCOLAIRE_DEFAUT;

    // ✅ Création
    const { rows: [nouvelle] } = await pool.query(`
      INSERT INTO affectations_ens (id_prof, id_classe, id_matiere, annee_scolaire)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [profId, classeId, matiereId, annee]);

    console.log(`✅ Affectation créée — Prof ${profId} → Classe ${classeId}, Matière ${matiereId} (${annee})`);
    return res.json({ ok: true, message: "✅ Affectation ENREGISTRÉE avec succès", affectation: nouvelle });
  } catch (e) {
    console.error("❌ ERREUR création affectation :", e.code, e.message);
    if (e.code === '23505') // Violation contrainte unique
      return res.json({ ok: false, erreur: "⚠️ Cette affectation existe DÉJÀ pour cette année scolaire" });
    if (e.code === '23503') // Clé étrangère introuvable
      return res.json({ ok: false, erreur: "⚠️ Enseignant, Classe ou Matière INTROUVABLE" });
    return res.json({ ok: false, erreur: "⚠️ Impossible de créer l'affectation" });
  }
});

// ==================================================
// ✏️ MODIFIER UNE AFFECTATION — Admin
// → PUT /api/affectations/:id
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;

    if (!id_prof || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Enseignant, Classe et Matière OBLIGATOIRES" });

    const profId    = parseInt(id_prof);
    const classeId   = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);

    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Un ou plusieurs identifiants sont invalides" });

    const annee = annee_scolaire?.trim() || ANNEE_SCOLAIRE_DEFAUT;

    // ✅ Mise à jour
    const { rowCount } = await pool.query(`
      UPDATE affectations_ens
      SET id_prof = $1, id_classe = $2, id_matiere = $3, annee_scolaire = $4
      WHERE id_affectation = $5
    `, [profId, classeId, matiereId, annee, id_affectation]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Affectation INTROUVABLE" });

    console.log(`✅ Affectation mise à jour — ID: ${id_affectation}`);
    return res.json({ ok: true, message: "✅ Affectation MODIFIÉE avec succès" });
  } catch (e) {
    console.error("❌ ERREUR modification affectation :", e.code, e.message);
    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Cette combinaison existe DÉJÀ pour cette année" });
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Enseignant, Classe ou Matière INTROUVABLE" });
    return res.json({ ok: false, erreur: "⚠️ Impossible de modifier l'affectation" });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UNE AFFECTATION — Admin
// → DELETE /api/affectations/:id
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
      return res.json({ ok: false, erreur: "⚠️ Affectation INTROUVABLE" });

    console.log(`🗑️ Affectation supprimée — ID: ${id_affectation}`);
    return res.json({ ok: true, message: "✅ Affectation SUPPRIMÉE définitivement" });
  } catch (e) {
    console.error("❌ ERREUR suppression affectation :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ 
        ok: false, 
        erreur: "⚠️ IMPOSSIBLE : utilisée dans des notes ou emplois du temps" 
      });
    return res.json({ ok: false, erreur: "⚠️ Impossible de supprimer l'affectation" });
  }
});

module.exports = router;