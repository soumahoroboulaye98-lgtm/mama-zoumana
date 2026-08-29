const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==================================================
// 🔐 MIDDLEWARES DE PROTECTION — Mode secours inclus
// ==================================================
let veriftoken, verifadmin, verifprof, protegerTous, protegerAdmin, protegerProf;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  verifprof  = require('../middleware/verifprof');
  protegerTous = [veriftoken];          // Connecté
  protegerAdmin = [veriftoken, verifadmin]; // Admin
  protegerProf = [veriftoken, verifprof];   // Enseignant
} catch {
  protegerTous = [];
  protegerAdmin = [];
  protegerProf = [];
  console.warn("⚠️ Middlewares introuvables — Mode développement");
}

// ==================================================
// 📋 EMPLOI DU TEMPS GLOBAL — TOUTES SÉANCES
// → GET /api/emploi
// ==================================================
router.get('/', protegerTous, async (req, res) => {
  try {
    const { rows: seances } = await pool.query(`
      SELECT 
        e.id_emploi AS id,
        e.id_classe,
        e.id_prof,
        e.id_matiere,
        e.jour,
        e.heure_debut,
        e.heure_fin,
        c.libelle_classe,
        c.libelle_classe_ar,
        m.libelle_matiere,
        m.libelle_matiere_ar,
        CONCAT(u.nom, ' ', u.prenoms) AS professeur
      FROM emploi e
      LEFT JOIN classes   c ON e.id_classe  = c.id_classe
      LEFT JOIN matieres  m ON e.id_matiere = m.id_matiere
      LEFT JOIN utilisateurs u ON e.id_prof  = u.id_utilisateur
      ORDER BY 
        CASE e.jour 
          WHEN 'Lundi'    THEN 1 
          WHEN 'Mardi'    THEN 2 
          WHEN 'Mercredi' THEN 3 
          WHEN 'Jeudi'    THEN 4 
          WHEN 'Vendredi' THEN 5 
          WHEN 'Samedi'   THEN 6 ELSE 7 
        END,
        e.heure_debut ASC
    `);
    console.log(`✅ Emploi global — ${seances.length} séance(s)`);
    return res.json({ ok: true, lignes: seances });
  } catch (e) {
    console.error("❌ ERREUR EMPLOI GLOBAL :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger l'emploi du temps" });
  }
});

// ==================================================
// 📋 EMPLOI DU TEMPS PAR CLASSE
// → GET /api/emploi/classe/:id_classe
// ==================================================
router.get('/classe/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant de classe invalide" });

    const { rows: seances } = await pool.query(`
      SELECT 
        e.id_emploi AS id,
        e.id_prof,
        e.id_matiere,
        e.jour,
        e.heure_debut,
        e.heure_fin,
        m.libelle_matiere,
        m.libelle_matiere_ar,
        CONCAT(u.nom, ' ', u.prenoms) AS professeur
      FROM emploi e
      LEFT JOIN matieres  m ON e.id_matiere = m.id_matiere
      LEFT JOIN utilisateurs u ON e.id_prof  = u.id_utilisateur
      WHERE e.id_classe = $1
      ORDER BY 
        CASE e.jour 
          WHEN 'Lundi'    THEN 1 
          WHEN 'Mardi'    THEN 2 
          WHEN 'Mercredi' THEN 3 
          WHEN 'Jeudi'    THEN 4 
          WHEN 'Vendredi' THEN 5 
          WHEN 'Samedi'   THEN 6 ELSE 7 
        END,
        e.heure_debut ASC
    `, [id_classe]);

    const { rows: [classe] } = await pool.query(`
      SELECT libelle_classe, libelle_classe_ar, cycle 
      FROM classes 
      WHERE id_classe = $1
    `, [id_classe]);

    console.log(`✅ Emploi Classe ${classe?.libelle_classe || id_classe} — ${seances.length} séance(s)`);
    return res.json({ ok: true, classe: classe || null, lignes: seances });
  } catch (e) {
    console.error("❌ ERREUR EMPLOI PAR CLASSE :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger l'emploi du temps" });
  }
});

