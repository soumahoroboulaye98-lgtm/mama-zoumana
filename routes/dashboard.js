const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==================================================
// 🔐 MIDDLEWARES
// ==================================================
let veriftoken, verifadmin, protegerAdmin;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  protegerAdmin = [veriftoken, verifadmin];
} catch {
  protegerAdmin = [];
  console.warn("⚠️ Middlewares introuvables — dashboard ouvert temporairement");
}

// ==================================================
// 📊 1. STATISTIQUES GLOBALES
// ==================================================
router.get('/statistiques', protegerAdmin, async (req, res) => {
  try {
    const [classes, eleves, profs, preinscriptionsAttente] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM classes'),
      pool.query("SELECT COUNT(*) FROM utilisateurs WHERE role = 'eleve'"),
      pool.query("SELECT COUNT(*) FROM utilisateurs WHERE role = 'professeur'"),
      pool.query("SELECT COUNT(*) FROM preinscriptions WHERE statut = 'en_attente' OR statut IS NULL")
    ]);

    res.json({
      ok: true,
      stats: {
        classes: parseInt(classes.rows[0].count),
        eleves: parseInt(eleves.rows[0].count),
        profs: parseInt(profs.rows[0].count),
        attente: parseInt(preinscriptionsAttente.rows[0].count)
      }
    });
  } catch (erreur) {
    console.error("❌ Erreur statistiques :", erreur.message);
    res.json({ ok: false, erreur: erreur.message });
  }
});

// ==================================================
// ⚠️ 2. ALERTES DU SYSTÈME
// ==================================================
router.get('/alertes', protegerAdmin, async (req, res) => {
  try {
    const alertes = [];
    const attente = await pool.query("SELECT COUNT(*) FROM preinscriptions WHERE statut = 'en_attente' OR statut IS NULL");
    const nbAttente = parseInt(attente.rows[0].count);
    if (nbAttente > 0) {
      alertes.push({
        type: 'warning',
        icone: 'bi-exclamation-triangle',
        message: `${nbAttente} préinscription(s) en attente de validation`
      });
    }
    const anneeActuelle = new Date().getFullYear();
    alertes.push({
      type: 'info',
      icone: 'bi-calendar-check',
      message: `Année scolaire en cours : ${anneeActuelle}-${anneeActuelle + 1}`
    });
    res.json({ ok: true, alertes });
  } catch (erreur) {
    console.error("❌ Erreur alertes :", erreur.message);
    res.json({ ok: true, alertes: [] });
  }
});

// ==================================================
// 🕐 3. ACTIVITÉ RÉCENTE — ✅ ADAPTÉ À VOS COLONNES
// ==================================================
router.get('/activite-recente', protegerAdmin, async (req, res) => {
  try {
    const activite = [];

    // ✅ VOTRE COLONNE : date_preinscription au lieu de date_soumission
    const { rows: dernieresInscrits } = await pool.query(`
      SELECT prenoms, nom, date_preinscription
      FROM preinscriptions
      ORDER BY date_preinscription DESC
      LIMIT 5
    `);
    dernieresInscrits.forEach(p => {
      activite.push({
        icone: 'bi-person-plus',
        texte: `Préinscription : ${(p.prenoms || '')} ${(p.nom || '')}`.trim(),
        date: p.date_preinscription
      });
    });

    // ✅ VOS COLONNES : titre_fr + date_publication (correspondent parfaitement)
    const { rows: actualites } = await pool.query(`
      SELECT titre_fr, date_publication
      FROM actualites
      WHERE est_publie = true
      ORDER BY date_publication DESC
      LIMIT 3
    `);
    actualites.forEach(a => {
      activite.push({
        icone: 'bi-megaphone',
        texte: `Actualité : ${a.titre_fr}`,
        date: a.date_publication
      });
    });

    if (activite.length === 0) {
      activite.push({
        icone: 'bi-info-circle',
        texte: 'Aucune activité récente enregistrée',
        date: null
      });
    }

    res.json({ ok: true, activite });
  } catch (erreur) {
    console.error("❌ Erreur activité récente :", erreur.message);
    res.json({ ok: true, activite: [
      { icone: 'bi-info-circle', texte: 'Activité récente indisponible', date: null }
    ]});
  }
});

// ==================================================
// 📈 4. RÉPARTITION ÉLÈVES PAR CLASSE
// ==================================================
router.get('/repartition-eleves', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.libelle_classe, COUNT(u.id) as nombre
      FROM classes c
      LEFT JOIN utilisateurs u ON u.id_classe = c.id_classe AND u.role = 'eleve'
      GROUP BY c.id_classe, c.libelle_classe
      ORDER BY c.libelle_classe
    `);
    res.json({ ok: true, repartition: rows });
  } catch (erreur) {
    console.error("❌ Erreur répartition :", erreur.message);
    res.json({ ok: false, repartition: [] });
  }
});

// ==================================================
// 📄 5. ÉTAT NOTES & BULLETINS — ✅ ADAPTÉ À VOS COLONNES
// ==================================================
router.get('/etat-bulletins', protegerAdmin, async (req, res) => {
  try {
    // ✅ VOTRE COLONNE : note_numerique au lieu de note
    const notes = await pool.query("SELECT COUNT(*) FROM notes WHERE note_numerique IS NOT NULL");
    const bulletins = await pool.query("SELECT COUNT(*) FROM bulletins");

    res.json({
      ok: true,
      notesSaisies: parseInt(notes.rows[0].count),
      bulletinsGeneres: parseInt(bulletins.rows[0].count)
    });
  } catch (erreur) {
    console.error("❌ Erreur état bulletins :", erreur.message);
    res.json({ ok: true, notesSaisies: 0, bulletinsGeneres: 0 });
  }
});

module.exports = router;