const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifdirecteur = require('../middleware/verifdirecteur');

// ✅ Protection groupée uniforme
const protegerDirecteur = [veriftoken, verifdirecteur];


// ==================================================
// 📊 STATISTIQUES GLOBALES
// ==================================================
router.get('/statistiques', protegerDirecteur, async (req, res) => {
  try {
    const [eleves] = await pool.query(`SELECT COUNT(*) FROM utilisateurs WHERE role = 'eleve'`);
    const [profs] = await pool.query(`SELECT COUNT(*) FROM utilisateurs WHERE role = 'prof'`);
    const [classes] = await pool.query(`SELECT COUNT(*) FROM classes`);
    const [attente] = await pool.query(`SELECT COUNT(*) FROM inscriptions WHERE statut = 'en_attente'`);
    const [employes] = await pool.query(`SELECT COUNT(*) FROM utilisateurs WHERE role IN ('admin','comptable','secretaire','prof')`);

    const directeur = await pool.query(`
      SELECT nom, prenoms FROM utilisateurs WHERE id = $1
    `, [req.user.id]);

    console.log("✅ Statistiques consultées");
    res.json({
      ok: true,
      eleves: parseInt(eleves.rows[0].count),
      profs: parseInt(profs.rows[0].count),
      employes: parseInt(employes.rows[0].count),
      classes: parseInt(classes.rows[0].count),
      attente: parseInt(attente.rows[0].count),
      directeur: directeur.rows[0]
    });

  } catch (e) {
    console.error("❌ ERREUR STATISTIQUES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 INSCRIPTIONS EN ATTENTE
// ==================================================
router.get('/inscriptions-attente', protegerDirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT i.*, u.nom, u.prenoms, c.libelle_classe
      FROM inscriptions i
      JOIN utilisateurs u ON i.id_eleve = u.id
      LEFT JOIN classes c ON i.id_classe = c.id_classe
      WHERE i.statut = 'en_attente' ORDER BY i.date_inscription DESC
    `);
    console.log(`✅ Inscriptions attente : ${r.rows.length}`);
    res.json({ ok: true, inscriptions: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE INSCRIPTIONS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✅ VALIDER UNE INSCRIPTION
// ==================================================
router.patch('/valider-inscription/:id', protegerDirecteur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });

    const r = await pool.query(`
      UPDATE inscriptions SET statut='validee', date_validation=NOW(), valide_par=$1
      WHERE id_inscription=$2 AND statut='en_attente' RETURNING *
    `, [req.user.id, id]);

    if (!r.rows.length) return res.json({ ok: false, erreur: "⚠️ Introuvable ou déjà traitée" });
    console.log(`✅ Inscription validée — ID: ${id}`);
    res.json({ ok: true, message: "✅ Inscription validée !" });

  } catch (e) {
    console.error("❌ ERREUR VALIDATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ REFUSER UNE INSCRIPTION
// ==================================================
router.patch('/refuser-inscription/:id', protegerDirecteur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });

    const r = await pool.query(`
      UPDATE inscriptions SET statut='refusee', date_validation=NOW(), valide_par=$1
      WHERE id_inscription=$2 AND statut='en_attente' RETURNING *
    `, [req.user.id, id]);

    if (!r.rows.length) return res.json({ ok: false, erreur: "⚠️ Introuvable ou déjà traitée" });
    console.log(`❌ Inscription refusée — ID: ${id}`);
    res.json({ ok: true, message: "✅ Inscription refusée" });

  } catch (e) {
    console.error("❌ ERREUR REFUS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📄 BULLETINS PAR CLASSE + MOYENNE + RANG
// ==================================================
router.get('/bulletins', protegerDirecteur, async (req, res) => {
  try {
    const id_classe = req.query.classe;
    const trimestre = req.query.trimestre || '1';
    if (!id_classe) return res.json({ ok: false, erreur: "⚠️ Classe requise" });

    const bulletins = await pool.query(`
      SELECT n.id_eleve, u.nom, u.prenoms, u.matricule,
             AVG(n.moyenne) AS moyenne_generale,
             COUNT(DISTINCT n.id_matiere) AS nb_matieres
      FROM notes n
      JOIN utilisateurs u ON n.id_eleve = u.id
      WHERE n.id_classe = $1 AND n.trimestre = $2
      GROUP BY n.id_eleve, u.nom, u.prenoms, u.matricule
      ORDER BY moyenne_generale DESC
    `, [id_classe, trimestre]);

    // ✅ Calcul rang et mention
    const classes = bulletins.rows.map((el, idx) => {
      const rang = idx + 1;
      const moy = parseFloat(el.moyenne_generale);
      let mention = '';
      if (moy >= 18) mention = '🏆 EXCELLENT';
      else if (moy >= 16) mention = '⭐ TRÈS BIEN';
      else if (moy >= 14) mention = '✅ BIEN';
      else if (moy >= 12) mention = '📝 ASSEZ BIEN';
      else if (moy >= 10) mention = '🟡 PASSABLE';
      else mention = '🔴 INSUFFISANT';
      return { ...el, rang, mention };
    });

    console.log(`✅ Bulletins — Classe: ${id_classe}, Trimestre: ${trimestre}, ${classes.length} élève(s)`);
    res.json({ ok: true, bulletins: classes });

  } catch (e) {
    console.error("❌ ERREUR BULLETINS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 💰 SYNTHÈSE PAIEMENTS
// ==================================================
router.get('/paiements-synthese', protegerDirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COALESCE(SUM(montant_total),0) AS totale,
        COALESCE(SUM(montant_paye),0) AS paye,
        COALESCE(SUM(montant_total - montant_paye),0) AS restant
      FROM paiements
    `);
    console.log("✅ Synthèse paiements consultée");
    res.json({ ok: true, ...r.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR SYNTHÈSE PAIEMENTS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📢 TOUTES LES ANNONCES
// ==================================================
router.get('/annonces', protegerDirecteur, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM annonces ORDER BY date_publication DESC LIMIT 20`);
    console.log(`✅ Annonces : ${r.rows.length}`);
    res.json({ ok: true, annonces: r.rows });
  } catch (e) {
    console.error("❌ ERREUR ANNONCES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📅 TOUS LES ÉVÉNEMENTS
// ==================================================
router.get('/evenements', protegerDirecteur, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM evenements ORDER BY date_evenement ASC LIMIT 15`);
    console.log(`✅ Événements : ${r.rows.length}`);
    res.json({ ok: true, evenements: r.rows });
  } catch (e) {
    console.error("❌ ERREUR ÉVÉNEMENTS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;