const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté systématiquement
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ✅ Protections groupées uniformes
const protegerAdmin = [veriftoken, verifadmin];
const protegerProf = [veriftoken, verifprof];


// ==================================================
// ➕ AJOUTER / METTRE À JOUR UNE MATIÈRE — Admin seul
// ==================================================
router.post('/ajouter', protegerAdmin, async (req, res) => {
  try {
    const { libelle_matiere, coefficient, volume_horaire, langue_ens } = req.body;

    if (!libelle_matiere || libelle_matiere.trim() === '') {
      return res.json({ ok: false, erreur: "Le nom de la matière est obligatoire" });
    }

    const nomNettoye = libelle_matiere.trim();
    const coef = Number(coefficient) || 1;
    const vol = Number(volume_horaire) || 0;
    const langue = langue_ens || 'fr';

    if (coef <= 0) {
      return res.json({ ok: false, erreur: "Le coefficient doit être supérieur à 0" });
    }

    await pool.query(`
      INSERT INTO matieres(libelle_matiere, coefficient, volume_horaire, langue_ens)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (libelle_matiere) DO UPDATE SET
        coefficient = EXCLUDED.coefficient,
        volume_horaire = EXCLUDED.volume_horaire,
        langue_ens = EXCLUDED.langue_ens
    `, [nomNettoye, coef, vol, langue]);

    console.log(`✅ Matière ajoutée/mise à jour : ${nomNettoye}`);
    res.json({ ok: true, message: "✅ Matière enregistrée / mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR AJOUT MATIÈRE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 LISTE TOUTES LES MATIÈRES — Admin seul
// ==================================================
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_matiere, libelle_matiere, coefficient, volume_horaire, langue_ens
      FROM matieres
      ORDER BY libelle_matiere
    `);
    console.log("📦 Matières chargées :", r.rows.length);
    res.json({ ok: true, matieres: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE MATIÈRES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📚 MATIÈRES PAR CLASSE — Professeur connecté
// ==================================================
router.get('/mes-matieres', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    const id_classe = req.query.classe;

    console.log("🔍 Chargement matières — id_prof:", id_prof, "| id_classe:", id_classe);

    let r;
    if (id_classe) {
      r = await pool.query(`
        SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
        FROM matieres m
        JOIN affectations a ON m.id_matiere = a.id_matiere
        WHERE a.id_prof = $1 AND a.id_classe = $2
        ORDER BY m.libelle_matiere
      `, [id_prof, id_classe]);
    } else {
      r = await pool.query(`
        SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
        FROM matieres m
        JOIN affectations a ON m.id_matiere = a.id_matiere
        WHERE a.id_prof = $1
        ORDER BY m.libelle_matiere
      `, [id_prof]);
    }

    console.log("✅ Matières trouvées :", r.rows.length);
    res.json({ ok: true, matieres: r.rows });
  } catch (e) {
    console.error("❌ ERREUR MATIÈRES PROF :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 MATIÈRES DU PROFESSEUR CONNECTÉ — Compatibilité
// ==================================================
router.get('/prof', protegerProf, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
      FROM matieres m
      JOIN affectations a ON m.id_matiere = a.id_matiere
      WHERE a.id_prof = $1
      ORDER BY m.libelle_matiere
    `, [req.user.id]);
    console.log("✅ Matières du professeur chargées :", r.rows.length);
    res.json({ ok: true, matieres: r.rows });
  } catch (e) {
    console.error("❌ ERREUR MATIÈRES PROF :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UNE MATIÈRE — Admin seul
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const { libelle_matiere, coefficient, volume_horaire, langue_ens } = req.body;

    if (!libelle_matiere || libelle_matiere.trim() === '') {
      return res.json({ ok: false, erreur: "Le nom de la matière est obligatoire" });
    }

    const coef = Number(coefficient) || 1;
    const vol = Number(volume_horaire) || 0;
    const langue = langue_ens || 'fr';

    if (coef <= 0) {
      return res.json({ ok: false, erreur: "Le coefficient doit être supérieur à 0" });
    }

    const r = await pool.query(`
      UPDATE matieres
      SET libelle_matiere = $1, coefficient = $2, volume_horaire = $3, langue_ens = $4
      WHERE id_matiere = $5
      RETURNING id_matiere
    `, [libelle_matiere.trim(), coef, vol, langue, req.params.id]);

    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "Matière introuvable" });
    }

    console.log(`✅ Matière mise à jour — ID: ${req.params.id}`);
    res.json({ ok: true, message: "✅ Matière mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION MATIÈRE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UNE MATIÈRE — Admin seul
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      DELETE FROM matieres WHERE id_matiere = $1 RETURNING id_matiere
    `, [req.params.id]);

    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "Matière introuvable" });
    }

    console.log(`🗑️ Matière supprimée — ID: ${req.params.id}`);
    res.json({ ok: true, message: "✅ Matière supprimée" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION MATIÈRE :", e.message);
    if (e.code === '23503') {
      return res.json({ ok: false, erreur: "⚠️ Impossible : cette matière est déjà utilisée dans des affectations ou notes" });
    }
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;