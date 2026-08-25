const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const verifcomptableouadmin = require('../middleware/verifcomptableouadmin');

// ✅ Protections groupées uniformes
const protegerLecture = [veriftoken, verifcomptableouadmin];
const protegerEcriture = [veriftoken, verifcomptableouadmin];
const protegerAdminSeul = [veriftoken, verifadmin];


// ==================================================
// 📊 PLAN COMPTABLE
// ==================================================
router.get('/plan', protegerLecture, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM plan_comptable ORDER BY numero_compte');
    res.json({ ok: true, comptes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR PLAN COMPTABLE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📖 JOURNAUX
// ==================================================
router.get('/journaux', protegerLecture, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM journaux ORDER BY code_journal');
    res.json({ ok: true, journaux: r.rows });
  } catch (e) {
    console.error("❌ ERREUR JOURNAUX :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📝 LISTE DES ÉCRITURES
// ==================================================
router.get('/ecritures', protegerLecture, async (req, res) => {
  try {
    const { annee, mois, statut, code_journal } = req.query;
    const conditions = [], params = [];
    let idx = 1;
    if (annee) { conditions.push(`EXTRACT(YEAR FROM e.date_ecriture)=$${idx++}`); params.push(annee); }
    if (mois) { conditions.push(`EXTRACT(MONTH FROM e.date_ecriture)=$${idx++}`); params.push(mois); }
    if (statut) { conditions.push(`e.statut=$${idx++}`); params.push(statut); }
    if (code_journal) { conditions.push(`j.code_journal=$${idx++}`); params.push(code_journal); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const ecritures = await pool.query(`
      SELECT e.*, j.code_journal, j.libelle AS libelle_journal,
             u1.nom AS utilisateur_nom, u2.nom AS valideur_nom
      FROM ecritures_comptables e
      LEFT JOIN journaux j ON e.id_journal = j.id_journal
      LEFT JOIN utilisateurs u1 ON e.id_utilisateur = u1.id
      LEFT JOIN utilisateurs u2 ON e.id_valideur = u2.id
      ${where} ORDER BY e.date_ecriture DESC, e.numero_ecriture DESC
    `, params);

    const lignes = await pool.query(`
      SELECT l.*, e.numero_ecriture, p.libelle AS libelle_compte
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      ${where} ORDER BY l.id_ecriture, l.ordre_ligne
    `, params);

    res.json({ ok: true, ecritures: ecritures.rows, lignes: lignes.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE ÉCRITURES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ CRÉER UNE ÉCRITURE
// ==================================================
router.post('/ecritures/enregistrer', protegerEcriture, async (req, res) => {
  try {
    const { date_ecriture, id_journal, libelle, reference, lignes } = req.body;
    const id_utilisateur = req.user.id;

    // ✅ Vérification équilibre Débit/Crédit
    let totalDebit = 0, totalCredit = 0;
    lignes.forEach(l => {
      totalDebit += parseFloat(l.montant_debit || 0);
      totalCredit += parseFloat(l.montant_credit || 0);
    });
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.json({ ok: false, erreur: "⚠️ Écriture non équilibrée : Débit ≠ Crédit" });
    }

    // ✅ Numéro unique automatique
    const annee = new Date(date_ecriture).getFullYear();
    const seq = await pool.query(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(numero_ecriture FROM '[0-9]+$') AS INTEGER)),0)+1 AS prochain
      FROM ecritures_comptables WHERE numero_ecriture LIKE $1
    `, [`EC-${annee}-%`]);
    const numero = `EC-${annee}-${String(seq.rows[0].prochain).padStart(5,'0')}`;

    // ✅ Création entête
    const ecriture = await pool.query(`
      INSERT INTO ecritures_comptables
        (numero_ecriture, date_ecriture, id_journal, id_utilisateur, libelle, reference, statut)
      VALUES ($1, $2, $3, $4, $5, $6, 'brouillon') RETURNING id_ecriture
    `, [numero, date_ecriture, id_journal, id_utilisateur, libelle, reference]);
    const idEc = ecriture.rows[0].id_ecriture;

    // ✅ Insertion lignes
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      await pool.query(`
        INSERT INTO lignes_ecriture
          (id_ecriture, numero_compte, libelle_ligne, montant_debit, montant_credit, ordre_ligne)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [idEc, l.numero_compte, l.libelle_ligne, l.montant_debit||0, l.montant_credit||0, i+1]);
    }

    res.json({ ok: true, numero_ecriture: numero, id_ecriture: idEc, message: "✅ Écriture enregistrée en brouillon" });
  } catch (e) {
    console.error("❌ ERREUR CRÉATION ÉCRITURE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✅ VALIDER UNE ÉCRITURE — Admin seul
// ==================================================
router.post('/ecritures/valider/:id', protegerAdminSeul, async (req, res) => {
  try {
    const id_ecriture = parseInt(req.params.id);
    if (isNaN(id_ecriture))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const r = await pool.query(`
      UPDATE ecritures_comptables
      SET statut='valide', date_validation=NOW(), id_valideur=$1
      WHERE id_ecriture=$2 AND statut='brouillon' RETURNING *
    `, [req.user.id, id_ecriture]);

    if (!r.rows.length)
      return res.json({ ok: false, erreur: "⚠️ Introuvable ou déjà validée" });

    res.json({ ok: true, ecriture: r.rows[0], message: "✅ Écriture validée !" });
  } catch (e) {
    console.error("❌ ERREUR VALIDATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🗑️ SUPPRIMER UNE ÉCRITURE — Brouillon seulement
// ==================================================
router.delete('/ecritures/:id', protegerEcriture, async (req, res) => {
  try {
    const id_ecriture = parseInt(req.params.id);
    if (isNaN(id_ecriture))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const r = await pool.query(`
      DELETE FROM ecritures_comptables
      WHERE id_ecriture=$1 AND statut='brouillon' RETURNING numero_ecriture
    `, [id_ecriture]);

    if (!r.rows.length)
      return res.json({ ok: false, erreur: "⚠️ Impossible : déjà validée ou introuvable" });

    res.json({ ok: true, message: `✅ Écriture ${r.rows[0].numero_ecriture} supprimée` });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📊 BALANCE COMPTABLE
// ==================================================
router.get('/balance', protegerLecture, async (req, res) => {
  try {
    const { annee } = req.query;
    const r = await pool.query(`
      SELECT l.numero_compte, COALESCE(p.libelle,'Sans libellé') AS libelle,
             COALESCE(SUM(l.montant_debit),0) AS total_debit,
             COALESCE(SUM(l.montant_credit),0) AS total_credit,
             CASE WHEN SUM(l.montant_debit) > SUM(l.montant_credit)
                  THEN SUM(l.montant_debit) - SUM(l.montant_credit) ELSE 0 END AS solde_debit,
             CASE WHEN SUM(l.montant_credit) > SUM(l.montant_debit)
                  THEN SUM(l.montant_credit) - SUM(l.montant_debit) ELSE 0 END AS solde_credit
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      WHERE e.statut='valide' ${annee ? `AND EXTRACT(YEAR FROM e.date_ecriture)=$1` : ''}
      GROUP BY l.numero_compte, p.libelle ORDER BY l.numero_compte
    `, annee ? [annee] : []);
    res.json({ ok: true, balance: r.rows });
  } catch (e) {
    console.error("❌ ERREUR BALANCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📖 GRAND LIVRE
// ==================================================
router.get('/grand-livre', protegerLecture, async (req, res) => {
  try {
    const { annee, numero_compte } = req.query;
    const conditions = [`e.statut='valide'`], params = [];
    let idx = 1;
    if (annee) { conditions.push(`EXTRACT(YEAR FROM e.date_ecriture)=$${idx++}`); params.push(annee); }
    if (numero_compte) { conditions.push(`l.numero_compte=$${idx++}`); params.push(numero_compte); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const lignes = await pool.query(`
      SELECT l.numero_compte, COALESCE(p.libelle,'Sans libellé') AS libelle_compte,
             e.date_ecriture, e.numero_ecriture, e.libelle AS libelle_ecriture,
             j.code_journal, l.montant_debit, l.montant_credit
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      LEFT JOIN journaux j ON e.id_journal = j.id_journal
      ${where} ORDER BY l.numero_compte, e.date_ecriture
    `, params);

    const gl = {};
    lignes.rows.forEach(l => {
      if (!gl[l.numero_compte]) gl[l.numero_compte] = {
        numero_compte: l.numero_compte, libelle_compte: l.libelle_compte,
        cumul_debit: 0, cumul_credit: 0, solde_progressif: 0, mouvements: []
      };
      gl[l.numero_compte].cumul_debit += parseFloat(l.montant_debit || 0);
      gl[l.numero_compte].cumul_credit += parseFloat(l.montant_credit || 0);
      gl[l.numero_compte].solde_progressif =
        gl[l.numero_compte].cumul_debit - gl[l.numero_compte].cumul_credit;
      gl[l.numero_compte].mouvements.push({
        date_ecriture: l.date_ecriture, numero_ecriture: l.numero_ecriture,
        libelle_ecriture: l.libelle_ecriture, code_journal: l.code_journal,
        montant_debit: l.montant_debit, montant_credit: l.montant_credit,
        solde_apres: gl[l.numero_compte].solde_progressif
      });
    });
    res.json({ ok: true, grand_livre: Object.values(gl) });
  } catch (e) {
    console.error("❌ ERREUR GRAND LIVRE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ⚖️ BILAN
// ==================================================
router.get('/bilan', protegerLecture, async (req, res) => {
  try {
    const { annee } = req.query;
    const filtre = annee ? `AND EXTRACT(YEAR FROM e.date_ecriture)=$1` : '';
    const params = annee ? [annee] : [];

    const r = await pool.query(`
      SELECT p.classe, p.numero_compte, p.libelle, p.type_compte, p.sens,
             SUM(CASE WHEN p.sens='D' THEN l.montant_debit-l.montant_credit
                      ELSE l.montant_credit-l.montant_debit END) AS solde
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      WHERE e.statut='valide' AND p.type_compte IN ('actif','passif') ${filtre}
      GROUP BY p.classe, p.numero_compte, p.libelle, p.type_compte, p.sens
      ORDER BY p.numero_compte
    `, params);

    const actif = [], passif = [];
    let totActif = 0, totPassif = 0;
    r.rows.forEach(c => {
      const s = parseFloat(c.solde || 0);
      if (c.type_compte === 'actif' && s > 0) { actif.push(c); totActif += s; }
      else if (c.type_compte === 'passif' && s > 0) { passif.push(c); totPassif += s; }
    });
    res.json({ ok: true, actif, passif, totActif, totPassif, ecart: totActif - totPassif });
  } catch (e) {
    console.error("❌ ERREUR BILAN :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📈 COMPTE DE RÉSULTAT
// ==================================================
router.get('/resultat', protegerLecture, async (req, res) => {
  try {
    const { annee } = req.query;
    const filtre = annee ? `AND EXTRACT(YEAR FROM e.date_ecriture)=$1` : '';
    const params = annee ? [annee] : [];

    const r = await pool.query(`
      SELECT p.classe, p.numero_compte, p.libelle, p.type_compte,
             SUM(CASE WHEN p.type_compte='charge' THEN l.montant_debit-l.montant_credit
                      ELSE l.montant_credit-l.montant_debit END) AS solde
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      WHERE e.statut='valide' AND p.type_compte IN ('charge','produit') ${filtre}
      GROUP BY p.classe, p.numero_compte, p.libelle, p.type_compte
      ORDER BY p.numero_compte
    `, params);

    const charges = [], produits = [];
    let totCharges = 0, totProduits = 0;
    r.rows.forEach(c => {
      const s = parseFloat(c.solde || 0);
      if (c.type_compte === 'charge' && s > 0) { charges.push(c); totCharges += s; }
      else if (c.type_compte === 'produit' && s > 0) { produits.push(c); totProduits += s; }
    });
    res.json({ ok: true, charges, produits, totCharges, totProduits, resultat: totProduits - totCharges });
  } catch (e) {
    console.error("❌ ERREUR RÉSULTAT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📅 EXERCICES COMPTABLES — Lire / Créer / Fermer
// ==================================================
router.get('/exercices', protegerLecture, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM exercices_comptables ORDER BY annee DESC');
    res.json({ ok: true, exercices: r.rows });
  } catch (e) {
    console.error("❌ ERREUR EXERCICES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

router.post('/exercices/creer', protegerAdminSeul, async (req, res) => {
  try {
    const { annee, date_debut, date_fin } = req.body;
    if (!annee || !date_debut || !date_fin)
      return res.json({ ok: false, erreur: "⚠️ Année, date début et date fin obligatoires" });

    const r = await pool.query(`
      INSERT INTO exercices_comptables (annee, date_debut, date_fin, statut)
      VALUES ($1, $2, $3, 'ouvert') RETURNING *
    `, [annee, date_debut, date_fin]);

    res.json({ ok: true, exercice: r.rows[0], message: "✅ Exercice créé et ouvert" });
  } catch (e) {
    console.error("❌ ERREUR CRÉATION EXERCICE :", e.message);
    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Cet exercice existe déjà" });
    res.json({ ok: false, erreur: e.message });
  }
});

router.post('/exercices/fermer/:annee', protegerAdminSeul, async (req, res) => {
  try {
    const annee = parseInt(req.params.annee);
    if (isNaN(annee))
      return res.json({ ok: false, erreur: "⚠️ Année invalide" });

    const r = await pool.query(`
      UPDATE exercices_comptables
      SET statut='ferme', date_fermeture=NOW()
      WHERE annee=$1 AND statut='ouvert' RETURNING *
    `, [annee]);

    if (!r.rows.length)
      return res.json({ ok: false, erreur: "⚠️ Exercice introuvable ou déjà fermé" });

    res.json({ ok: true, exercice: r.rows[0], message: `✅ Exercice ${annee} fermé` });
  } catch (e) {
    console.error("❌ ERREUR FERMETURE EXERCICE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;