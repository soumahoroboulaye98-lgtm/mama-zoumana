const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');     // ✅ Ajouté systématiquement
const verifdirecteur = require('../middleware/verifdirecteur'); // ✅ Middleware spécifique Directeur

// ✅ Protection groupée uniforme : token + vérification du rôle Directeur
const protegerDirecteur = [veriftoken, verifdirecteur];


// ==================================================
// 📊 STATISTIQUES GLOBALES
// 🔒 Réservé : Directeur authentifié
// ==================================================
router.get('/statistiques', protegerDirecteur, async (req, res) => {
  try {
    const [eleves] = await pool.query(`SELECT COUNT(*) FROM utilisateurs WHERE role = 'eleve'`);
    const [profs] = await pool.query(`SELECT COUNT(*) FROM utilisateurs WHERE role = 'prof'`);
    const [classes] = await pool.query(`SELECT COUNT(*) FROM classes`);
    const [attente] = await pool.query(`SELECT COUNT(*) FROM inscriptions WHERE statut = 'en_attente'`);

    // Informations du directeur connecté
    const directeur = await pool.query(`
      SELECT prenoms, nom FROM utilisateurs WHERE id_utilisateur = $1
    `, [req.user.id]);

    console.log("✅ Statistiques globales consultées");
    res.json({
      ok: true,
      eleves: parseInt(eleves.rows[0].count),
      profs: parseInt(profs.rows[0].count),
      classes: parseInt(classes.rows[0].count),
      attente: parseInt(attente.rows[0].count),
      directeur: directeur.rows[0]
    });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT STATISTIQUES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 INSCRIPTIONS EN ATTENTE
// 🔒 Réservé : Directeur authentifié
// ==================================================
router.get('/inscriptions-attente', protegerDirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT i.*, u.nom, u.prenom, c.libelle_classe
      FROM inscriptions i
      JOIN utilisateurs u ON i.id_eleve = u.id
      LEFT JOIN classes c ON i.id_classe = c.id_classe
      WHERE i.statut = 'en_attente'
      ORDER BY i.date_inscription DESC
    `);

    console.log(`✅ Inscriptions en attente consultées — ${r.rows.length} enregistrement(s)`);
    res.json({ ok: true, inscriptions: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT INSCRIPTIONS ATTENTE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✅ VALIDER UNE INSCRIPTION
// 🔒 Réservé : Directeur authentifié
// ==================================================
router.patch('/valider-inscription/:id', protegerDirecteur, async (req, res) => {
  try {
    const idInscription = parseInt(req.params.id);
    if (isNaN(idInscription)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const r = await pool.query(`
      UPDATE inscriptions 
      SET statut = 'validee', date_validation = NOW(), valide_par = $1
      WHERE id_inscription = $2 AND statut = 'en_attente'
      RETURNING *
    `, [req.user.id, idInscription]);

    if (!r.rows.length) {
      return res.json({ ok: false, erreur: "⚠️ Inscription introuvable ou déjà traitée" });
    }

    console.log(`✅ Inscription validée — ID: ${idInscription}`);
    res.json({ ok: true });

  } catch (e) {
    console.error("❌ ERREUR VALIDATION INSCRIPTION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ REFUSER UNE INSCRIPTION
// 🔒 Réservé : Directeur authentifié
// ==================================================
router.patch('/refuser-inscription/:id', protegerDirecteur, async (req, res) => {
  try {
    const idInscription = parseInt(req.params.id);
    if (isNaN(idInscription)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const r = await pool.query(`
      UPDATE inscriptions 
      SET statut = 'refusee', date_validation = NOW(), valide_par = $1
      WHERE id_inscription = $2 AND statut = 'en_attente'
      RETURNING *
    `, [req.user.id, idInscription]);

    if (!r.rows.length) {
      return res.json({ ok: false, erreur: "⚠️ Inscription introuvable ou déjà traitée" });
    }

    console.log(`❌ Inscription refusée — ID: ${idInscription}`);
    res.json({ ok: true });

  } catch (e) {
    console.error("❌ ERREUR REFUS INSCRIPTION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📄 CONSULTER BULLETINS PAR CLASSE
// 🔒 Réservé : Directeur authentifié
// ==================================================
router.get('/bulletins', protegerDirecteur, async (req, res) => {
  try {
    const id_classe = req.query.classe;
    const trimestre = req.query.trimestre || '1';

    if (!id_classe) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant de classe requis" });
    }

    const bulletins = await pool.query(`
      SELECT n.id_eleve, u.nom, u.prenom,
             AVG(n.moyenne) AS moyenne_generale,
             COUNT(DISTINCT n.id_matiere) AS nb_matieres
      FROM notes n
      JOIN utilisateurs u ON n.id_eleve = u.id
      WHERE n.id_classe = $1 AND n.trimestre = $2
      GROUP BY n.id_eleve, u.nom, u.prenom
      ORDER BY moyenne_generale DESC
    `, [id_classe, trimestre]);

    console.log(`✅ Bulletins consultés — Classe: ${id_classe}, Trimestre: ${trimestre}, ${bulletins.rows.length} élève(s)`);
    res.json({ ok: true, bulletins: bulletins.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT BULLETINS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 💰 SYNTHÈSE DES PAIEMENTS
// 🔒 Réservé : Directeur authentifié
// ==================================================
router.get('/paiements-synthese', protegerDirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COALESCE(SUM(montant_total), 0) AS totale,
        COALESCE(SUM(montant_paye), 0) AS paye,
        COALESCE(SUM(montant_total - montant_paye), 0) AS restant
      FROM paiements
    `);

    console.log("✅ Synthèse des paiements consultée");
    res.json({ ok: true, ...r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR SYNTHÈSE PAIEMENTS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📢 TOUTES LES ANNONCES
// 🔒 Réservé : Directeur authentifié
// ==================================================
router.get('/annonces', protegerDirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM annonces ORDER BY date_publication DESC LIMIT 20
    `);

    console.log(`✅ Liste des annonces consultée — ${r.rows.length} enregistrement(s)`);
    res.json({ ok: true, annonces: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT ANNONCES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📅 TOUS LES ÉVÉNEMENTS
// 🔒 Réservé : Directeur authentifié
// ==================================================
router.get('/evenements', protegerDirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM evenements ORDER BY date_evenement ASC LIMIT 15
    `);

    console.log(`✅ Liste des événements consultée — ${r.rows.length} enregistrement(s)`);
    res.json({ ok: true, evenements: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT ÉVÉNEMENTS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;