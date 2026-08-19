const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ==================================================
// ➕ AJOUTER / MODIFIER UNE SÉANCE (ADMIN SEUL)
// ==================================================
router.post('/ajouter', verifadmin, async (req, res) => {
  try {
    const { id_classe, id_matiere, id_prof, jour, heure_debut, heure_fin, salle } = req.body;

    if (!id_classe || !id_matiere || !id_prof || !jour || !heure_debut || !heure_fin) {
      return res.json({ 
        ok: false, 
        erreur: "⚠️ Champs obligatoires : Classe, Matière, Professeur, Jour, Heures" 
      });
    }

    const classeExiste = await pool.query('SELECT 1 FROM classes WHERE id_classe = $1', [id_classe]);
    if (classeExiste.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Cette classe n'existe pas" });
    }

    const matiereExiste = await pool.query('SELECT 1 FROM matieres WHERE id_matiere = $1', [id_matiere]);
    if (matiereExiste.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Cette matière n'existe pas" });
    }

    const profExiste = await pool.query(
      'SELECT 1 FROM utilisateurs WHERE id_utilisateur = $1 AND role = $2', [id_prof, 'prof']
    );
    if (profExiste.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Ce professeur n'existe pas" });
    }

    await pool.query(`
      INSERT INTO emploi_temps(id_classe, id_matiere, id_prof, jour, heure_debut, heure_fin, salle)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id_classe, jour, heure_debut) DO UPDATE 
      SET id_matiere = $2, id_prof = $3, heure_fin = $6, salle = $7
    `, [id_classe, id_matiere, id_prof, jour, heure_debut, heure_fin, salle || null]);

    res.json({ ok: true, message: "✅ Séance enregistrée !" });
  } catch (e) {
    console.error("❌ ERREUR AJOUT EDT :", e.code, "|", e.message);
    if (e.code === '23505') {
      return res.json({ ok: false, erreur: "⚠️ Une séance existe déjà à cet horaire pour cette classe" });
    }
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 TOUT L'EMPLOI DU TEMPS — ADMIN
// ==================================================
router.get('/tout', verifadmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        e.id_emploi,
        e.jour,
        e.heure_debut,
        e.heure_fin,
        e.salle,
        c.libelle_classe,
        m.libelle_matiere,
        CONCAT(u.nom, ' ', u.prenoms) AS prof
      FROM emploi_temps e
      JOIN classes c ON e.id_classe = c.id_classe
      JOIN matieres m ON e.id_matiere = m.id_matiere
      JOIN utilisateurs u ON e.id_prof = u.id_utilisateur
      ORDER BY 
        CASE e.jour 
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 
        END, 
        e.heure_debut
    `);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT EDT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🧑‍🏫 EMPLOI DU TEMPS DU PROF — CORRIGÉ SANS TOKEN EXPIRÉ
// ==================================================
router.get('/prof', async (req, res) => {
  try {
    // ✅ Récupère l'ID depuis l'en-tête au lieu du token qui expire
    const id_prof = parseInt(req.headers['x-id-utilisateur']);
    console.log("📋 Chargement EDT pour id_prof =", id_prof);

    if (!id_prof || isNaN(id_prof)) {
      return res.json({ ok: false, erreur: "⛔ ID utilisateur manquant — Reconnectez-vous" });
    }

    const r = await pool.query(`
      SELECT 
        e.id_emploi,
        e.jour,
        e.heure_debut,
        e.heure_fin,
        e.salle,
        COALESCE(c.libelle_classe, 'Classe #' || e.id_classe) AS libelle_classe,
        COALESCE(m.libelle_matiere, 'Matière #' || e.id_matiere) AS libelle_matiere
      FROM emploi_temps e
      LEFT JOIN classes c ON e.id_classe = c.id_classe
      LEFT JOIN matieres m ON e.id_matiere = m.id_matiere
      WHERE e.id_prof = $1
      ORDER BY 
        CASE e.jour
          WHEN 'Lundi' THEN 1
          WHEN 'Mardi' THEN 2
          WHEN 'Mercredi' THEN 3
          WHEN 'Jeudi' THEN 4
          WHEN 'Vendredi' THEN 5
          WHEN 'Samedi' THEN 6
          ELSE 7
        END,
        e.heure_debut
    `, [id_prof]);

    console.log("✅ Séances trouvées :", r.rows.length, r.rows);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR EDT PROF :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📅 EMPLOI DU TEMPS PAR CLASSE — ÉLÈVE / PARENT
// ==================================================
router.get('/classe/:id_classe', async (req, res) => {
  try {
    let { id_classe } = req.params;
    id_classe = parseInt(id_classe);
    
    if (isNaN(id_classe)) {
      return res.json({ ok: false, erreur: "⛔ Identifiant de classe invalide" });
    }

    console.log("📋 EDT demandé pour la classe :", id_classe);

    const r = await pool.query(`
      SELECT e.id_emploi, e.jour, e.heure_debut, e.heure_fin, e.salle,
             c.libelle_classe,
             m.libelle_matiere,
             CONCAT(u.nom, ' ', u.prenoms) AS nom_prof
      FROM emploi_temps e
      JOIN classes c ON e.id_classe = c.id_classe
      JOIN matieres m ON e.id_matiere = m.id_matiere
      JOIN utilisateurs u ON e.id_prof = u.id_utilisateur
      WHERE e.id_classe = $1
      ORDER BY 
        CASE e.jour 
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 
          ELSE 7 END, 
        e.heure_debut
    `, [id_classe]);

    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.log("❌ ERREUR EDT CLASSE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER UNE SÉANCE (ADMIN SEUL)
// ==================================================
router.delete('/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⛔ Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM emploi_temps WHERE id_emploi = $1 RETURNING id_emploi', 
      [id]
    );
    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "⚠️ Séance introuvable" });
    }
    res.json({ ok: true, message: "✅ Séance supprimée !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION EDT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});
// ==================================================
// 📊 EMPLOI DU TEMPS GLOBAL — TOUTES CLASSES
// ==================================================
router.get('/global', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        c.jour,
        c.heure_debut,
        c.heure_fin,
        cl.libelle_classe,
        m.libelle_matiere,
        CONCAT(u.nom, ' ', u.prenoms) AS professeur
      FROM emploi_temps c
      JOIN classes cl ON c.id_classe = cl.id_classe
      JOIN matieres m ON c.id_matiere = m.id_matiere
      JOIN utilisateurs u ON c.id_prof = u.id_utilisateur
      ORDER BY
        CASE c.jour
          WHEN 'Lundi' THEN 1
          WHEN 'Mardi' THEN 2
          WHEN 'Mercredi' THEN 3
          WHEN 'Jeudi' THEN 4
          WHEN 'Vendredi' THEN 5
          WHEN 'Samedi' THEN 6
          ELSE 7
        END,
        c.heure_debut,
        cl.libelle_classe
    `);

    res.json({ ok: true, seances: r.rows });
  } catch (e) {
    console.error("❌ ERREUR EMPLOI GLOBAL :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;