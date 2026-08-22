const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté
const verifadmin = require('../middleware/verifadmin');    // ✅ Après le token

// ✅ Protections groupées
const protegerAdmin = [veriftoken, verifadmin];
const protegerAuth = [veriftoken]; // Seul le token suffit pour l'espace utilisateur


// ==================================================
// 📋 LISTE DES PAIEMENTS + RÉSUMÉ — Administrateur seul
// ==================================================
router.get('/liste', protegerAdmin, async (req, res) => {
  try {
    const { statut, moyen, mois, annee } = req.query;
    let conditions = [], params = [], idx = 1;

    if (statut) { conditions.push(`p.statut = $${idx++}`); params.push(statut); }
    if (moyen) { conditions.push(`p.moyen_paiement = $${idx++}`); params.push(moyen); }
    if (mois && annee) {
      conditions.push(`EXTRACT(MONTH FROM p.date_paiement) = $${idx}`); params.push(mois); idx++;
      conditions.push(`EXTRACT(YEAR FROM p.date_paiement) = $${idx}`); params.push(annee); idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT p.*,
        CASE WHEN p.montant_total > 0 THEN ROUND((p.montant_paye / p.montant_total) * 100, 1) ELSE 0 END AS pourcentage_paiement_calcule,
        u.nom, u.prenom, u.email
      FROM paiements p
      LEFT JOIN utilisateurs u ON p.id_utilisateur = u.id
      ${where}
      ORDER BY p.date_paiement DESC, p.date_creation DESC
    `, params);

    // 📊 Résumé
    const totaux = await pool.query(`
      SELECT
        COUNT(*) AS total_enregistrements,
        COALESCE(SUM(p.montant_total),0)::NUMERIC AS somme_totale,
        COALESCE(SUM(p.montant_paye),0)::NUMERIC AS somme_recue,
        COALESCE(SUM(p.montant_restant),0)::NUMERIC AS somme_restante,
        COUNT(CASE WHEN p.statut = 'paye' THEN 1 END) AS nombre_paye,
        COUNT(CASE WHEN p.statut = 'partiel' THEN 1 END) AS nombre_partiel,
        COUNT(CASE WHEN p.statut = 'en_attente' THEN 1 END) AS nombre_attente
      FROM paiements p ${where}
    `, params);

    console.log(`✅ Liste paiements chargée : ${r.rows.length} enregistrements`);
    res.json({
      ok: true,
      paiements: r.rows,
      resume: {
        somme_totale: totaux.rows[0].somme_totale,
        somme_recue: totaux.rows[0].somme_recue,
        somme_restante: totaux.rows[0].somme_restante
      }
    });
  } catch (e) {
    console.log("❌ ERREUR LISTE PAIEMENTS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ ENREGISTRER UN PAIEMENT — Administrateur seul
// ==================================================
router.post('/enregistrer', protegerAdmin, async (req, res) => {
  try {
    const id_utilisateur = req.user.id;
    const {
      reference_externe, libelle, montant_total, montant_paye = 0,
      moyen_paiement, date_paiement, date_echeance,
      numero_transaction, banque_emetteur, numero_cheque,
      commentaire, categorie, id_eleve
    } = req.body;

    // ✅ Validation
    if (!libelle || !montant_total || !moyen_paiement) {
      return res.json({ ok: false, erreur: "Libellé, montant et moyen de paiement sont obligatoires" });
    }

    const montantDu = parseFloat(montant_total) || 0;
    const montantVerse = parseFloat(montant_paye) || 0;
    const montantRestant = Math.max(0, montantDu - montantVerse);

    // ✅ Statut et pourcentage calculés automatiquement
    let statut = 'en_attente';
    let pourcentage = 0;
    if (montantDu > 0) {
      pourcentage = Math.round((montantVerse / montantDu) * 100 * 10) / 10;
      if (montantVerse >= montantDu) statut = 'paye';
      else if (montantVerse > 0) statut = 'partiel';
    }

    const r = await pool.query(`
      INSERT INTO paiements(
        id_utilisateur, reference_externe, libelle,
        montant_total, montant_paye, montant_restant,
        statut, pourcentage_paiement,
        moyen_paiement, date_paiement, date_echeance,
        numero_transaction, banque_emetteur, numero_cheque,
        commentaire, categorie, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
      RETURNING *
    `, [
      id_eleve || id_utilisateur, reference_externe || null, libelle,
      montantDu, montantVerse, montantRestant,
      statut, pourcentage,
      moyen_paiement, date_paiement || new Date(), date_echeance || null,
      numero_transaction || null, banque_emetteur || null, numero_cheque || null,
      commentaire || null, categorie || 'frais_scolaires'
    ]);

    console.log(`✅ Paiement enregistré — ID: ${r.rows[0].id_paiement}, Statut: ${statut}`);
    res.json({ ok: true, paiement: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR ENREGISTREMENT PAIEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ AJOUTER UN VERSEMENT — Administrateur seul
// ==================================================
router.put('/ajouter-versement/:id', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { montant_paye, commentaire, numero_transaction } = req.body;
    const montantAjoute = parseFloat(montant_paye) || 0;

    // Récupère le paiement existant
    const ancien = await pool.query(
      'SELECT montant_total, montant_paye FROM paiements WHERE id_paiement = $1',
      [id]
    );
    if (!ancien.rows.length) {
      return res.json({ ok: false, erreur: "Paiement introuvable" });
    }

    const montantDu = parseFloat(ancien.rows[0].montant_total);
    const nouveauPaye = parseFloat(ancien.rows[0].montant_paye) + montantAjoute;
    const nouveauRestant = Math.max(0, montantDu - nouveauPaye);

    // ✅ Nouveau statut et pourcentage recalculés
    let nouveauStatut = 'en_attente';
    let nouveauPourcentage = 0;
    if (montantDu > 0) {
      nouveauPourcentage = Math.round((nouveauPaye / montantDu) * 100 * 10) / 10;
      if (nouveauPaye >= montantDu) nouveauStatut = 'paye';
      else if (nouveauPaye > 0) nouveauStatut = 'partiel';
    }

    const r = await pool.query(`
      UPDATE paiements SET
        montant_paye = $1,
        montant_restant = $2,
        statut = $3,
        pourcentage_paiement = $4,
        commentaire = CONCAT(COALESCE(commentaire, ''), E'\n— Versement ajouté le ' || NOW()::DATE || ' : ' || $5 || ' F CFA'),
        numero_transaction = COALESCE($6, numero_transaction),
        date_mise_a_jour = NOW()
      WHERE id_paiement = $7
      RETURNING *
    `, [nouveauPaye, nouveauRestant, nouveauStatut, nouveauPourcentage, montantAjoute, numero_transaction || null, id]);

    console.log(`✅ Versement ajouté — Paiement ID: ${id}, Nouveau statut: ${nouveauStatut}`);
    res.json({ ok: true, paiement: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR AJOUT VERSEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UN PAIEMENT — Administrateur seul
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      'DELETE FROM paiements WHERE id_paiement = $1 RETURNING *',
      [req.params.id]
    );
    if (!r.rows.length) {
      return res.json({ ok: false, erreur: "Paiement introuvable" });
    }
    console.log(`🗑️ Paiement supprimé — ID: ${req.params.id}`);
    res.json({ ok: true });
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION PAIEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 👤 MES PAIEMENTS — Utilisateur connecté
// ==================================================
router.get('/mes-paiements', protegerAuth, async (req, res) => {
  try {
    const id_utilisateur = req.user?.id_utilisateur;
    if (!id_utilisateur) {
      return res.json({ ok: false, erreur: "Authentification requise" });
    }

    const { statut, annee } = req.query;
    let conditions = ['p.id_utilisateur = $1'];
    let params = [id_utilisateur];
    let idx = 2;

    if (statut) { conditions.push(`p.statut = $${idx++}`); params.push(statut); }
    if (annee) { conditions.push(`EXTRACT(YEAR FROM p.date_paiement) = $${idx++}`); params.push(annee); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const r = await pool.query(`
      SELECT p.*,
        CASE WHEN p.montant_total > 0 THEN ROUND((p.montant_paye / p.montant_total) * 100, 1) ELSE 0 END AS pourcentage_paiement_calcule
      FROM paiements p
      ${where}
      ORDER BY p.date_paiement DESC, p.date_creation DESC
    `, params);

    const totaux = await pool.query(`
      SELECT
        COALESCE(SUM(p.montant_total),0)::NUMERIC AS somme_totale,
        COALESCE(SUM(p.montant_paye),0)::NUMERIC AS somme_recue,
        COALESCE(SUM(p.montant_restant),0)::NUMERIC AS somme_restante
      FROM paiements p
      ${where}
    `, params);

    console.log(`✅ Mes paiements chargés — Utilisateur ID: ${id_utilisateur}`);
    res.json({
      ok: true,
      paiements: r.rows,
      resume: totaux.rows[0]
    });
  } catch (e) {
    console.log("❌ ERREUR LISTE UTILISATEUR :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;