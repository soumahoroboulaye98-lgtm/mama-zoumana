const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==================================================
// 🔐 MIDDLEWARES DE PROTECTION
// ==================================================
let veriftoken, verifadmin, protegerTous, protegerAdmin;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  protegerTous = [veriftoken];
  protegerAdmin = [veriftoken, verifadmin];
} catch {
  protegerTous = [];
  protegerAdmin = [];
}

// 🧠 Fonction interne : Ajouter Mention & Appréciation
function ajouterMentions(liste) {
  return liste.map(ligne => {
    const moy = parseFloat(ligne.moyenne);
    let mention = "—", appreciation = "Aucune note", couleur = "light";
    if (ligne.nb_matiere > 0) {
      if (moy >= 16)        { mention = "Très Bien 🎖️"; appreciation = "Excellent !"; couleur = "success"; }
      else if (moy >= 14)   { mention = "Bien 🎉"; appreciation = "Très bon niveau."; couleur = "primary"; }
      else if (moy >= 12)   { mention = "Assez Bien ✅"; appreciation = "Bon travail."; couleur = "info"; }
      else if (moy >= 10)   { mention = "Passable"; appreciation = "Convenable."; couleur = "warning"; }
      else                    { mention = "Insuffisant ⚠️"; appreciation = "Efforts nécessaires."; couleur = "danger"; }
    }
    return { ...ligne, mention, appreciation, couleur };
  });
}

// ==================================================
// 📊 CLASSEMENT ÉLÈVES PAR CLASSE
// ==================================================
router.get('/classement/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant de classe invalide" });

    const { rows: eleves } = await pool.query(`
      SELECT u.id_utilisateur AS id, u.matricule, u.nom, u.prenoms AS prenom, u.email, u.telephone
      FROM utilisateurs u
      WHERE u.role = 'eleve' AND u.id_classe = $1 AND u.statut_compte = 'valide'
      ORDER BY u.nom ASC, u.prenoms ASC
    `, [id_classe]);

    const { rows: [classe] } = await pool.query(
      `SELECT libelle_classe, cycle FROM classes WHERE id_classe = $1`, [id_classe]
    );

    console.log(`✅ Classement Classe ${classe?.libelle_classe || id_classe} — ${eleves.length} élève(s)`);
    return res.json({ ok: true, classe: classe || null, effectif: eleves.length, classement: eleves });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger le classement" });
  }
});

// ==================================================
// 📋 EMPLOI DU TEMPS PAR CLASSE — COMPATIBLE TABLE "emploi"
// ==================================================
router.get('/emploi-temps/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant de classe invalide" });

    // ✅ Utilise la TABLE "emploi" (existante dans ta base)
    const { rows: emploi } = await pool.query(`
      SELECT e.id_emploi, e.jour, e.heure_debut, e.heure_fin, 
             e.matiere, c.libelle_classe,
             CONCAT(u.nom, ' ', u.prenoms) AS professeur
      FROM emploi e
      JOIN classes c ON e.id_classe = c.id_classe
      LEFT JOIN utilisateurs u ON e.id_prof = u.id_utilisateur
      WHERE e.id_classe = $1
      ORDER BY 
        CASE e.jour 
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3
          WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 ELSE 7 END,
        e.heure_debut ASC
    `, [id_classe]);

    const { rows: [classe] } = await pool.query(
      `SELECT libelle_classe, cycle FROM classes WHERE id_classe = $1`, [id_classe]
    );

    console.log(`✅ Emploi du temps Classe ${classe?.libelle_classe || id_classe} — ${emploi.length} cours`);
    return res.json({ ok: true, classe: classe || null, emploi_temps: emploi });
  } catch (e) {
    console.error("❌ ERREUR EMPLOI DU TEMPS :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger l'emploi du temps" });
  }
});

