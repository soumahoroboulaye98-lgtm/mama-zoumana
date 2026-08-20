const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');           // ✅ Ajouté systématiquement
const verifadmin = require('../middleware/verifadmin');           // ✅ Administrateur seul
const verifcomptableouadmin = require('../middleware/verifcomptableouadmin'); // ✅ Comptable ou Admin

// ✅ Protections groupées uniformes
const protegerLecture = [veriftoken, verifcomptableouadmin]; // Comptable ou Admin
const protegerEcriture = [veriftoken, verifcomptableouadmin]; // Comptable ou Admin
const protegerAdminSeul = [veriftoken, verifadmin];          // Admin uniquement


// ==================================================
// 📊 PLAN COMPTABLE — Lecture : Comptable & Admin
// ==================================================
router.get('/plan', protegerLecture, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM plan_comptable ORDER BY numero_compte');

    console.log(`✅ Plan comptable consulté — ${r.rows.length} compte(s)`);
    res.json({ ok: true, comptes: r.rows });

  } catch (e) {
    console.error("❌ ERREUR LECTURE PLAN COMPTABLE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📖 JOURNAUX — Lecture : Comptable & Admin
// ==================================================
router.get('/journaux', protegerLecture, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM journaux ORDER BY code_journal');

    console.log(`✅ Liste des journaux consultée — ${r.rows.length} journal(aux)`);
    res.json({ ok: true, journaux: r.rows });

  } catch (e) {
    console.error("❌ ERREUR LECTURE JOURNAUX :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📝 LISTE DES ÉCRITURES — Lecture : Comptable & Admin
// ==================================================
router.get('/ecritures', protegerLecture, async (req, res) => {
  try {
    const { annee, mois, statut, code_journal } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (annee) { conditions.push(`EXTRACT(YEAR FROM e.date_ecriture) = $${idx++}`); params.push(annee); }
    if (mois) { conditions.push(`EXTRACT(MONTH FROM e.date_ecriture) = $${idx++}`); params.push(mois); }
    if (statut) { conditions.push(`e.statut = $${idx++}`); params.push(statut); }
    if (code_journal) { conditions.push(`j.code_journal = $${idx++}`); params.push(code_journal); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const ecritures = await pool.query(`
      SELECT e.*, j.code_journal, j.libelle AS libelle_journal,
             u1.nom AS utilisateur_nom, u2.nom AS valideur_nom
      FROM ecritures_comptables e
      LEFT JOIN journaux j ON e.id_journal = j.id_journal
      LEFT JOIN utilisateurs u1 ON e.id_utilisateur = u1.id_utilisateur
      LEFT JOIN utilisateurs u2 ON e.id_valideur = u2.id_utilisateur
      ${where}
      ORDER BY e.date_ecriture DESC, e.numero_ecriture DESC
    `, params);

    const lignes = await pool.query(`
      SELECT l.*, e.numero_ecriture, p.libelle AS libelle_compte
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      ${where}
      ORDER BY l.id_ecriture, l.ordre_ligne
    `, params);

    console.log(`✅ Liste des écritures consultée — ${ecritures.rows.length} écriture(s)`);
    res.json({ ok: true, ecritures: ecritures.rows, lignes: lignes.rows });

  } catch (e) {
    console.error("❌ ERREUR LECTURE ÉCRITURES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ CRÉER UNE ÉCRITURE — Comptable & Admin
// ==================================================
router.post('/ecritures/enregistrer', protegerEcriture, async (req, res) => {
  try {
    const { date_ecriture, id_journal, libelle, reference, lignes } = req.body;
    const id_utilisateur = req.user.id_utilisateur;

    // Vérification de l'équilibre Débit / Crédit
    let totalDebit = 0, totalCredit = 0;
    lignes.forEach(l => {
      totalDebit += parseFloat(l.montant_debit || 0);
      totalCredit += parseFloat(l.montant_credit || 0);
    });
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.json({ ok: false, erreur: "⚠️ Écriture non équilibrée : Débit ≠ Crédit" });
    }

    // Génération automatique du numéro unique
    const annee = new Date(date_ecriture).getFullYear();
    const seq = await pool.query(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(numero_ecriture FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS prochain
      FROM ecritures_comptables WHERE numero_ecriture LIKE $1
    `, [`EC-${annee}-%`]);
    const numero = `EC-${annee}-${String(seq.rows[0].prochain).padStart(5, '0')}`;

    // Création de l'écriture
    const ecriture = await pool.query(`
      INSERT INTO ecritures_comptables
        (numero_ecriture, date_ecriture, id_journal, id_utilisateur, libelle, reference, statut)
      VALUES ($1, $2, $3, $4, $5, $6, 'brouillon')
      RETURNING id_ecriture, numero_ecriture
    `, [numero, date_ecriture, id_journal, id_utilisateur, libelle, reference]);

    const idEc = ecriture.rows[0].id_ecriture;

    // Insertion des lignes détaillées
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      await pool.query(`
        INSERT INTO lignes_ecriture
          (id_ecriture, numero_compte, libelle_ligne, montant_debit, montant_credit, ordre_ligne)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [idEc, l.numero_compte, l.libelle_ligne, l.montant_debit || 0, l.montant_credit || 0, i + 1]);
    }

    console.log(`✅ Écriture créée — Numéro: ${numero}`);
    res.json({ ok: true, numero_ecriture: numero, id_ecriture: idEc });

  } catch (e) {
    console.error("❌ ERREUR CRÉATION ÉCRITURE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✅ VALIDER UNE ÉCRITURE — Admin SEUL
// ==================================================
router.post('/ecritures/valider/:id', protegerAdminSeul, async (req, res) => {
  try {
    const id_ecriture = parseInt(req.params.id);
    if (isNaN(id_ecriture)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant d'écriture invalide" });
    }

    const r = await pool.query(`
      UPDATE ecritures_comptables
      SET statut = 'valide', date_validation = NOW(), id_valideur = $1
      WHERE id_ecriture = $2 AND statut = 'brouillon'
      RETURNING *
    `, [req.user.id_utilisateur, id_ecriture]);

    if (!r.rows.length) {
      return res.json({ ok: false, erreur: "⚠️ Écriture introuvable ou déjà validée" });
    }

    console.log(`✅ Écriture validée — ID: ${id_ecriture}`);
    res.json({ ok: true, ecriture: r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR VALIDATION ÉCRITURE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📊 BALANCE COMPTABLE — Lecture : Comptable & Admin
// ==================================================
router.get('/balance', protegerLecture, async (req, res) => {
  try {
    const { annee } = req.query;
    const r = await pool.query(`
      SELECT
        l.numero_compte,
        COALESCE(p.libelle, 'Sans libellé') AS libelle,
        COALESCE(SUM(l.montant_debit), 0) AS total_debit,
        COALESCE(SUM(l.montant_credit), 0) AS total_credit,
        CASE
          WHEN COALESCE(SUM(l.montant_debit), 0) > COALESCE(SUM(l.montant_credit), 0)
          THEN COALESCE(SUM(l.montant_debit), 0) - COALESCE(SUM(l.montant_credit), 0) ELSE 0
        END AS solde_debit,
        CASE
          WHEN COALESCE(SUM(l.montant_credit), 0) > COALESCE(SUM(l.montant_debit), 0)
          THEN COALESCE(SUM(l.montant_credit), 0) - COALESCE(SUM(l.montant_debit), 0) ELSE 0
        END AS solde_credit
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      WHERE e.statut = 'valide' ${annee ? `AND EXTRACT(YEAR FROM e.date_ecriture) = $1` : ''}
      GROUP BY l.numero_compte, p.libelle
      ORDER BY l.numero_compte
    `, annee ? [annee] : []);

    console.log(`✅ Balance comptable consultée — ${annee || 'Toutes années'}`);
    res.json({ ok: true, balance: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CALCUL BALANCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📖 GRAND LIVRE — Lecture : Comptable & Admin
// ==================================================
router.get('/grand-livre', protegerLecture, async (req, res) => {
  try {
    const { annee, numero_compte } = req.query;
    const conditions = [`e.statut = 'valide'`];
    const params = [];
    let idx = 1;

    if (annee) { conditions.push(`EXTRACT(YEAR FROM e.date_ecriture) = $${idx++}`); params.push(annee); }
    if (numero_compte) { conditions.push(`l.numero_compte = $${idx++}`); params.push(numero_compte); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const lignes = await pool.query(`
      SELECT
        l.numero_compte,
        COALESCE(p.libelle, 'Sans libellé') AS libelle_compte,
        e.date_ecriture,
        e.numero_ecriture,
        e.libelle AS libelle_ecriture,
        j.code_journal,
        l.montant_debit,
        l.montant_credit
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      LEFT JOIN journaux j ON e.id_journal = j.id_journal
      ${where}
      ORDER BY l.numero_compte, e.date_ecriture, e.numero_ecriture
    `, params);

    const gl = {};
    lignes.rows.forEach(l => {
      if (!gl[l.numero_compte]) {
        gl[l.numero_compte] = {
          numero_compte: l.numero_compte,
          libelle_compte: l.libelle_compte,
          cumul_debit: 0, cumul_credit: 0,
          solde_progressif: 0,
          mouvements: []
        };
      }
      gl[l.numero_compte].cumul_debit += parseFloat(l.montant_debit || 0);
      gl[l.numero_compte].cumul_credit += parseFloat(l.montant_credit || 0);
      gl[l.numero_compte].solde_progressif =
        gl[l.numero_compte].cumul_debit - gl[l.numero_compte].cumul_credit;
      gl[l.numero_compte].mouvements.push({
        date_ecriture: l.date_ecriture,
        numero_ecriture: l.numero_ecriture,
        libelle_ecriture: l.libelle_ecriture,
        code_journal: l.code_journal,
        montant_debit: l.montant_debit,
        montant_credit: l.montant_credit,
        solde_apres: gl[l.numero_compte].solde_progressif
      });
    });

    console.log(`✅ Grand livre consulté — ${annee || 'Toutes années'}, ${Object.keys(gl).length} compte(s)`);
    res.json({ ok: true, grand_livre: Object.values(gl) });

  } catch (e) {
    console.error("❌ ERREUR CALCUL GRAND LIVRE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ⚖️ BILAN — Lecture : Comptable & Admin
// ==================================================
router.get('/bilan', protegerLecture, async (req, res) => {
  try {
    const { annee } = req.query;
    const filtreAnnee = annee ? `AND EXTRACT(YEAR FROM e.date_ecriture) = $1` : '';
    const params = annee ? [annee] : [];

    const r = await pool.query(`
      SELECT
        p.classe,
        p.numero_compte,
        p.libelle,
        p.type_compte,
        p.sens,
        SUM(CASE WHEN p.sens = 'D' THEN l.montant_debit - l.montant_credit
                 ELSE l.montant_credit - l.montant_debit END) AS solde
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      WHERE e.statut = 'valide' AND p.type_compte IN ('actif', 'passif') ${filtreAnnee}
      GROUP BY p.classe, p.numero_compte, p.libelle, p.type_compte, p.sens
      ORDER BY p.numero_compte
    `, params);

    const actif = [], passif = [];
    let totActif = 0, totPassif = 0;
    r.rows.forEach(c => {
      const s = parseFloat(c.solde || 0);
      if (c.type_compte === 'actif' && s > 0) {
        actif.push(c); totActif += s;
      } else if (c.type_compte === 'passif' && s > 0) {
        passif.push(c); totPassif += s;
      }
    });

    console.log(`✅ Bilan consulté — ${annee || 'Toutes années'}, Écart: ${totActif - totPassif}`);
    res.json({ ok: true, annee: annee || 'Toutes', actif, passif, totActif, totPassif, ecart: totActif - totPassif });

  } catch (e) {
    console.error("❌ ERREUR CALCUL BILAN :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📈 COMPTE DE RÉSULTAT — Lecture : Comptable & Admin
// ==================================================
router.get('/resultat', protegerLecture, async (req, res) => {
  try {
    const { annee } = req.query;
    const filtreAnnee = annee ? `AND EXTRACT(YEAR FROM e.date_ecriture) = $1` : '';
    const params = annee ? [annee] : [];

    const r = await pool.query(`
      SELECT
        p.classe,
        p.numero_compte,
        p.libelle,
        p.type_compte,
        SUM(CASE WHEN p.type_compte = 'charge' THEN l.montant_debit - l.montant_credit
                 ELSE l.montant_credit - l.montant_debit END) AS solde
      FROM lignes_ecriture l
      JOIN ecritures_comptables e ON l.id_ecriture = e.id_ecriture
      LEFT JOIN plan_comptable p ON l.numero_compte = p.numero_compte
      WHERE e.statut = 'valide' AND p.type_compte IN ('charge', 'produit') ${filtreAnnee}
      GROUP BY p.classe, p.numero_compte, p.libelle, p.type_compte
      ORDER BY p.numero_compte
    `, params);

    const charges = [], produits = [];
    let totCharges = 0, totProduits = 0;
    r.rows.forEach(c => {
      const s = parseFloat(c.solde || 0);
      if (c.type_compte === 'charge' && s > 0) {
        charges.push(c); totCharges += s;
      } else if (c.type_compte === 'produit' && s > 0) {
        produits.push(c); totProduits += s;
      }
    });

    const resultat = totProduits - totCharges;
    console.log(`✅ Compte de résultat consulté — ${annee || 'Toutes années'}, Résultat: ${resultat}`);
    res.json({ ok: true, annee: annee || 'Toutes', charges, produits, totCharges, totProduits, resultat });

  } catch (e) {
    console.error("❌ ERREUR CALCUL RÉSULTAT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📅 EXERCICES COMPTABLES — Lecture : Comptable & Admin
// ==================================================
router.get('/exercices', protegerLecture, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM exercices_comptables ORDER BY annee DESC');

    console.log(`✅ Liste des exercices consultée — ${r.rows.length} enregistrement(s)`);
    res.json({ ok: true, exercices: r.rows });

  } catch (e) {
    console.error("❌ ERREUR LECTURE EXERCICES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ CRÉER UN EXERCICE — Admin SEUL
// ==================================================
router.post('/exercices/creer', protegerAdminSeul, async (req, res) => {
  try {
    const { annee, date_debut, date_fin } = req.body;

    const r = await pool.query(`
      INSERT INTO exercices_comptables (annee, date_debut, date_fin)
      VALUES ($1, $2, $3) RETURNING *
    `, [annee, date_debut, date_fin]);

    console.log(`✅ Exercice créé — Année: ${annee}`);
    res.json({ ok: true, exercice: r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR CRÉATION EXERCICE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🔒 CLÔTURER UN EXERCICE — Admin SEUL
// ==================================================
router.post('/exercices/cloturer/:id', protegerAdminSeul, async (req, res) => {
  try {
    const id_exercice = parseInt(req.params.id);
    if (isNaN(id_exercice)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant d'exercice invalide" });
    }
    const id_utilisateur = req.user.id_utilisateur;

    // Vérification de l'exercice
    const ex = await pool.query('SELECT * FROM exercices_comptables WHERE id_exercice = $1', [id_exercice]);
    if (!ex.rows.length) return res.json({ ok: false, erreur: "⚠️ Exercice introuvable" });
    if (ex.rows[0].statut === 'cloture') return res.json({ ok: false, erreur: "⚠️ Exercice déjà clôturé" });

    // Clôture
    await pool.query(`
      UPDATE exercices_comptables
      SET statut = 'cloture', date_cloture = NOW(), id_utilisateur_cloture = $1
      WHERE id_exercice = $2
    `, [id_utilisateur, id_exercice]);

    console.log(`✅ Exercice clôturé — ID: ${id_exercice}`);
    res.json({ ok: true, message: "✅ Exercice clôturé avec succès" });

  } catch (e) {
    console.error("❌ ERREUR CLÔTURE EXERCICE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;