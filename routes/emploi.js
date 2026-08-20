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
// ➕ AJOUTER / MODIFIER UNE SÉANCE
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.post('/ajouter', protegerAdmin, async (req, res) => {
  try {
    const { id_classe, id_matiere, id_prof, jour, heure_debut, heure_fin, salle } = req.body;

    if (!id_classe || !id_matiere || !id_prof || !jour || !heure_debut || !heure_fin) {
      return res.json({
        ok: false,
        erreur: "⚠️ Champs obligatoires : Classe, Matière, Professeur, Jour, Heure de début et Heure de fin"
      });
    }

    // Vérifications d'intégrité
    const classeExiste = await pool.query('SELECT 1 FROM classes WHERE id_classe = $1', [id_classe]);
    if (classeExiste.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Cette classe n'existe pas" });
    }

    const matiereExiste = await pool.query('SELECT 1 FROM matieres WHERE id_matiere = $1', [id_matiere]);
    if (matiereExiste.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Cette matière n'existe pas" });
    }

    const profExiste = await pool.query(
      'SELECT 1 FROM utilisateurs WHERE id_utilisateur = $1 AND role = $2',
      [id_prof, 'prof']
    );
    if (profExiste.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Ce professeur n'existe pas" });
    }

    // Insertion ou mise à jour si conflit sur (classe, jour, heure)
    await pool.query(`
      INSERT INTO emploi_temps(id_classe, id_matiere, id_prof, jour, heure_debut, heure_fin, salle)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id_classe, jour, heure_debut) DO UPDATE 
      SET id_matiere = $2, id_prof = $3, heure_fin = $6, salle = $7
    `, [id_classe, id_matiere, id_prof, jour, heure_debut, heure_fin, salle || null]);

    console.log(`✅ Séance enregistrée — ${jour} ${heure_debut}, Classe ${id_classe}`);
    res.json({ ok: true, message: "✅ Séance enregistrée avec succès !" });

  } catch (e) {
    console.error("❌ ERREUR AJOUT/MODIFICATION SÉANCE :", e.code, "|", e.message);
    if (e.code === '23505') {
      return res.json({ ok: false, erreur: "⚠️ Une séance existe déjà à cet horaire pour cette classe" });
    }
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 EMPLOI DU TEMPS COMPLET (TOUTES CLASSES)
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.get('/tout', protegerAdmin, async (req, res) => {
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
        CONCAT(u.nom, ' ', u.prenoms) AS professeur
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

    console.log(`✅ EDT complet chargé — ${r.rows.length} séance(s)`);
    res.json({ ok: true, lignes: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT EDT COMPLET :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🧑‍🏫 EMPLOI DU TEMPS DU PROFESSEUR
// ✅ Accessible : Professeur (via token ou en-tête)
// ==================================================
router.get('/prof', protegerProf, async (req, res) => {
  try {
    // Priorité : token décodé → sinon en-tête x-id-utilisateur
    const id_prof = req.user?.id_utilisateur
      ? parseInt(req.user.id_utilisateur)
      : parseInt(req.headers['x-id-utilisateur']);

    console.log("📋 Chargement EDT pour id_prof =", id_prof);

    if (!id_prof || isNaN(id_prof)) {
      return res.json({ ok: false, erreur: "⛔ Identifiant utilisateur manquant — Reconnectez-vous" });
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
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 
          ELSE 7
        END,
        e.heure_debut
    `, [id_prof]);

    console.log(`✅ EDT prof chargé — ${r.rows.length} séance(s)`);
    res.json({ ok: true, lignes: r.rows });

  } catch (e) {
    console.error("❌ ERREUR EDT PROFESSEUR :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📅 EMPLOI DU TEMPS PAR CLASSE
// 🌐 Publique (consultable par élève / parent / visiteur)
// ==================================================
router.get('/classe/:id_classe', async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);

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
          ELSE 7 
        END, 
        e.heure_debut
    `, [id_classe]);

    console.log(`✅ EDT classe ${id_classe} chargé — ${r.rows.length} séance(s)`);
    res.json({ ok: true, lignes: r.rows });

  } catch (e) {
    console.error("❌ ERREUR EDT PAR CLASSE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UNE SÉANCE
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
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

    console.log(`🗑️ Séance supprimée — ID: ${id}`);
    res.json({ ok: true, message: "✅ Séance supprimée avec succès !" });

  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION SÉANCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📊 EMPLOI DU TEMPS GLOBAL (TOUTES CLASSES SANS FILTRE)
// 🌐 Publique
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
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 
          ELSE 7
        END,
        c.heure_debut,
        cl.libelle_classe
    `);

    console.log(`✅ EDT global chargé — ${r.rows.length} séance(s)`);
    res.json({ ok: true, seances: r.rows });

  } catch (e) {
    console.error("❌ ERREUR EDT GLOBAL :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;