// ==================================================
// 📋 LISTE DES CLASSES
// ==================================================
router.get('/liste-classes', protegerTous, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_classe, libelle_classe, cycle 
      FROM classes 
      ORDER BY 
        CASE cycle 
          WHEN 'maternelle' THEN 1 WHEN 'primaire' THEN 2 
          WHEN 'college' THEN 3 WHEN 'lycee' THEN 4 ELSE 5 
        END,
        libelle_classe ASC
    `);
    console.log(`✅ Liste des classes chargée — ${rows.length} classe(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE CLASSES :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger les classes" });
  }
});

// ==================================================
// ➕ AJOUTER UN COURS — Admin
// ==================================================
router.post('/cours/ajouter', protegerAdmin, async (req, res) => {
  try {
    const { id_classe, id_prof, jour, heure_debut, heure_fin, matiere } = req.body;
    if (!id_classe || !id_prof || !jour?.trim() || !heure_debut?.trim() || !heure_fin?.trim() || !matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Tous les champs sont obligatoires" });

    const { rows: [{ id_emploi }] } = await pool.query(`
      INSERT INTO emploi(id_classe, id_prof, jour, heure_debut, heure_fin, matiere)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id_emploi
    `, [id_classe, id_prof, jour.trim(), heure_debut.trim(), heure_fin.trim(), matiere.trim()]);

    console.log(`✅ Cours ajouté — ID: ${id_emploi}`);
    return res.json({ ok: true, message: "✅ Cours ajouté avec succès", id_emploi });
  } catch (e) {
    console.error("❌ ERREUR AJOUT COURS :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Classe ou Professeur introuvable" });
    return res.json({ ok: false, erreur: "⚠️ Impossible d'ajouter le cours" });
  }
});

