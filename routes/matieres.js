const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
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

    if (!libelle_matiere?.trim()) {
      return res.json({ ok: false, erreur: "⚠️ Le nom de la matière est obligatoire" });
    }

    const nomNettoye = libelle_matiere.trim();
    const coef = Math.max(1, Number(coefficient) || 1);
    const vol = Math.max(0, Number(volume_horaire) || 0);
    const langue = (langue_ens || 'fr').toLowerCase().trim();

    const { rows } = await pool.query(`
      INSERT INTO matieres(libelle_matiere, coefficient, volume_horaire, langue_ens)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (libelle_matiere) DO UPDATE SET
        coefficient = EXCLUDED.coefficient,
        volume_horaire = EXCLUDED.volume_horaire,
        langue_ens = EXCLUDED.langue_ens
      RETURNING id_matiere
    `, [nomNettoye, coef, vol, langue]);

    console.log(`✅ Matière enregistrée/mise à jour : ${nomNettoye} (ID: ${rows[0].id_matiere})`);
    res.json({ ok: true, message: "✅ Matière enregistrée / mise à jour", id_matiere: rows[0].id_matiere });
  } catch (e) {
    console.error("❌ ERREUR AJOUT MATIÈRE :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE COMPLÈTE DES MATIÈRES — Admin seul
// ==================================================
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_matiere, libelle_matiere, coefficient, volume_horaire, langue_ens
      FROM matieres
      ORDER BY libelle_matiere ASC
    `);
    console.log(`✅ Liste matières chargée — ${rows.length} élément(s)`);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE MATIÈRES :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📚 MATIÈRES DU PROFESSEUR — Par défaut ou par classe
// ==================================================
router.get('/mes-matieres', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id; // ✅ Correspond à la clé primaire de utilisateurs
    const id_classe = req.query.classe ? parseInt(req.query.classe) : null;

    console.log("🔍 Chargement matières — id_prof:", id_prof, "| id_classe:", id_classe);

    let requete, parametres;

    if (id_classe && !isNaN(id_classe)) {
      requete = `
        SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
        FROM matieres m
        JOIN affectations_ens a ON m.id_matiere = a.id_matiere
        WHERE a.id_prof = $1 AND a.id_classe = $2
        ORDER BY m.libelle_matiere ASC
      `;
      parametres = [id_prof, id_classe];
    } else {
      requete = `
        SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
        FROM matieres m
        JOIN affectations_ens a ON m.id_matiere = a.id_matiere
        WHERE a.id_prof = $1
        ORDER BY m.libelle_matiere ASC
      `;
      parametres = [id_prof];
    }

    const { rows } = await pool.query(requete, parametres);

    console.log(`✅ ${rows.length} matière(s) trouvée(s) pour le prof ${id_prof}`);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR MATIÈRES PROF :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 MATIÈRES DU PROFESSEUR — Alias / Compatibilité
// ==================================================
router.get('/prof', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    const { rows } = await pool.query(`
      SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
      FROM matieres m
      JOIN affectations_ens a ON m.id_matiere = a.id_matiere
      WHERE a.id_prof = $1
      ORDER BY m.libelle_matiere ASC
    `, [id_prof]);

    console.log(`✅ Matières du professeur chargées — ${rows.length} élément(s)`);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR MATIÈRES PROF :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UNE MATIÈRE — Admin seul
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant de matière invalide" });
    }

    const { libelle_matiere, coefficient, volume_horaire, langue_ens } = req.body;

    if (!libelle_matiere?.trim()) {
      return res.json({ ok: false, erreur: "⚠️ Le nom de la matière est obligatoire" });
    }

    const nomNettoye = libelle_matiere.trim();
    const coef = Math.max(1, Number(coefficient) || 1);
    const vol = Math.max(0, Number(volume_horaire) || 0);
    const langue = (langue_ens || 'fr').toLowerCase().trim();

    const { rowCount } = await pool.query(`
      UPDATE matieres
      SET libelle_matiere = $1, coefficient = $2, volume_horaire = $3, langue_ens = $4
      WHERE id_matiere = $5
    `, [nomNettoye, coef, vol, langue, id_matiere]);

    if (rowCount === 0) {
      return res.json({ ok: false, erreur: "⚠️ Matière introuvable" });
    }

    console.log(`✅ Matière mise à jour — ID: ${id_matiere}`);
    res.json({ ok: true, message: "✅ Matière mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION MATIÈRE :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER UNE MATIÈRE — Admin seul
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant de matière invalide" });
    }

    const { rowCount } = await pool.query(`
      DELETE FROM matieres WHERE id_matiere = $1
    `, [id_matiere]);

    if (rowCount === 0) {
      return res.json({ ok: false, erreur: "⚠️ Matière introuvable" });
    }

    console.log(`🗑️ Matière supprimée — ID: ${id_matiere}`);
    res.json({ ok: true, message: "✅ Matière supprimée" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION MATIÈRE :", e.code, e.message);
    if (e.code === '23503') {
      return res.json({
        ok: false,
        erreur: "⚠️ Impossible : cette matière est utilisée dans des affectations, notes, emplois du temps ou feuilles de présence"
      });
    }
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;