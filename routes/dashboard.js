const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// 🔒 Protection : Administrateur uniquement
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// ✅ Fonction utilitaire sécurisée
// ==================================================
function parseIntSecure(valeur) {
  return parseInt(valeur?.count || valeur) || 0;
}

// ==================================================
// 1️⃣ /api/statistiques
// ==================================================
router.get('/statistiques', protegerAdmin, async (req, res) => {
  try {
    const [classes, eleves, profs, preinscriptions] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM classes'),
      pool.query("SELECT COUNT(*) FROM utilisateurs WHERE role = 'eleve'"),
      pool.query("SELECT COUNT(*) FROM utilisateurs WHERE role = 'professeur'"),
      pool.query("SELECT COUNT(*) FROM preinscriptions WHERE statut = 'en attente'")
    ]);

    res.json({
      ok: true,
      statistiques: {
        classes: parseIntSecure(classes.rows[0]),
        eleves: parseIntSecure(eleves.rows[0]),
        professeurs: parseIntSecure(profs.rows[0]),
        preinscriptions_attente: parseIntSecure(preinscriptions.rows[0])
      }
    });
  } catch (e) {
    console.error("❌ ERREUR /statistiques :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 2️⃣ /api/alertes
// ==================================================
router.get('/alertes', protegerAdmin, async (req, res) => {
  try {
    const alertes = [];
    const r = await pool.query("SELECT COUNT(*) FROM preinscriptions WHERE statut = 'en attente'");
    const nbAttente = parseIntSecure(r.rows[0]);

    if (nbAttente > 0) {
      alertes.push({
        type: 'attention',
        titre: 'Préinscriptions en attente',
        message: `${nbAttente} demande(s) attendent un traitement`,
        nombre: nbAttente
      });
    }

    res.json({ ok: true, alertes });
  } catch (e) {
    console.error("❌ ERREUR /alertes :", e.message);
    res.json({ ok: true, alertes: [] });
  }
});

// ==================================================
// 3️⃣ /api/activite-recente
// ==================================================
router.get('/activite-recente', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_preinscription, nom, prenoms, date_preinscription
      FROM preinscriptions
      ORDER BY date_preinscription DESC NULLS LAST
      LIMIT 5
    `);

    const activite = r.rows.map(p => ({
      titre: 'Nouvelle préinscription',
      description: `${p.nom || ''} ${p.prenoms || ''}`.trim(),
      date: p.date_preinscription
    }));

    res.json({ ok: true, activite });
  } catch (e) {
    console.error("❌ ERREUR /activite-recente :", e.message);
    res.json({ ok: true, activite: [] });
  }
});

// ==================================================
// 4️⃣ /api/repartition-eleves
// ==================================================
router.get('/repartition-eleves', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.libelle_classe, COUNT(u.id) AS nombre
      FROM classes c
      LEFT JOIN utilisateurs u 
        ON u.id_classe = c.id_classe 
        AND u.role = 'eleve'
      GROUP BY c.id_classe, c.libelle_classe
      ORDER BY c.libelle_classe
    `);

    res.json({ ok: true, repartition: r.rows });
  } catch (e) {
    console.error("❌ ERREUR /repartition-eleves :", e.message);
    res.json({ ok: true, repartition: [] });
  }
});

// ==================================================
// 5️⃣ /api/etat-bulletins
// ==================================================
router.get('/etat-bulletins', protegerAdmin, async (req, res) => {
  try {
    const rEleves = await pool.query("SELECT COUNT(*) FROM utilisateurs WHERE role = 'eleve'");
    const total = parseIntSecure(rEleves.rows[0]);

    // Nombre de bulletins édités (depuis la table bulletins)
    const rBulletins = await pool.query("SELECT COUNT(DISTINCT id_eleve) FROM bulletins");
    const edites = parseIntSecure(rBulletins.rows[0]);
    const progression = total > 0 ? Math.round((edites / total) * 100) : 0;

    res.json({
      ok: true,
      bulletins: {
        total_eleves: total,
        edites: edites,
        non_edites: total - edites,
        progression_pourcent: progression
      }
    });
  } catch (e) {
    console.error("❌ ERREUR /etat-bulletins :", e.message);
    res.json({
      ok: true,
      bulletins: { total_eleves: 0, edites: 0, non_edites: 0, progression_pourcent: 0 }
    });
  }
});

module.exports = router;