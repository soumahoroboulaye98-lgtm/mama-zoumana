const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');

// 📋 LISTE DES AFFECTATIONS
router.get('/liste', verifadmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT a.id_affectation,
             u.nom AS nom_prof, u.prenoms AS prenoms_prof,
             c.libelle_classe AS classe,
             m.libelle_matiere AS matiere
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof = u.id_utilisateur
      JOIN classes c ON a.id_classe = c.id_classe
      JOIN matieres m ON a.id_matiere = m.id_matiere
      ORDER BY u.nom, c.libelle_classe, m.libelle_matiere
    `);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE AFFECTATIONS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ➕ AJOUTER UNE AFFECTATION
router.post('/ajouter', verifadmin, async (req, res) => {
  try {
    const { id_prof, id_classe, id_matiere } = req.body;
    
    if(!id_prof || !id_classe || !id_matiere){
      return res.json({ ok: false, erreur: "Tous les champs sont obligatoires" });
    }

    const r = await pool.query(`
      INSERT INTO affectations_ens (id_prof, id_classe, id_matiere)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id_prof, id_classe, id_matiere]);

    res.json({ ok: true, message: "Affectation enregistrée !", donnee: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR AJOUT AFFECTATION :", e.message);
    if(e.code === '23505'){
      return res.json({ ok: false, erreur: "Cette affectation existe déjà !" });
    }
    res.json({ ok: false, erreur: e.message });
  }
});

// 🗑️ SUPPRIMER UNE AFFECTATION
router.delete('/supprimer/:id', verifadmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM affectations_ens WHERE id_affectation = $1', [id]);
    res.json({ ok: true, message: "Supprimé !" });
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;