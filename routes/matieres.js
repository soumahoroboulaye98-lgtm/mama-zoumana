const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ==================================================
// ➕ AJOUTER / METTRE À JOUR UNE MATIÈRE
// ==================================================
router.post('/ajouter', verifadmin, async (req, res) => {
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

    res.json({ ok: true, message: "✅ Matière enregistrée / mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR AJOUT MATIÈRE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE TOUTES LES MATIÈRES (Admin)
// ==================================================
router.get('/', verifadmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_matiere, libelle_matiere, coefficient, volume_horaire, langue_ens 
      FROM matieres 
      ORDER BY libelle_matiere
    `);
    console.log("📦 MATIÈRES CHARGÉES :", r.rows.length, "matières");
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE MATIÈRES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📚 MATIÈRES PAR CLASSE (pour la saisie des notes)
// ✅ CETTE ROUTE EST APPELÉE PAR TA PAGE HTML
// ==================================================
router.get('/mes-matieres', verifprof, async (req, res) => {
  try {
    const id_prof = req.user.id_utilisateur;
    const id_classe = req.query.classe; // ← Reçoit ?classe=XXX depuis la page

    console.log("🔍 Chargement matières — id_prof:", id_prof, "| id_classe:", id_classe);

    let r;
    if (id_classe) {
      // ✅ Matières enseignées par ce prof DANS cette classe
      r = await pool.query(`
        SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
        FROM matieres m
        JOIN affectations a ON m.id_matiere = a.id_matiere
        WHERE a.id_prof = $1 AND a.id_classe = $2
        ORDER BY m.libelle_matiere
      `, [id_prof, id_classe]);
    } else {
      // ✅ Toutes les matières de ce prof (toutes classes confondues)
      r = await pool.query(`
        SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
        FROM matieres m
        JOIN affectations a ON m.id_matiere = a.id_matiere
        WHERE a.id_prof = $1
        ORDER BY m.libelle_matiere
      `, [id_prof]);
    }

    console.log("✅ Matières trouvées :", r.rows.length, r.rows);
    res.json({ ok: true, matieres: r.rows, lignes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR MATIÈRES PROF :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 MATIÈRES DU PROFESSEUR CONNECTÉ (ancienne / compatibilité)
// ==================================================
router.get('/prof', verifprof, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
      FROM matieres m
      JOIN affectations a ON m.id_matiere = a.id_matiere
      WHERE a.id_prof = $1
      ORDER BY m.libelle_matiere
    `, [req.user.id_utilisateur]);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR MATIÈRES PROF :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UNE MATIÈRE
// ==================================================
router.put('/:id', verifadmin, async (req, res) => {
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

    res.json({ ok: true, message: "✅ Matière mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION MATIÈRE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER UNE MATIÈRE
// ==================================================
router.delete('/:id', verifadmin, async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM matieres WHERE id_matiere = $1 RETURNING id_matiere`, [req.params.id]);
    
    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "Matière introuvable" });
    }

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