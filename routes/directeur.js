const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifdirecteur = require('../middleware/verifdirecteur'); // ✅ Middleware spécifique Directeur

// ==================================================
// 📊 STATISTIQUES GLOBALES
// ==================================================
router.get('/statistiques', verifdirecteur, async (req, res) => {
  try {
    const [eleves] = await pool.query(`SELECT COUNT(*) FROM utilisateurs WHERE role = 'eleve'`);
    const [profs] = await pool.query(`SELECT COUNT(*) FROM utilisateurs WHERE role = 'prof'`);
    const [classes] = await pool.query(`SELECT COUNT(*) FROM classes`);
    const [attente] = await pool.query(`SELECT COUNT(*) FROM inscriptions WHERE statut = 'en_attente'`);

    // Infos du directeur connecté
    const directeur = await pool.query(`
      SELECT prenoms, nom FROM utilisateurs WHERE id_utilisateur = $1
    `, [req.user.id_utilisateur]);

    res.json({
      ok: true,
      eleves: parseInt(eleves.rows[0].count),
      profs: parseInt(profs.rows[0].count),
      classes: parseInt(classes.rows[0].count),
      attente: parseInt(attente.rows[0].count),
      directeur: directeur.rows[0]
    });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// 📋 INSCRIPTIONS EN ATTENTE
// ==================================================
router.get('/inscriptions-attente', verifdirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT i.*, u.nom, u.prenoms, c.libelle_classe
      FROM inscriptions i
      JOIN utilisateurs u ON i.id_eleve = u.id_utilisateur
      LEFT JOIN classes c ON i.id_classe = c.id_classe
      WHERE i.statut = 'en_attente'
      ORDER BY i.date_inscription DESC
    `);
    res.json({ ok: true, inscriptions: r.rows });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// ✅ VALIDER UNE INSCRIPTION
// ==================================================
router.patch('/valider-inscription/:id', verifdirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      UPDATE inscriptions 
      SET statut = 'validee', date_validation = NOW(), valide_par = $1
      WHERE id_inscription = $2 AND statut = 'en_attente'
      RETURNING *
    `, [req.user.id_utilisateur, req.params.id]);
    if (!r.rows.length) return res.json({ ok: false, erreur: "Inscription introuvable ou déjà traitée" });
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// ❌ REFUSER UNE INSCRIPTION
// ==================================================
router.patch('/refuser-inscription/:id', verifdirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      UPDATE inscriptions 
      SET statut = 'refusee', date_validation = NOW(), valide_par = $1
      WHERE id_inscription = $2 AND statut = 'en_attente'
      RETURNING *
    `, [req.user.id_utilisateur, req.params.id]);
    if (!r.rows.length) return res.json({ ok: false, erreur: "Inscription introuvable ou déjà traitée" });
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// 📄 CONSULTER BULLETINS PAR CLASSE
// ==================================================
router.get('/bulletins', verifdirecteur, async (req, res) => {
  try {
    const id_classe = req.query.classe;
    const trimestre = req.query.trimestre || '1';
    if (!id_classe) return res.json({ ok: false, erreur: "Classe requise" });

    const bulletins = await pool.query(`
      SELECT n.id_eleve, u.nom, u.prenoms,
             AVG(n.moyenne) AS moyenne_generale,
             COUNT(DISTINCT n.id_matiere) AS nb_matieres
      FROM notes n
      JOIN utilisateurs u ON n.id_eleve = u.id_utilisateur
      WHERE n.id_classe = $1 AND n.trimestre = $2
      GROUP BY n.id_eleve, u.nom, u.prenoms
      ORDER BY moyenne_generale DESC
    `, [id_classe, trimestre]);

    res.json({ ok: true, bulletins: bulletins.rows });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// 💰 SYNTHÈSE DES PAIEMENTS
// ==================================================
router.get('/paiements-synthese', verifdirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COALESCE(SUM(montant_total),0) AS totale,
        COALESCE(SUM(montant_paye),0) AS paye,
        COALESCE(SUM(montant_total - montant_paye),0) AS restant
      FROM paiements
    `);
    res.json({ ok: true, ...r.rows[0] });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// 📢 TOUTES LES ANNONCES
// ==================================================
router.get('/annonces', verifdirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM annonces ORDER BY date_publication DESC LIMIT 20
    `);
    res.json({ ok: true, annonces: r.rows });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// 📅 TOUS LES ÉVÉNEMENTS
// ==================================================
router.get('/evenements', verifdirecteur, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM evenements ORDER BY date_evenement ASC LIMIT 15
    `);
    res.json({ ok: true, evenements: r.rows });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

module.exports = router;