// ==================================================
// ✏️ MODIFIER UN COURS — Admin
// ==================================================
router.put('/cours/modifier/:id', protegerAdmin, async (req, res) => {
  try {
    const id_emploi = parseInt(req.params.id);
    if (isNaN(id_emploi))
      return res.json({ ok: false, erreur: "⚠️ Identifiant du cours invalide" });

    const { id_classe, id_prof, jour, heure_debut, heure_fin, matiere } = req.body;
    if (!id_classe || !id_prof || !jour?.trim() || !heure_debut?.trim() || !heure_fin?.trim() || !matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Tous les champs sont obligatoires" });

    const { rowCount } = await pool.query(`
      UPDATE emploi 
      SET id_classe = $1, id_prof = $2, jour = $3, heure_debut = $4, heure_fin = $5, matiere = $6
      WHERE id_emploi = $7
    `, [id_classe, id_prof, jour.trim(), heure_debut.trim(), heure_fin.trim(), matiere.trim(), id_emploi]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Cours introuvable" });

    console.log(`✅ Cours modifié — ID: ${id_emploi}`);
    return res.json({ ok: true, message: "✅ Cours modifié avec succès" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION COURS :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Classe ou Professeur introuvable" });
    return res.json({ ok: false, erreur: "⚠️ Impossible de modifier le cours" });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UN COURS — Admin
// ==================================================
router.delete('/cours/supprimer/:id', protegerAdmin, async (req, res) => {
  try {
    const id_emploi = parseInt(req.params.id);
    if (isNaN(id_emploi))
      return res.json({ ok: false, erreur: "⚠️ Identifiant du cours invalide" });

    const { rowCount } = await pool.query(
      'DELETE FROM emploi WHERE id_emploi = $1', [id_emploi]
    );

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Cours introuvable" });

    console.log(`🗑️ Cours supprimé — ID: ${id_emploi}`);
    return res.json({ ok: true, message: "✅ Cours supprimé avec succès" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION COURS :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de supprimer le cours" });
  }
});

// ==================================================
// 📋 LISTE DES PROFESSEURS (formulaires)
// ==================================================
router.get('/liste-professeurs', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_utilisateur AS id, nom, prenoms AS prenom 
      FROM utilisateurs 
      WHERE role = 'prof' AND statut_compte = 'valide' 
      ORDER BY nom ASC, prenoms ASC
    `);
    console.log(`✅ Liste des professeurs chargée — ${rows.length} enregistrement(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE PROFESSEURS :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger les professeurs" });
  }
});

// ==================================================
// 📊 CLASSEMENT GÉNÉRAL — Toutes Classes
// ==================================================
router.get('/classement-general', protegerTous, async (req, res) => {
  try {
    const { rows: classement } = await pool.query(`
      SELECT u.id_utilisateur AS id, u.matricule, u.nom, u.prenoms AS prenom, u.email, u.telephone,
             c.id_classe, c.libelle_classe, c.cycle
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve' AND u.statut_compte = 'valide'
      ORDER BY 
        CASE c.cycle 
          WHEN 'maternelle' THEN 1 WHEN 'primaire' THEN 2 
          WHEN 'college' THEN 3 WHEN 'lycee' THEN 4 ELSE 5 
        END,
        c.libelle_classe ASC NULLS LAST, u.nom ASC, u.prenoms ASC
    `);

    const { rows: [{ count }] } = await pool.query(`
      SELECT COUNT(*)::int 
      FROM utilisateurs 
      WHERE role = 'eleve' AND statut_compte = 'valide'
    `);

    console.log(`✅ Classement général — ${count} élève(s)`);
    return res.json({ ok: true, total_eleves: count, classement });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT GÉNÉRAL :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger le classement général" });
  }
});

// ==================================================
// 📊 CLASSEMENT PAR NOTES — Par Classe
// ==================================================
router.get('/classement-notes/classe/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant de classe invalide" });

    const { rows: eleves } = await pool.query(`
      SELECT u.id_utilisateur AS id, u.matricule, u.nom, u.prenoms AS prenom,
             ROUND(AVG(n.note), 2) AS moyenne, COUNT(n.id_note)::int AS nb_matiere
      FROM utilisateurs u
      LEFT JOIN notes n ON u.id_utilisateur = n.id_eleve
      WHERE u.role = 'eleve' AND u.id_classe = $1 AND u.statut_compte = 'valide'
      GROUP BY u.id_utilisateur, u.matricule, u.nom, u.prenoms
      ORDER BY moyenne DESC NULLS LAST
    `, [id_classe]);

    const { rows: [classe] } = await pool.query(
      `SELECT libelle_classe, cycle FROM classes WHERE id_classe = $1`, [id_classe]
    );

    console.log(`✅ Classement par notes — Classe ${classe?.libelle_classe || id_classe}`);
    return res.json({ 
      ok: true, 
      classe: classe || null, 
      effectif: eleves.length,
      classement: ajouterMentions(eleves) 
    });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT PAR NOTES :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger le classement" });
  }
});

// ==================================================
// 📊 CLASSEMENT PAR NOTES — Général
// ==================================================
router.get('/classement-notes/general', protegerTous, async (req, res) => {
  try {
    const { rows: eleves } = await pool.query(`
      SELECT u.id_utilisateur AS id, u.matricule, u.nom, u.prenoms AS prenom, 
             c.libelle_classe, c.cycle,
             ROUND(AVG(n.note), 2) AS moyenne, COUNT(n.id_note)::int AS nb_matiere
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      LEFT JOIN notes n ON u.id_utilisateur = n.id_eleve
      WHERE u.role = 'eleve' AND u.statut_compte = 'valide'
      GROUP BY u.id_utilisateur, u.matricule, u.nom, u.prenoms, c.libelle_classe, c.cycle
      ORDER BY moyenne DESC NULLS LAST
    `);

    console.log(`✅ Classement général par notes — ${eleves.length} élève(s)`);
    return res.json({ 
      ok: true, 
      total_eleves: eleves.length, 
      classement: ajouterMentions(eleves) 
    });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT NOTES GÉNÉRAL :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger le classement général" });
  }
});

module.exports = router;