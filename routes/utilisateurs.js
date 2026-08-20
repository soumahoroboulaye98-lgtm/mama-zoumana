const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté
const verifadmin = require('../middleware/verifadmin');    // ✅ Après le token

// ✅ Chaîne : d'abord vérifie le token, puis vérifie le rôle admin
const protegerAdmin = [veriftoken, verifadmin];


// ✅ LISTE DES PROFESSEURS — D'ABORD car route précise
router.get('/professeurs', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_utilisateur, nom, prenoms, email, telephone 
      FROM utilisateurs 
      WHERE role = 'prof' 
      ORDER BY nom, prenoms
    `);
    console.log("👨‍🏫 PROFESSEURS CHARGÉS :", r.rows.length);
    res.json({ ok: true, utilisateurs: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE PROFS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ✅ LISTER TOUS LES UTILISATEURS
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const { role } = req.query;
    let r;
    if (role) {
      r = await pool.query(`
        SELECT id_utilisateur, nom, prenoms, email, telephone, role, 
               matricule, id_classe, date_creation 
        FROM utilisateurs 
        WHERE role = $1 ORDER BY nom, prenoms
      `, [role]);
    } else {
      r = await pool.query(`
        SELECT id_utilisateur, nom, prenoms, email, telephone, role, 
               matricule, id_classe, date_creation 
        FROM utilisateurs 
        ORDER BY nom, prenoms
      `);
    }
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.log("❌ ERREUR UTILISATEURS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ✅ VOIR UN SEUL UTILISATEUR PAR ID
router.get('/:id', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM utilisateurs WHERE id_utilisateur = $1
    `, [req.params.id]);
    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "Utilisateur introuvable" });
    }
    res.json({ ok: true, utilisateur: r.rows[0] });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});


// ✏️ MODIFIER UN UTILISATEUR
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const { nom, prenoms, email, telephone, role, id_classe } = req.body;
    await pool.query(`
      UPDATE utilisateurs 
      SET nom = $1, prenoms = $2, email = $3, telephone = $4, role = $5, id_classe = $6
      WHERE id_utilisateur = $7
    `, [nom, prenoms, email, telephone, role, id_classe || null, req.params.id]);
    res.json({ ok: true, message: "✅ Utilisateur modifié !" });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});


// 🗑️ SUPPRIMER UN UTILISATEUR
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM utilisateurs WHERE id_utilisateur = $1', [req.params.id]);
    res.json({ ok: true, message: "✅ Utilisateur supprimé !" });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;