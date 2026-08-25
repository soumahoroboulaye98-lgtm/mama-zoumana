const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

const protegerTous = [veriftoken];
const protegerAdmin = [veriftoken, verifadmin];


// 📚 LISTE DES CLASSES
router.get('/classes', protegerTous, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_classe, libelle_classe, cycle
      FROM classes
      ORDER BY 
        CASE cycle 
          WHEN 'maternelle' THEN 1
          WHEN 'primaire' THEN 2
          WHEN 'college' THEN 3
          WHEN 'lycee' THEN 4
          ELSE 5
        END,
        libelle_classe ASC
    `);
    res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE CLASSES :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// 📖 LISTE DES MATIÈRES
router.get('/matieres', protegerTous, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_matiere, libelle_matiere
      FROM matieres
      ORDER BY libelle_matiere ASC
    `);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE MATIÈRES :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// 👨‍🏫 LISTE DES PROFESSEURS
router.get('/professeurs', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, nom, prenom
      FROM utilisateurs
      WHERE role = 'prof' AND statut_compte = 'valide'
      ORDER BY nom ASC, prenom ASC
    `);
    res.json({ ok: true, professeurs: rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE PROFESSEURS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;