const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

const protegerTous = [veriftoken];
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📊 CLASSEMENT ÉLÈVES PAR CLASSE
// ==================================================
router.get('/classement/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });

    const r = await pool.query(`
      SELECT u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone
      FROM utilisateurs u
      WHERE u.role = 'eleve' AND u.id_classe = $1 AND u.statut_compte = 'valide'
      ORDER BY u.nom ASC, u.prenom ASC
    `, [id_classe]);

    const classe = await pool.query(`SELECT libelle_classe, cycle FROM classes WHERE id_classe=$1`, [id_classe]);
    res.json({ ok: true, classe: classe.rows[0]||null, effectif: r.rows.length, classement: r.rows });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 EMPLOI DU TEMPS PAR CLASSE — Affiche sur l'accueil
// ==================================================
router.get('/emploi-temps/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });

    const r = await pool.query(`
      SELECT et.id_emploi, et.jour, et.heure_debut, et.heure_fin, et.matiere,
             u.nom || ' ' || u.prenom AS professeur, s.libelle_classe
      FROM emploi_temps et
      JOIN utilisateurs u ON et.id_professeur = u.id
      JOIN classes s ON et.id_classe = s.id_classe
      WHERE et.id_classe = $1
      ORDER BY 
        CASE et.jour 
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3
          WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 ELSE 7 END,
        et.heure_debut ASC
    `, [id_classe]);

    const classe = await pool.query(`SELECT libelle_classe, cycle FROM classes WHERE id_classe=$1`, [id_classe]);
    res.json({ ok: true, classe: classe.rows[0]||null, emploi_temps: r.rows });
  } catch (e) {
    console.error("❌ ERREUR EMPLOI :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 LISTE DES CLASSES
// ==================================================
router.get('/liste-classes', protegerTous, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_classe, libelle_classe, cycle FROM classes ORDER BY 
        CASE cycle WHEN 'maternelle' THEN 1 WHEN 'primaire' THEN 2 
                   WHEN 'college' THEN 3 WHEN 'lycee' THEN 4 ELSE 5 END,
        libelle_classe ASC
    `);
    res.json({ ok: true, classes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE CLASSES :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UN COURS — Admin
// ==================================================
router.post('/cours/ajouter', protegerAdmin, async (req, res) => {
  try {
    const { id_classe, id_professeur, jour, heure_debut, heure_fin, matiere } = req.body;
    if (!id_classe || !id_professeur || !jour || !heure_debut || !heure_fin || !matiere) {
      return res.json({ ok: false, erreur: "⚠️ Tous les champs obligatoires" });
    }

    const r = await pool.query(`
      INSERT INTO emploi_temps(id_classe, id_professeur, jour, heure_debut, heure_fin, matiere)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_emploi
    `, [id_classe, id_professeur, jour, heure_debut, heure_fin, matiere]);

    res.json({ ok: true, message: "✅ Cours ajouté !", id_emploi: r.rows[0].id_emploi });
  } catch (e) {
    console.error("❌ ERREUR AJOUT COURS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UN COURS — Admin
// ==================================================
router.put('/cours/modifier/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });
    const { id_classe, id_professeur, jour, heure_debut, heure_fin, matiere } = req.body;

    await pool.query(`
      UPDATE emploi_temps 
      SET id_classe=$1, id_professeur=$2, jour=$3, heure_debut=$4, heure_fin=$5, matiere=$6
      WHERE id_emploi=$7
    `, [id_classe, id_professeur, jour, heure_debut, heure_fin, matiere, id]);

    res.json({ ok: true, message: "✅ Cours modifié !" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION COURS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UN COURS — Admin
// ==================================================
router.delete('/cours/supprimer/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });

    const r = await pool.query(`DELETE FROM emploi_temps WHERE id_emploi=$1 RETURNING matiere`, [id]);
    if (r.rows.length === 0) return res.json({ ok: false, erreur: "⚠️ Cours introuvable" });
    res.json({ ok: true, message: "✅ Cours supprimé !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION COURS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 LISTE DES PROFESSEURS (pour formulaire)
// ==================================================
router.get('/liste-professeurs', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom, prenom FROM utilisateurs 
      WHERE role = 'prof' AND statut_compte = 'valide' ORDER BY nom, prenom
    `);
    res.json({ ok: true, professeurs: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE PROFS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📊 CLASSEMENT GÉNÉRAL — Toutes Classes
// ==================================================
router.get('/classement-general', protegerTous, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
             c.id_classe, c.libelle_classe, c.cycle
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve' AND u.statut_compte = 'valide'
      ORDER BY 
        CASE c.cycle WHEN 'maternelle' THEN 1 WHEN 'primaire' THEN 2 
                     WHEN 'college' THEN 3 WHEN 'lycee' THEN 4 ELSE 5 END,
        c.libelle_classe ASC NULLS LAST, u.nom ASC, u.prenom ASC
    `);
    const total = await pool.query(`SELECT COUNT(*)::int FROM utilisateurs WHERE role='eleve' AND statut_compte='valide'`);
    res.json({ ok: true, total_eleves: total.rows[0].count, classement: r.rows });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT GÉNÉRAL :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📊 CLASSEMENT PAR NOTES — Par Classe
// ==================================================
router.get('/classement-notes/classe/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });

    const r = await pool.query(`
      SELECT u.id, u.matricule, u.nom, u.prenom,
             ROUND(AVG(n.note), 2) AS moyenne, COUNT(n.id_note)::int AS nb_matiere
      FROM utilisateurs u
      LEFT JOIN notes n ON u.id = n.id_eleve
      WHERE u.role = 'eleve' AND u.id_classe = $1 AND u.statut_compte = 'valide'
      GROUP BY u.id, u.matricule, u.nom, u.prenom
      ORDER BY moyenne DESC NULLS LAST
    `, [id_classe]);

    const classe = await pool.query(`SELECT libelle_classe, cycle FROM classes WHERE id_classe=$1`, [id_classe]);
    res.json({ ok: true, classe: classe.rows[0]||null, effectif: r.rows.length,
               classement: ajouterMentions(r.rows) });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT NOTES :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📊 CLASSEMENT PAR NOTES — Toutes Classes
// ==================================================
router.get('/classement-notes/general', protegerTous, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.matricule, u.nom, u.prenom, c.libelle_classe, c.cycle,
             ROUND(AVG(n.note), 2) AS moyenne, COUNT(n.id_note)::int AS nb_matiere
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      LEFT JOIN notes n ON u.id = n.id_eleve
      WHERE u.role = 'eleve' AND u.statut_compte = 'valide'
      GROUP BY u.id, u.matricule, u.nom, u.prenom, c.libelle_classe, c.cycle
      ORDER BY moyenne DESC NULLS LAST
    `);
    res.json({ ok: true, total_eleves: r.rows.length, classement: ajouterMentions(r.rows) });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT NOTES GÉNÉRAL :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// 🧠 Fonction interne : Ajouter Mention & Appréciation
function ajouterMentions(liste) {
  return liste.map(ligne => {
    const moy = parseFloat(ligne.moyenne);
    let mention = "—", appreciation = "Aucune note", couleur = "light";
    if (ligne.nb_matiere > 0) {
      if (moy >= 16) { mention="Très Bien 🎖️"; appreciation="Excellent !"; couleur="success"; }
      else if (moy >= 14) { mention="Bien 🎉"; appreciation="Très bon niveau."; couleur="primary"; }
      else if (moy >= 12) { mention="Assez Bien ✅"; appreciation="Bon travail."; couleur="info"; }
      else if (moy >= 10) { mention="Passable"; appreciation="Convenable."; couleur="warning"; }
      else { mention="Insuffisant ⚠️"; appreciation="Efforts nécessaires."; couleur="danger"; }
    }
    return { ...ligne, mention, appreciation, couleur };
  });
}

module.exports = router;