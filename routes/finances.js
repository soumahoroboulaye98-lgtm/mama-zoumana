const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');
const verifcomptableouadmin = require('../middleware/verifcomptableouadmin');

// ==================================================
// 📋 LISTE + BILAN + COMPARAISON + BUDGET
// ✅ Tous les droits : Comptable OU Admin
// ==================================================
router.get('/liste', verifcomptableouadmin, async (req, res) => {
  try {
    const { type, categorie, mois, annee, recherche, id_utilisateur } = req.query;
    let conditions = [], params = [], idx = 1;

    if (type) { conditions.push(`o.type = $${idx++}`); params.push(type); }
    if (categorie) { conditions.push(`o.categorie = $${idx++}`); params.push(categorie); }
    if (mois) { conditions.push(`EXTRACT(MONTH FROM o.date_operation) = $${idx++}`); params.push(mois); }
    if (annee) { conditions.push(`EXTRACT(YEAR FROM o.date_operation) = $${idx++}`); params.push(annee); }
    if (recherche) { conditions.push(`(o.libelle ILIKE $${idx} OR o.commentaire ILIKE $${idx})`); params.push(`%${recherche}%`); idx++; }
    if (id_utilisateur) { conditions.push(`o.id_utilisateur = $${idx++}`); params.push(id_utilisateur); }

    const whereBase = conditions.length ? conditions.join(' AND ') : '1=1';
    const whereComplet = `WHERE o.statut = 'valide' AND ${whereBase}`;

    const operations = await pool.query(`
      SELECT o.*, u.nom, u.prenoms, u.email
      FROM operations_financieres o
      LEFT JOIN utilisateurs u ON o.id_utilisateur = u.id_utilisateur
      ${whereComplet}
      ORDER BY o.date_operation DESC, o.date_creation DESC
    `, params);

    const bilan = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN o.type = 'recette' THEN o.montant END), 0)::NUMERIC(12,2) AS recettes,
        COALESCE(SUM(CASE WHEN o.type = 'depense' THEN o.montant END), 0)::NUMERIC(12,2) AS depenses,
        COUNT(*) AS nombre_operations
      FROM operations_financieres o
      ${whereComplet}
    `, params);

    const recettes = parseFloat(bilan.rows[0].recettes) || 0;
    const depenses = parseFloat(bilan.rows[0].depenses) || 0;
    const solde = recettes - depenses;

    let bilanPrec = { recettes: 0, depenses: 0, solde: 0 };
    if (mois && annee) {
      const m = parseInt(mois), a = parseInt(annee);
      const moisPrec = m === 1 ? 12 : m - 1;
      const anneePrec = m === 1 ? a - 1 : a;

      const paramsPrec = [moisPrec, anneePrec];
      let condPrec = '';
      if (conditions.length > 2) {
        condPrec = ' AND ' + conditions.slice(2).map((c, i) => c.replace(/\$\d+/g, `$${i+3}`)).join(' AND ');
        paramsPrec.push(...params.slice(2));
      }

      const resPrec = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'recette' THEN montant END), 0)::NUMERIC(12,2) AS recettes,
          COALESCE(SUM(CASE WHEN type = 'depense' THEN montant END), 0)::NUMERIC(12,2) AS depenses
        FROM operations_financieres
        WHERE statut = 'valide'
          AND EXTRACT(MONTH FROM date_operation) = $1
          AND EXTRACT(YEAR FROM date_operation) = $2
          ${condPrec}
      `, paramsPrec);

      if (resPrec.rows.length > 0) {
        const r = parseFloat(resPrec.rows[0].recettes) || 0;
        const d = parseFloat(resPrec.rows[0].depenses) || 0;
        bilanPrec = { recettes: r, depenses: d, solde: r - d };
      }
    }

    const parCategorie = await pool.query(`
      SELECT o.categorie, o.type,
             SUM(o.montant)::NUMERIC(12,2) AS total,
             COUNT(*) AS nb
      FROM operations_financieres o
      ${whereComplet}
      GROUP BY o.categorie, o.type
      ORDER BY total DESC
    `, params);

    const evolution = await pool.query(`
      SELECT
        EXTRACT(YEAR FROM o.date_operation)::INT AS annee,
        EXTRACT(MONTH FROM o.date_operation)::INT AS mois,
        COALESCE(SUM(CASE WHEN o.type = 'recette' THEN o.montant END), 0)::NUMERIC(12,2) AS recettes,
        COALESCE(SUM(CASE WHEN o.type = 'depense' THEN o.montant END), 0)::NUMERIC(12,2) AS depenses
      FROM operations_financieres o
      WHERE o.statut = 'valide'
      GROUP BY EXTRACT(YEAR FROM o.date_operation), EXTRACT(MONTH FROM o.date_operation)
      ORDER BY annee DESC, mois DESC
      LIMIT 12
    `);

    let budget = { rows: [] };
    if (mois && annee) {
      budget = await pool.query(`
        SELECT * FROM budgets_previsionnels
        WHERE annee = $1 AND mois = $2
      `, [annee, mois]);
    }

    let periodeClose = false;
    if (mois && annee) {
      const pc = await pool.query(`
        SELECT id_periode FROM periodes_cloturees WHERE annee = $1 AND mois = $2
      `, [annee, mois]);
      periodeClose = pc.rows.length > 0;
    }

    const operateurs = await pool.query(`
      SELECT DISTINCT o.id_utilisateur, u.nom, u.prenoms, COUNT(*) AS nb_ops
      FROM operations_financieres o
      LEFT JOIN utilisateurs u ON o.id_utilisateur = u.id_utilisateur
      WHERE o.statut = 'valide'
      ${conditions.length ? 'AND ' + conditions.join(' AND ') : ''}
      GROUP BY o.id_utilisateur, u.nom, u.prenoms
      ORDER BY nb_ops DESC
    `, params);

    res.json({
      ok: true,
      operations: operations.rows,
      bilan: { recettes, depenses, solde, nombre_operations: bilan.rows[0]?.nombre_operations || 0 },
      bilanPrec,
      parCategorie: parCategorie.rows,
      evolution: evolution.rows.reverse(),
      budget: budget.rows,
      periodeClose,
      operateurs: operateurs.rows
    });

  } catch (e) {
    console.log("❌ ERREUR FINANCES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ➕ ENREGISTRER — Comptable OU Admin ✅
// ==================================================
router.post('/enregistrer', verifcomptableouadmin, async (req, res) => {
  try {
    const { type, libelle, categorie, montant, date_operation, commentaire, mode_paiement, reference } = req.body;
    const id_utilisateur = req.user?.id_utilisateur;

    if (!libelle || !montant || !type) {
      return res.json({ ok: false, erreur: "Libellé, montant et type sont obligatoires" });
    }

    const dt = date_operation ? new Date(date_operation) : new Date();
    const mois = dt.getMonth() + 1;
    const annee = dt.getFullYear();

    const verrou = await pool.query(`
      SELECT id_periode FROM periodes_cloturees WHERE annee = $1 AND mois = $2
    `, [annee, mois]);
    if (verrou.rows.length > 0) {
      return res.json({ ok: false, erreur: "🔒 Cette période est clôturée — Impossible d'ajouter" });
    }

    const r = await pool.query(`
      INSERT INTO operations_financieres(
        type, libelle, categorie, montant, date_operation, commentaire,
        mode_paiement, reference, id_utilisateur, statut
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'valide')
      RETURNING *
    `, [
      type, libelle, categorie || 'autre', montant,
      date_operation || new Date(), commentaire || null,
      mode_paiement || 'especes', reference || null, id_utilisateur
    ]);

    res.json({ ok: true, operation: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR ENREGISTREMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER — SEULEMENT ADMIN 🔒
// ==================================================
router.put('/:id', verifadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, libelle, categorie, montant, date_operation, commentaire, mode_paiement, reference, statut } = req.body;
    const id_utilisateur = req.user?.id_utilisateur;

    if (!libelle || !montant || !type) {
      return res.json({ ok: false, erreur: "Libellé, montant et type sont obligatoires" });
    }

    const dt = date_operation ? new Date(date_operation) : new Date();
    const mois = dt.getMonth() + 1;
    const annee = dt.getFullYear();

    if (isNaN(mois) || isNaN(annee)) {
      return res.json({ ok: false, erreur: "Date d'opération invalide" });
    }

    const verrou = await pool.query(`
      SELECT id_periode FROM periodes_cloturees WHERE annee = $1 AND mois = $2
    `, [annee, mois]);
    if (verrou.rows.length > 0) {
      return res.json({ ok: false, erreur: "🔒 Période clôturée — Modification impossible" });
    }

    const r = await pool.query(`
      UPDATE operations_financieres SET
        type = $1, libelle = $2, categorie = $3, montant = $4, date_operation = $5,
        commentaire = $6, mode_paiement = $7, reference = $8, statut = $9,
        id_utilisateur = $10, date_modification = NOW()
      WHERE id = $11
      RETURNING *
    `, [
      type, libelle, categorie || 'autre', montant, date_operation,
      commentaire || null, mode_paiement || 'especes', reference || null,
      statut || 'valide', id_utilisateur, id
    ]);

    if (!r.rows.length) {
      return res.json({ ok: false, erreur: "Opération introuvable" });
    }

    res.json({ ok: true, operation: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER — SEULEMENT ADMIN 🔒
// ==================================================
router.delete('/:id', verifadmin, async (req, res) => {
  try {
    const op = await pool.query(
      'SELECT date_operation FROM operations_financieres WHERE id = $1',
      [req.params.id]
    );
    if (!op.rows.length) return res.json({ ok: false, erreur: "Opération introuvable" });

    const dt = new Date(op.rows[0].date_operation);
    const mois = dt.getMonth() + 1;
    const annee = dt.getFullYear();

    const verrou = await pool.query(`
      SELECT id_periode FROM periodes_cloturees WHERE annee = $1 AND mois = $2
    `, [annee, mois]);
    if (verrou.rows.length > 0) {
      return res.json({ ok: false, erreur: "🔒 Période clôturée — Suppression impossible" });
    }

    await pool.query('DELETE FROM operations_financieres WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🔒 CLÔTURER / ROUVRIR — SEULEMENT ADMIN 🔒
// ==================================================
router.post('/cloturer', verifadmin, async (req, res) => {
  try {
    const { mois, annee, observations } = req.body;
    const id_utilisateur = req.user?.id_utilisateur;

    await pool.query(`
      INSERT INTO periodes_cloturees(annee, mois, id_utilisateur_cloture, observations, date_cloture)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT(annee, mois) DO NOTHING
    `, [annee, mois, id_utilisateur, observations || '']);

    res.json({ ok: true, message: `✅ Période ${mois}/${annee} clôturée` });
  } catch (e) {
    console.log("❌ ERREUR CLÔTURE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

router.post('/rouvrir', verifadmin, async (req, res) => {
  try {
    const { mois, annee } = req.body;
    await pool.query('DELETE FROM periodes_cloturees WHERE annee = $1 AND mois = $2', [annee, mois]);
    res.json({ ok: true, message: `✅ Période ${mois}/${annee} rouverte` });
  } catch (e) {
    console.log("❌ ERREUR RÉOUVERTURE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🏷️ BUDGET PRÉVISIONNEL — Comptable OU Admin ✅
// ==================================================
router.post('/budget/enregistrer', verifcomptableouadmin, async (req, res) => {
  try {
    const { annee, mois, categorie, montant_prevu } = req.body;
    const r = await pool.query(`
      INSERT INTO budgets_previsionnels(annee, mois, categorie, montant_prevu, date_creation)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT(annee, mois, categorie) DO UPDATE SET montant_prevu = $4
      RETURNING *
    `, [annee, mois, categorie, montant_prevu]);
    res.json({ ok: true, budget: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR BUDGET :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;