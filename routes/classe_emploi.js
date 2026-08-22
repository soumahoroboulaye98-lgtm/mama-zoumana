const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protections
const protegerTous = [veriftoken];
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📊 CONSULTER — Classement / Liste Élèves par Classe
// ==================================================
router.get('/classement/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const r = await pool.query(`
      SELECT u.id_utilisateur, u.matricule, u.nom, u.prenoms, u.email, u.telephone
      FROM utilisateurs u
      WHERE u.role = 'eleve' AND u.id_classe = $1 AND u.statut_compte = 'valide'
      ORDER BY u.nom ASC, u.prenoms ASC
    `, [id_classe]);

    const classe = await pool.query(`SELECT libelle_classe, niveau FROM classes WHERE id_classe = $1`, [id_classe]);

    res.json({
      ok: true,
      classe: classe.rows[0] || null,
      effectif: r.rows.length,
      classement: r.rows
    });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 CONSULTER — Emploi du Temps par Classe
// ==================================================
router.get('/emploi-temps/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const r = await pool.query(`
      SELECT et.id_emploi, et.jour, et.heure_debut, et.heure_fin, et.matiere,
             u.nom || ' ' || u.prenoms AS professeur, s.libelle_classe
      FROM emploi_temps et
      JOIN utilisateurs u ON et.id_professeur = u.id_utilisateur
      JOIN classes s ON et.id_classe = s.id_classe
      WHERE et.id_classe = $1
      ORDER BY 
        CASE et.jour 
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3
          WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 ELSE 7 END,
        et.heure_debut ASC
    `, [id_classe]);

    const classe = await pool.query(`SELECT libelle_classe, niveau FROM classes WHERE id_classe = $1`, [id_classe]);

    res.json({ ok: true, classe: classe.rows[0] || null, emploi_temps: r.rows });
  } catch (e) {
    console.error("❌ ERREUR EMPLOI :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 LISTE — Toutes Classes
// ==================================================
router.get('/liste-classes', protegerTous, async (req, res) => {
  try {
    const r = await pool.query(`SELECT id_classe, libelle_classe, niveau FROM classes ORDER BY niveau, libelle_classe`);
    res.json({ ok: true, classes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE CLASSES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ⚙️ ADMIN — Ajouter un cours
// ==================================================
router.post('/cours/ajouter', protegerAdmin, async (req, res) => {
  try {
    const { id_classe, id_professeur, jour, heure_debut, heure_fin, matiere } = req.body;

    if (!id_classe || !id_professeur || !jour || !heure_debut || !heure_fin || !matiere) {
      return res.json({ ok: false, erreur: "⚠️ Tous les champs sont obligatoires" });
    }

    const r = await pool.query(`
      INSERT INTO emploi_temps(id_classe, id_professeur, jour, heure_debut, heure_fin, matiere)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id_emploi
    `, [id_classe, id_professeur, jour, heure_debut, heure_fin, matiere]);

    console.log(`✅ Cours ajouté — ${matiere}, ${jour} ${heure_debut}-${heure_fin}`);
    res.json({ ok: true, message: "✅ Cours ajouté avec succès !", id_emploi: r.rows[0].id_emploi });
  } catch (e) {
    console.error("❌ ERREUR AJOUT COURS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ⚙️ ADMIN — Modifier un cours
// ==================================================
router.put('/cours/modifier/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { id_classe, id_professeur, jour, heure_debut, heure_fin, matiere } = req.body;

    await pool.query(`
      UPDATE emploi_temps 
      SET id_classe=$1, id_professeur=$2, jour=$3, heure_debut=$4, heure_fin=$5, matiere=$6
      WHERE id_emploi=$7
    `, [id_classe, id_professeur, jour, heure_debut, heure_fin, matiere, id]);

    console.log(`✅ Cours modifié — ID: ${id}`);
    res.json({ ok: true, message: "✅ Cours modifié avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION COURS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ⚙️ ADMIN — Supprimer un cours
// ==================================================
router.delete('/cours/supprimer/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const r = await pool.query(`DELETE FROM emploi_temps WHERE id_emploi=$1 RETURNING matiere`, [id]);
    if (r.rows.length === 0) return res.json({ ok: false, erreur: "⚠️ Cours introuvable" });

    console.log(`✅ Cours supprimé — ${r.rows[0].matiere}`);
    res.json({ ok: true, message: "✅ Cours supprimé avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION COURS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 LISTE — Professeurs (pour formulaire)
// ==================================================
router.get('/liste-professeurs', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_utilisateur, nom, prenoms 
      FROM utilisateurs 
      WHERE role = 'prof' AND statut_compte = 'valide'
      ORDER BY nom, prenoms
    `);
    res.json({ ok: true, professeurs: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE PROFS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📊 CLASSEMENT GÉNÉRAL — Toutes Classes
// ==================================================
router.get('/classement-general', protegerTous, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        u.id_utilisateur,
        u.matricule,
        u.nom,
        u.prenoms,
        u.email,
        u.telephone,
        c.id_classe,
        c.libelle_classe,
        c.niveau
      FROM utilisateurs u
      JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve' 
        AND u.statut_compte = 'valide'
      ORDER BY 
        c.niveau ASC,
        c.libelle_classe ASC,
        u.nom ASC,
        u.prenoms ASC
    `);

    const total = await pool.query(`
      SELECT COUNT(*) 
      FROM utilisateurs 
      WHERE role = 'eleve' AND statut_compte = 'valide'
    `);

    res.json({
      ok: true,
      total_eleves: parseInt(total.rows[0].count),
      classement: r.rows
    });

  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT GÉNÉRAL :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 📊 CLASSEMENT PAR NOTES — PAR CLASSE (avec Mention)
// ==================================================
router.get('/classement-notes/classe/:id_classe', protegerTous, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const r = await pool.query(`
      SELECT 
        u.id_utilisateur,
        u.matricule,
        u.nom,
        u.prenoms,
        ROUND(AVG(n.note), 2) AS moyenne,
        COUNT(n.id_note) AS nb_matiere
      FROM utilisateurs u
      LEFT JOIN notes n ON u.id_utilisateur = n.id_utilisateur
      WHERE u.role = 'eleve' 
        AND u.id_classe = $1 
        AND u.statut_compte = 'valide'
      GROUP BY u.id_utilisateur, u.matricule, u.nom, u.prenoms
      ORDER BY moyenne DESC NULLS LAST, u.nom ASC
    `, [id_classe]);

    const classe = await pool.query(`SELECT libelle_classe, niveau FROM classes WHERE id_classe = $1`, [id_classe]);
    const resultat = ajouterMentions(r.rows);

    res.json({
      ok: true,
      classe: classe.rows[0] || null,
      effectif: resultat.length,
      classement: resultat
    });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT CLASSE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📊 CLASSEMENT GÉNÉRAL PAR NOTES — TOUTES CLASSES
// ==================================================
router.get('/classement-notes/general', protegerTous, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        u.id_utilisateur,
        u.matricule,
        u.nom,
        u.prenoms,
        c.libelle_classe,
        c.niveau,
        ROUND(AVG(n.note), 2) AS moyenne,
        COUNT(n.id_note) AS nb_matiere
      FROM utilisateurs u
      JOIN classes c ON u.id_classe = c.id_classe
      LEFT JOIN notes n ON u.id_utilisateur = n.id_utilisateur
      WHERE u.role = 'eleve' 
        AND u.statut_compte = 'valide'
      GROUP BY u.id_utilisateur, u.matricule, u.nom, u.prenoms, c.libelle_classe, c.niveau
      ORDER BY moyenne DESC NULLS LAST, c.niveau ASC, u.nom ASC
    `);

    const resultat = ajouterMentions(r.rows);
    res.json({
      ok: true,
      total_eleves: resultat.length,
      classement: resultat
    });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT GENERAL :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🧠 FONCTION INTERNE : Calculer Mention & Appréciation
// ==================================================
function ajouterMentions(liste) {
  return liste.map(ligne => {
    const moy = parseFloat(ligne.moyenne);
    let mention = "Sans note";
    let appreciation = "Pas encore évalué";
    let couleur = "secondary";

    if (!ligne.moyenne || ligne.nb_matiere === 0) {
      mention = "—";
      appreciation = "Aucune note enregistrée";
      couleur = "light";
    } else if (moy >= 16) {
      mention = "Très Bien 🎖️";
      appreciation = "Excellent travail ! Félicitations !";
      couleur = "success";
    } else if (moy >= 14) {
      mention = "Bien 🎉";
      appreciation = "Très bon niveau. Continuez !";
      couleur = "primary";
    } else if (moy >= 12) {
      mention = "Assez Bien ✅";
      appreciation = "Bon travail. Efforts à poursuivre.";
      couleur = "info";
    } else if (moy >= 10) {
      mention = "Passable";
      appreciation = "Convenable. Des progrès sont possibles.";
      couleur = "warning";
    } else {
      mention = "Insuffisant ⚠️";
      appreciation = "Des efforts importants sont nécessaires.";
      couleur = "danger";
    }

    return { ...ligne, mention, appreciation, couleur };
  });
}

module.exports = router;