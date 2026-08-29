const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protections groupées uniformes
const protegerAdmin = [veriftoken, verifadmin];
const protegerConnecte = [veriftoken];

// ==================================================
// 📄 DÉLIVRER / ENREGISTRER UN DOCUMENT
// ✅ Le numéro unique est généré AUTOMATIQUEMENT par la base
// ==================================================
router.post('/delivrer', protegerAdmin, async (req, res) => {
  try {
    const { id_eleve, id_employe, type_doc, annee_scolaire } = req.body;

    // ✅ Validations claires et ordonnées
    if (!type_doc || !annee_scolaire)
      return res.json({ ok: false, erreur: "⚠️ Type et année scolaire sont obligatoires" });
    if (!id_eleve && !id_employe)
      return res.json({ ok: false, erreur: "⚠️ Veuillez sélectionner un élève OU un membre du personnel" });

    // ✅ INSERT SANS numero_unique : la base le génère toute seule
    const r = await pool.query(`
      INSERT INTO documents_delivres(
        id_eleve, id_employe, type_document, annee_scolaire,
        date_delivrance, id_utilisateur_admin
      ) VALUES ($1, $2, $3, $4, NOW(), $5)
      RETURNING *
    `, [id_eleve || null, id_employe || null, type_doc, annee_scolaire, req.user.id]);

    const numDoc = r.rows[0].numero_unique;
    console.log(`✅ Document délivré — N°: ${numDoc}, Type: ${type_doc}, Année: ${annee_scolaire}`);
    res.json({
      ok: true,
      document: r.rows[0],
      message: `✅ Document enregistré ! N° : ${numDoc}`
    });

  } catch (e) {
    console.error("❌ ERREUR DÉLIVRANCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE TOUS LES DOCUMENTS → utilisée par la page HTML
// ==================================================
router.get('/tous', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT d.*,
             d.type_document AS type_doc,
             d.annee_scolaire,
             d.numero_unique,
             d.date_delivrance,
             CASE
               WHEN d.id_eleve IS NOT NULL THEN
                 json_build_object('nom', e.nom, 'prenoms', e.prenoms, 'classe', e.classe, 'matricule', e.matricule)
               WHEN d.id_employe IS NOT NULL THEN
                 json_build_object('nom', p.nom, 'prenoms', p.prenoms, 'role', p.role)
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
// 📋 HISTORIQUE DES DOCUMENTS (filtrable)
// ==================================================
router.get('/historique', protegerAdmin, async (req, res) => {
  try {
    const { annee, type_doc } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (annee) { conditions.push(`d.annee_scolaire = $${idx++}`); params.push(annee); }
    if (type_doc) { conditions.push(`d.type_document = $${idx++}`); params.push(type_doc); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT d.*,
             CASE
               WHEN d.id_eleve IS NOT NULL THEN CONCAT(e.nom, ' ', e.prenoms)
               WHEN d.id_employe IS NOT NULL THEN CONCAT(p.nom, ' ', p.prenoms)
             END AS beneficiaire_nom,
             a.nom AS administrateur_nom
      FROM documents_delivres d
      LEFT JOIN utilisateurs e ON d.id_eleve = e.id
      LEFT JOIN utilisateurs p ON d.id_employe = p.id
      LEFT JOIN utilisateurs a ON d.id_utilisateur_admin = a.id
      ${where}
      ORDER BY d.date_delivrance DESC
      LIMIT 100
    `, params);

    res.json({ ok: true, documents: r.rows });
  } catch (e) {
    console.error("❌ ERREUR HISTORIQUE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UN DOCUMENT par numéro unique
// ==================================================
router.post('/supprimer', protegerAdmin, async (req, res) => {
  try {
    const { numero_unique } = req.body;

    if (!numero_unique)
      return res.json({ ok: false, erreur: "⚠️ Numéro unique requis pour la suppression" });

    const resultat = await pool.query(
      'DELETE FROM documents_delivres WHERE numero_unique = $1 RETURNING id',
      [numero_unique]
    );

    if (resultat.rows.length === 0)
      return res.json({ ok: false, erreur: "⚠️ Document introuvable" });

    console.log(`🗑️ Document supprimé — N°: ${numero_unique}`);
    res.json({ ok: true, message: "✅ Document supprimé" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 👥 LISTE ÉLÈVES → pour formulaire de délivrance
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
// 👤 LISTE PERSONNEL → pour formulaire de délivrance
// ==================================================
router.get('/personnel/tous', protegerConnecte, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom, prenoms, role
      FROM utilisateurs
      WHERE role IN ('prof','admin','super_admin','comptable','directeur')
      ORDER BY nom, prenoms
    `);
    res.json({ ok: true, personnel: r.rows });
  } catch (e) {
    console.error("❌ ERREUR PERSONNEL :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

module.exports = router;