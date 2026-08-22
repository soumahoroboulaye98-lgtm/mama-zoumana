const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté systématiquement
const verifprof = require('../middleware/verifprof');       // ✅ Middleware spécifique Professeur

// ✅ Protection groupée uniforme : token + vérification du rôle Professeur
const protegerProf = [veriftoken, verifprof];


// ==================================================
// ➕ CRÉER UN NOUVEAU DEVOIR
// 🔒 Réservé : Professeur authentifié
// ==================================================
router.post('/creer', protegerProf, async (req, res) => {
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

    const id_prof = req.user.id;

    // Validation des champs obligatoires
    if (!id_classe || !id_matiere || !titre || titre.trim() === '') {
      return res.json({
        ok: false,
        erreur: "⚠️ Classe, Matière et Titre sont obligatoires"
      });
    }

    // Valeurs par défaut
    const type = type_devoir || 'devoir';
    const datePub = date_publication || new Date().toISOString().split('T')[0];

    // Enregistrement dans la base de données
    const r = await pool.query(`
      INSERT INTO devoirs(
        id_classe, id_matiere, id_prof, type_devoir,
        titre, date_publication, date_echeance, description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id_devoir
    `, [id_classe, id_matiere, id_prof, type, titre.trim(), datePub, date_echeance, description]);

    console.log(`✅ Devoir créé — ID: ${r.rows[0].id_devoir}, Professeur: ${id_prof}`);
    res.json({
      ok: true,
      message: "✅ Devoir enregistré avec succès !",
      id_devoir: r.rows[0].id_devoir
    });

  } catch (e) {
    console.error("❌ ERREUR CRÉATION DEVOIR :", e.message);

    // Message spécifique si la table n'existe pas encore
    if (e.message.includes('relation "devoirs" does not exist')) {
      return res.json({
        ok: false,
        erreur: "⚠️ Table 'devoirs' introuvable. Veuillez la créer dans votre base de données."
      });
    }

    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 LISTE DES DEVOIRS DU PROFESSEUR
// 🔒 Réservé : Professeur authentifié
// ==================================================
router.get('/', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;

    const r = await pool.query(`
      SELECT d.*, c.libelle_classe, m.libelle_matiere
      FROM devoirs d
      JOIN classes c ON d.id_classe = c.id_classe
      JOIN matieres m ON d.id_matiere = m.id_matiere
      WHERE d.id_prof = $1
      ORDER BY d.date_publication DESC
    `, [id_prof]);

    console.log(`✅ Liste des devoirs consultée — Professeur: ${id_prof}, ${r.rows.length} enregistrement(s)`);
    res.json({ ok: true, devoirs: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT LISTE DEVOIRS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UN DEVOIR
// 🔒 Réservé : Professeur authentifié (auteur du devoir)
// ==================================================
router.put('/:id_devoir', protegerProf, async (req, res) => {
  try {
    const id_devoir = parseInt(req.params.id_devoir);
    if (isNaN(id_devoir)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant de devoir invalide" });
    }

    const { titre, type_devoir, date_publication, date_echeance, description } = req.body;
    const id_prof = req.user.id;

    if (!titre || titre.trim() === '') {
      return res.json({ ok: false, erreur: "⚠️ Le titre est obligatoire" });
    }

    const r = await pool.query(`
      UPDATE devoirs
      SET titre = $1, type_devoir = $2, date_publication = $3, date_echeance = $4, description = $5
      WHERE id_devoir = $6 AND id_prof = $7
      RETURNING id_devoir
    `, [titre.trim(), type_devoir || 'devoir', date_publication, date_echeance, description, id_devoir, id_prof]);

    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "⚠️ Devoir introuvable ou vous n'êtes pas autorisé à le modifier" });
    }

    console.log(`✅ Devoir mis à jour — ID: ${id_devoir}`);
    res.json({ ok: true, message: "✅ Devoir mis à jour avec succès !" });

  } catch (e) {
    console.error("❌ ERREUR MODIFICATION DEVOIR :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UN DEVOIR
// 🔒 Réservé : Professeur authentifié (auteur du devoir)
// ==================================================
router.delete('/:id_devoir', protegerProf, async (req, res) => {
  try {
    const id_devoir = parseInt(req.params.id_devoir);
    if (isNaN(id_devoir)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant de devoir invalide" });
    }

    const id_prof = req.user.id;

    const r = await pool.query(`
      DELETE FROM devoirs
      WHERE id_devoir = $1 AND id_prof = $2
      RETURNING id_devoir
    `, [id_devoir, id_prof]);

    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "⚠️ Devoir introuvable ou vous n'êtes pas autorisé à le supprimer" });
    }

    console.log(`🗑️ Devoir supprimé — ID: ${id_devoir}`);
    res.json({ ok: true, message: "✅ Devoir supprimé avec succès !" });

  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION DEVOIR :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;