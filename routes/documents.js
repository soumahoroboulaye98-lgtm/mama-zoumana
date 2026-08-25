const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée uniforme
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📄 DÉLIVRER UN DOCUMENT OFFICIEL
// ✅ Attestation scolarité, Bulletin, Certificat, Relevé, etc.
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
    console.error("❌ ERREUR DÉLIVRANCE DOCUMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 HISTORIQUE DES DOCUMENTS DÉLIVRÉS
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

    console.log(`✅ Historique documents : ${r.rows.length}`);
    res.json({ ok: true, documents: r.rows });

  } catch (e) {
    console.error("❌ ERREUR HISTORIQUE DOCUMENTS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;