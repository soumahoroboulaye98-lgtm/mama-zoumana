const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ✅ Protections
const protegerAdmin = [veriftoken, verifadmin];
const protegerProf = [veriftoken, verifprof];


// ==================================================
// 📖 LISTE PUBLIQUE — Toutes matières
// ==================================================
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_matiere, libelle_matiere, coefficient, volume_horaire, langue_ens
      FROM matieres ORDER BY libelle_matiere ASC
    `);
    console.log(`✅ Liste matières chargée — ${rows.length}`);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR liste matières :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ CRÉER / MODIFIER — Admin
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { libelle_matiere, coefficient, volume_horaire, langue_ens } = req.body;

    if (!libelle_matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de matière obligatoire" });

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

    console.log(`✅ Matière enregistrée : ${nomNettoye}`);
    res.json({ ok: true, message: "✅ Matière enregistrée", id_matiere: rows[0].id_matiere });
  } catch (e) {
    console.error("❌ ERREUR création matière :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER PAR ID — Admin
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { libelle_matiere, coefficient, volume_horaire, langue_ens } = req.body;
    if (!libelle_matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de matière obligatoire" });

    const nomNettoye = libelle_matiere.trim();
    const coef = Math.max(1, Number(coefficient) || 1);
    const vol = Math.max(0, Number(volume_horaire) || 0);
    const langue = (langue_ens || 'fr').toLowerCase().trim();

    const { rowCount } = await pool.query(`
      UPDATE matieres
      SET libelle_matiere = $1, coefficient = $2, volume_horaire = $3, langue_ens = $4
      WHERE id_matiere = $5
    `, [nomNettoye, coef, vol, langue, id_matiere]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Matière introuvable" });

    console.log(`✅ Matière mise à jour — ID: ${id_matiere}`);
    res.json({ ok: true, message: "✅ Matière mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR modification matière :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🗑️ SUPPRIMER — Admin
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rowCount } = await pool.query(
      'DELETE FROM matieres WHERE id_matiere = $1', [id_matiere]
    );
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Matière introuvable" });

    console.log(`🗑️ Matière supprimée — ID: ${id_matiere}`);
    res.json({ ok: true, message: "✅ Matière supprimée" });
  } catch (e) {
    console.error("❌ ERREUR suppression matière :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Impossible : utilisée dans des notes ou affectations" });
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 👨‍🏫 MES MATIÈRES — Prof connecté
// ==================================================
router.get('/prof', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    const id_classe = req.query.classe ? parseInt(req.query.classe) : null;

    let requete, params;
    if (id_classe && !isNaN(id_classe)) {
      requete = `
        SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
        FROM matieres m
        JOIN affectations_ens a ON m.id_matiere = a.id_matiere
        WHERE a.id_prof = $1 AND a.id_classe = $2
        ORDER BY m.libelle_matiere ASC
      `;
      params = [id_prof, id_classe];
    } else {
      requete = `
        SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
        FROM matieres m
        JOIN affectations_ens a ON m.id_matiere = a.id_matiere
        WHERE a.id_prof = $1
        ORDER BY m.libelle_matiere ASC
      `;
      params = [id_prof];
    }

    const { rows } = await pool.query(requete, params);
    console.log(`✅ Mes matières chargées — ${rows.length}`);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR matières prof :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;