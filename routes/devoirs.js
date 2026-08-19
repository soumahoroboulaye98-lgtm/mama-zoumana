const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifprof = require('../middleware/verifprof');

// ==================================================
// ➕ CRÉER UN NOUVEAU DEVOIR
// ==================================================
router.post('/creer', verifprof, async (req, res) => {
  try {
    const { 
      id_classe, 
      id_matiere, 
      type_devoir, 
      titre, 
      date_publication, 
      date_echeance, 
      description 
    } = req.body;

    const id_prof = req.user.id_utilisateur;

    // ✅ Validation champs obligatoires
    if (!id_classe || !id_matiere || !titre) {
      return res.json({ 
        ok: false, 
        erreur: "⚠️ Classe, Matière et Titre sont obligatoires" 
      });
    }

    // ✅ Valeurs par défaut
    const type = type_devoir || 'devoir';
    const datePub = date_publication || new Date().toISOString().split('T')[0];

    // 💾 Enregistrement dans la base
    const r = await pool.query(`
      INSERT INTO devoirs(
        id_classe, id_matiere, id_prof, type_devoir, 
        titre, date_publication, date_echeance, description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id_devoir
    `, [id_classe, id_matiere, id_prof, type, titre, datePub, date_echeance, description]);

    console.log("✅ DEVOIR CRÉÉ — ID:", r.rows[0].id_devoir);
    res.json({ 
      ok: true, 
      message: "✅ Devoir enregistré avec succès !",
      id_devoir: r.rows[0].id_devoir
    });

  } catch (e) {
    console.error("❌ ERREUR CRÉATION DEVOIR :", e.message);
    
    // ⚠️ Si la table n'existe pas encore
    if (e.message.includes('relation "devoirs" does not exist')) {
      return res.json({ 
        ok: false, 
        erreur: "⚠️ Table 'devoirs' introuvable. Crée-la d'abord dans ta base." 
      });
    }

    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE DES DEVOIRS DU PROFESSEUR
// ==================================================
router.get('/', verifprof, async (req, res) => {
  try {
    const id_prof = req.user.id_utilisateur;
    const r = await pool.query(`
      SELECT d.*, c.libelle_classe, m.libelle_matiere
      FROM devoirs d
      JOIN classes c ON d.id_classe = c.id_classe
      JOIN matieres m ON d.id_matiere = m.id_matiere
      WHERE d.id_prof = $1
      ORDER BY d.date_publication DESC
    `, [id_prof]);
    res.json({ ok: true, devoirs: r.rows, lignes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE DEVOIRS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});
// ==================================================
// ✏️ MODIFIER UN DEVOIR
// ==================================================
router.put('/:id_devoir', verifprof, async (req, res) => {
  try {
    const { id_devoir } = req.params;
    const { titre, type_devoir, date_publication, date_echeance, description } = req.body;
    const id_prof = req.user.id_utilisateur;

    if (!titre || titre.trim() === '') {
      return res.json({ ok: false, erreur: "Le titre est obligatoire" });
    }

    const r = await pool.query(`
      UPDATE devoirs 
      SET titre = $1, type_devoir = $2, date_publication = $3, date_echeance = $4, description = $5
      WHERE id_devoir = $6 AND id_prof = $7
      RETURNING id_devoir
    `, [titre.trim(), type_devoir || 'devoir', date_publication, date_echeance, description, id_devoir, id_prof]);

    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "Devoir introuvable ou non autorisé" });
    }

    res.json({ ok: true, message: "✅ Devoir mis à jour" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER UN DEVOIR
// ==================================================
router.delete('/:id_devoir', verifprof, async (req, res) => {
  try {
    const { id_devoir } = req.params;
    const id_prof = req.user.id_utilisateur;

    const r = await pool.query(`
      DELETE FROM devoirs 
      WHERE id_devoir = $1 AND id_prof = $2
      RETURNING id_devoir
    `, [id_devoir, id_prof]);

    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "Devoir introuvable ou non autorisé" });
    }

    res.json({ ok: true, message: "✅ Devoir supprimé" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});
module.exports = router;