// ==================================================
// 📋 EMPLOI DU TEMPS PAR ENSEIGNANT
// → GET /api/emploi/prof/:id_prof
// ==================================================
router.get('/prof/:id_prof', protegerProf, async (req, res) => {
  try {
    const id_prof = parseInt(req.params.id_prof);
    if (isNaN(id_prof))
      return res.json({ ok: false, erreur: "⚠️ Identifiant enseignant invalide" });

    const { rows: seances } = await pool.query(`
      SELECT 
        e.id_emploi AS id,
        e.id_classe,
        e.id_matiere,
        e.jour,
        e.heure_debut,
        e.heure_fin,
        c.libelle_classe,
        c.libelle_classe_ar,
        m.libelle_matiere,
        m.libelle_matiere_ar
      FROM emploi e
      LEFT JOIN classes  c ON e.id_classe  = c.id_classe
      LEFT JOIN matieres m ON e.id_matiere = m.id_matiere
      WHERE e.id_prof = $1
      ORDER BY 
        CASE e.jour 
          WHEN 'Lundi'    THEN 1 
          WHEN 'Mardi'    THEN 2 
          WHEN 'Mercredi' THEN 3 
          WHEN 'Jeudi'    THEN 4 
          WHEN 'Vendredi' THEN 5 
          WHEN 'Samedi'   THEN 6 ELSE 7 
        END,
        e.heure_debut ASC
    `, [id_prof]);

    console.log(`✅ Emploi Enseignant ${id_prof} — ${seances.length} séance(s)`);
    return res.json({ ok: true, lignes: seances });
  } catch (e) {
    console.error("❌ ERREUR EMPLOI PAR ENSEIGNANT :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger votre emploi du temps" });
  }
});

// ==================================================
// ➕ AJOUTER UN COURS
// → POST /api/emploi/cours
// ==================================================
router.post('/cours', protegerAdmin, async (req, res) => {
  try {
    const { id_classe, id_prof, id_matiere, jour, heure_debut, heure_fin } = req.body;

    if (!id_classe || !id_prof || !id_matiere || !jour?.trim() || !heure_debut?.trim() || !heure_fin?.trim())
      return res.json({ ok: false, erreur: "⚠️ Classe, Prof, Matière, Jour et Horaires OBLIGATOIRES" });

    const { rows: [{ id_emploi }] } = await pool.query(`
      INSERT INTO emploi(id_classe, id_prof, id_matiere, jour, heure_debut, heure_fin)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id_emploi
    `, [id_classe, id_prof, id_matiere, jour.trim(), heure_debut.trim(), heure_fin.trim()]);

    console.log(`✅ Cours ajouté — ID: ${id_emploi}`);
    return res.json({ ok: true, message: "✅ Cours ajouté avec succès", id_emploi });
  } catch (e) {
    console.error("❌ ERREUR AJOUT COURS :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Classe, Enseignant ou Matière INTROUVABLE" });
    return res.json({ ok: false, erreur: "⚠️ Impossible d'ajouter le cours" });
  }
});

// ==================================================
// ✏️ MODIFIER UN COURS
// → PUT /api/emploi/cours/:id
// ==================================================
router.put('/cours/:id', protegerAdmin, async (req, res) => {
  try {
    const id_emploi = parseInt(req.params.id);
    if (isNaN(id_emploi))
      return res.json({ ok: false, erreur: "⚠️ Identifiant du cours invalide" });

    const { id_classe, id_prof, id_matiere, jour, heure_debut, heure_fin } = req.body;

    if (!id_classe || !id_prof || !id_matiere || !jour?.trim() || !heure_debut?.trim() || !heure_fin?.trim())
      return res.json({ ok: false, erreur: "⚠️ Tous les champs sont obligatoires" });

    const { rowCount } = await pool.query(`
      UPDATE emploi 
      SET id_classe=$2, id_prof=$3, id_matiere=$4, jour=$5, heure_debut=$6, heure_fin=$7
      WHERE id_emploi = $1
    `, [id_emploi, id_classe, id_prof, id_matiere, jour.trim(), heure_debut.trim(), heure_fin.trim()]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Cours INTROUVABLE" });

    console.log(`✅ Cours modifié — ID: ${id_emploi}`);
    return res.json({ ok: true, message: "✅ Cours modifié avec succès" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION COURS :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Classe, Enseignant ou Matière INTROUVABLE" });
    return res.json({ ok: false, erreur: "⚠️ Impossible de modifier le cours" });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UN COURS
// → DELETE /api/emploi/cours/:id
// ==================================================
router.delete('/cours/:id', protegerAdmin, async (req, res) => {
  try {
    const id_emploi = parseInt(req.params.id);
    if (isNaN(id_emploi))
      return res.json({ ok: false, erreur: "⚠️ Identifiant du cours invalide" });

    const { rowCount } = await pool.query('DELETE FROM emploi WHERE id_emploi = $1', [id_emploi]);
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Cours INTROUVABLE" });

    console.log(`🗑️ Cours supprimé — ID: ${id_emploi}`);
    return res.json({ ok: true, message: "✅ Cours supprimé avec succès" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION COURS :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de supprimer le cours" });
  }
});

module.exports = router;