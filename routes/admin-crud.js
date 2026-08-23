const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 🏫 GESTION DES   CLASSES
// ==================================================
router.post('/classes', protegerAdmin, async (req, res) => {
  try {
    const { libelle_classe, libelle_classe_en, libelle_classe_ar, cycle, capacite_max, salle, statut } = req.body;
    if (!libelle_classe) return res.status(400).json({ ok: false, erreur: "Libellé obligatoire" });
    if (capacite_max && (capacite_max < 10 || capacite_max > 80))
      return res.status(400).json({ ok: false, erreur: "Capacité entre 10 et 80" });

    const r = await pool.query(`
      INSERT INTO classes (libelle_classe, libelle_classe_en, libelle_classe_ar, cycle, capacite_max, salle, statut)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [libelle_classe, libelle_classe_en, libelle_classe_ar, cycle, capacite_max || 30, salle, statut || 'actif']);
    res.status(201).json({ ok: true, message: "✅ Classe ajoutée", donnee: r.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, erreur: e.message }); }
});

router.put('/classes/:id', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { libelle_classe, libelle_classe_en, libelle_classe_ar, cycle, capacite_max, salle, statut } = req.body;
    const r = await pool.query(`
      UPDATE classes SET
        libelle_classe=COALESCE($1,libelle_classe), libelle_classe_en=COALESCE($2,libelle_classe_en),
        libelle_classe_ar=COALESCE($3,libelle_classe_ar), cycle=COALESCE($4,cycle),
        capacite_max=COALESCE($5,capacite_max), salle=COALESCE($6,salle), statut=COALESCE($7,statut)
      WHERE id_classe=$8 RETURNING *
    `, [libelle_classe, libelle_classe_en, libelle_classe_ar, cycle, capacite_max, salle, statut, id]);
    res.json({ ok: true, message: "✅ Classe modifiée", donnee: r.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, erreur: e.message }); }
});

router.delete('/classes/:id', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM classes WHERE id_classe=$1 RETURNING *', [req.params.id]);
    res.json({ ok: true, message: "✅ Classe supprimée", donnee: r.rows[0] });
  } catch (e) { e.code==='23503' ? res.status(400).json({ok:false,erreur:"⚠️ Impossible : des élèves référencent cette classe"}) : res.status(500).json({ok:false,erreur:e.message}); }
});

// ==================================================
// 📚 GESTION DES MATIÈRES
// ==================================================
router.post('/matieres', protegerAdmin, async (req, res) => {
  try {
    const { libelle_matiere, libelle_matiere_en, libelle_matiere_ar, coefficient, statut } = req.body;
    const r = await pool.query(`
      INSERT INTO matieres (libelle_matiere, libelle_matiere_en, libelle_matiere_ar, coefficient, statut)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [libelle_matiere, libelle_matiere_en, libelle_matiere_ar, coefficient || 1.0, statut || 'actif']);
    res.status(201).json({ ok: true, message: "✅ Matière ajoutée", donnee: r.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, erreur: e.message }); }
});

router.put('/matieres/:id', protegerAdmin, async (req, res) => {
  try {
    const { libelle_matiere, libelle_matiere_en, libelle_matiere_ar, coefficient, statut } = req.body;
    const r = await pool.query(`
      UPDATE matieres SET
        libelle_matiere=COALESCE($1,libelle_matiere), libelle_matiere_en=COALESCE($2,libelle_matiere_en),
        libelle_matiere_ar=COALESCE($3,libelle_matiere_ar), coefficient=COALESCE($4,coefficient), statut=COALESCE($5,statut)
      WHERE id_matiere=$6 RETURNING *
    `, [libelle_matiere, libelle_matiere_en, libelle_matiere_ar, coefficient, statut, req.params.id]);
    res.json({ ok: true, message: "✅ Matière modifiée", donnee: r.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, erreur: e.message }); }
});

router.delete('/matieres/:id', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM matieres WHERE id_matiere=$1 RETURNING *', [req.params.id]);
    res.json({ ok: true, message: "✅ Matière supprimée", donnee: r.rows[0] });
  } catch (e) { e.code==='23503' ? res.status(400).json({ok:false,erreur:"⚠️ Impossible : des notes référencent cette matière"}) : res.status(500).json({ok:false,erreur:e.message}); }
});

// ==================================================
// 📋 VALIDER UNE PRÉINSCRIPTION
// ==================================================
router.put('/preinscriptions/:id/valider', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, observations_admin } = req.body;
    const r = await pool.query(`
      UPDATE preinscriptions SET statut=$1, observations=$2, date_creation=date_creation
      WHERE id=$3 RETURNING *
    `, [statut || 'valide', observations_admin, id]);
    res.json({ ok: true, message: "✅ Préinscription validée ! Matricule généré", donnee: r.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, erreur: e.message }); }
});

// ==================================================
// 📢 GESTION ANNONCES / ACTUALITÉS / CALENDRIER / BOUTIQUE
// ==================================================
// ... même principe : POST=Ajouter / PUT=Modifier / DELETE=Supprimer
// Toutes protégées par protegerAdmin

module.exports = router;