const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée
const protegerAdmin = [veriftoken, verifadmin];
const protegerConnecte = [veriftoken];

// ==================================================
// 📄 DÉLIVRER UN DOCUMENT
// ==================================================
router.post('/delivrer', protegerAdmin, async (req, res) => {
  try {
    const { id_eleve, id_employe, type_doc, annee_scolaire, numero_unique } = req.body;
    if (!type_doc || !annee_scolaire)
      return res.json({ ok: false, erreur: "⚠️ Type et année scolaire obligatoires" });
    if (!id_eleve && !id_employe)
      return res.json({ ok: false, erreur: "⚠️ Élève OU Employé concerné obligatoire" });

    const r = await pool.query(`
      INSERT INTO documents_delivres(
        id_eleve, id_employe, type_document, annee_scolaire,
        numero_unique, date_delivrance, id_utilisateur_admin
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      RETURNING *
    `, [id_eleve||null, id_employe||null, type_doc, annee_scolaire, numero_unique||null, req.user.id]);

    console.log(`✅ Document délivré — Type: ${type_doc}, Année: ${annee_scolaire}`);
    res.json({ ok: true, document: r.rows[0], message: "✅ Document enregistré et délivré !" });
  } catch (e) {
    console.error("❌ ERREUR DÉLIVRANCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE TOUS LES DOCUMENTS (anciennement /tous)
// ==================================================
router.get('/tous', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT d.*,
             CASE WHEN d.id_eleve IS NOT NULL THEN CONCAT(e.nom, ' ', e.prenoms)
                  WHEN d.id_employe IS NOT NULL THEN CONCAT(p.nom, ' ', p.prenoms)
             END AS beneficiaire
      FROM documents_delivres d
      LEFT JOIN utilisateurs e ON d.id_eleve = e.id
      LEFT JOIN utilisateurs p ON d.id_employe = p.id
      ORDER BY d.date_delivrance DESC
    `);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE DOCUMENTS :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 HISTORIQUE DES DOCUMENTS
// ==================================================
router.get('/historique', protegerAdmin, async (req, res) => {
  try {
    const { annee, type_doc } = req.query;
    let conditions = [], params = [], idx = 1;
    if (annee) { conditions.push(`d.annee_scolaire = $${idx++}`); params.push(annee); }
    if (type_doc) { conditions.push(`d.type_document = $${idx++}`); params.push(type_doc); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT d.*,
             CASE WHEN d.id_eleve IS NOT NULL THEN CONCAT(e.nom, ' ', e.prenoms)
                  WHEN d.id_employe IS NOT NULL THEN CONCAT(p.nom, ' ', p.prenoms)
             END AS beneficiaire,
             a.nom AS administrateur_nom
      FROM documents_delivres d
      LEFT JOIN utilisateurs e ON d.id_eleve = e.id
      LEFT JOIN utilisateurs p ON d.id_employe = p.id
      LEFT JOIN utilisateurs a ON d.id_utilisateur_admin = a.id
      ${where} ORDER BY d.date_delivrance DESC LIMIT 50
    `, params);

    res.json({ ok: true, documents: r.rows });
  } catch (e) {
    console.error("❌ ERREUR HISTORIQUE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UN DOCUMENT
// ==================================================
router.post('/supprimer', protegerAdmin, async (req, res) => {
  try {
    const { numero_unique } = req.body;
    await pool.query('DELETE FROM documents_delivres WHERE numero_unique = $1', [numero_unique]);
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 👥 ÉLÈVES — Route manquante !
// ==================================================
router.get('/eleves/tous', protegerConnecte, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom, prenoms, matricule, classe, role
      FROM utilisateurs
      WHERE role = 'eleve'
      ORDER BY nom, prenoms
    `);
    res.json({ ok: true, eleves: r.rows });
  } catch (e) {
    console.error("❌ ERREUR ÉLÈVES :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 👤 PERSONNEL / EMPLOYÉS — Route manquante !
// ==================================================
router.get('/utilisateurs/personnel', protegerConnecte, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom, prenoms, role
      FROM utilisateurs
      WHERE role IN ('prof','Admin','admin','super_admin')
      ORDER BY nom, prenoms
    `);
    res.json({ ok: true, personnel: r.rows });
  } catch (e) {
    console.error("❌ ERREUR PERSONNEL :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

module.exports = router;