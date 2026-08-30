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
  protegerAdmin = [veriftoken, verifadmin];
  protegerProf  = [veriftoken, verifprof];
} catch {
  protegerAdmin = [];
  protegerProf  = [];
  console.warn("⚠️ Middlewares introuvables — Mode développement");
}

// ✅ Année scolaire par défaut
const MOIS_RENTREE = 8;
const annee = new Date().getFullYear();
const mois = new Date().getMonth() + 1;
const ANNEE_SCOLAIRE_DEFAUT = mois >= MOIS_RENTREE
  ? `${annee}-${annee + 1}`
  : `${annee - 1}-${annee}`;

// ==================================================
// 📋 LISTE TOUTES AFFECTATIONS — Admin
// GET /api/affectations
// ==================================================
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        a.id_affectation,
        a.id_professeur,
        u.nom,
        u.prenoms,
        a.id_classe,
        c.libelle_classe,
        c.libelle_classe_ar,
        a.id_matiere,
        m.libelle_matiere,
        m.libelle_matiere_ar,
        m.coefficient,
        a.annee_scolaire,
        a.est_actif,
        a.date_creation,
        a.date_mise_a_jour
      FROM affectation a
      JOIN utilisateurs u ON a.id_professeur = u.id
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
// GET /api/affectations/prof/miennes
// ==================================================
router.get('/prof/miennes', protegerProf, async (req, res) => {
  try {
    const id_professeur = req.user?.id || req.user?.id_utilisateur;
    if (!id_professeur)
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
        a.annee_scolaire,
        a.est_actif
      FROM affectation a
      JOIN classes c  ON a.id_classe  = c.id_classe
      JOIN matieres m ON a.id_matiere = m.id_matiere
      WHERE a.id_professeur = $1 AND a.est_actif = true
      ORDER BY c.libelle_classe ASC, m.libelle_matiere ASC
    `, [id_professeur]);

    console.log(`✅ Mes affectations — ${rows.length} enregistrement(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR mes affectations :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger vos affectations" });
  }
});

// ==================================================
// 🔍 DÉTAIL UNE AFFECTATION — Admin
// GET /api/affectations/:id
// ==================================================
router.get('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rows: [affectation] } = await pool.query(`
      SELECT 
        a.id_affectation, a.id_professeur, a.id_classe, a.id_matiere, 
        a.annee_scolaire, a.est_actif, a.date_creation, a.date_mise_a_jour,
        u.nom, u.prenoms, c.libelle_classe, m.libelle_matiere
      FROM affectation a
      JOIN utilisateurs u ON a.id_professeur = u.id
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
// POST /api/affectations
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { id_professeur, id_classe, id_matiere, annee_scolaire, est_actif } = req.body;

    if (!id_professeur || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Enseignant, Classe et Matière OBLIGATOIRES" });

    const profId    = parseInt(id_professeur);
    const classeId  = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);

    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Un ou plusieurs identifiants sont invalides" });

    const annee = annee_scolaire?.trim() || ANNEE_SCOLAIRE_DEFAUT;
    const actif = est_actif !== false;

    const { rows: [nouvelle] } = await pool.query(`
      INSERT INTO affectation (id_professeur, id_classe, id_matiere, annee_scolaire, est_actif, date_creation)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [profId, classeId, matiereId, annee, actif]);

    console.log(`✅ Affectation créée — Prof ${profId} → Classe ${classeId}, Matière ${matiereId} (${annee})`);
    return res.json({ ok: true, message: "✅ Affectation ENREGISTRÉE avec succès", affectation: nouvelle });
  } catch (e) {
    console.error("❌ ERREUR création affectation :", e.code, e.message);
    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Cette affectation existe DÉJÀ pour cette année scolaire" });
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Enseignant, Classe ou Matière INTROUVABLE" });
    return res.json({ ok: false, erreur: "⚠️ Impossible de créer l'affectation" });
  }
});

// ==================================================
// ✏️ MODIFIER UNE AFFECTATION — Admin
// PUT /api/affectations/:id
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { id_professeur, id_classe, id_matiere, annee_scolaire, est_actif } = req.body;

    if (!id_professeur || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Enseignant, Classe et Matière OBLIGATOIRES" });

    const profId    = parseInt(id_professeur);
    const classeId  = parseInt(id_classe);
    const matiereId = parseInt(id_matiere);

    if ([profId, classeId, matiereId].some(isNaN))
      return res.json({ ok: false, erreur: "⚠️ Un ou plusieurs identifiants sont invalides" });

    const annee = annee_scolaire?.trim() || ANNEE_SCOLAIRE_DEFAUT;
    const actif = est_actif !== false;

    const { rowCount } = await pool.query(`
      UPDATE affectation
      SET id_professeur = $1, id_classe = $2, id_matiere = $3, 
          annee_scolaire = $4, est_actif = $5, date_mise_a_jour = NOW()
      WHERE id_affectation = $6
    `, [profId, classeId, matiereId, annee, actif, id_affectation]);

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
// DELETE /api/affectations/:id
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rowCount } = await pool.query(
      'DELETE FROM affectation WHERE id_affectation = $1',
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