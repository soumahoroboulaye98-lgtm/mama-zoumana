const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Vérification JWT
const verifadmin = require('../middleware/verifadmin');   // ✅ Vérification Admin

// ✅ Protections groupées uniformes
const protegerAdmin = [veriftoken, verifadmin];
const protegerAuth = [veriftoken]; // Token seul pour l'espace utilisateur

// ==================================================
// 🛡️ FONCTIONS UTILITAIRES — Robustesse
// ==================================================
function validerMethode(methode) {
  const valides = ['especes','cheque','virement','wave','carte','orange','mtn','moov','caisse'];
  return valides.includes(methode?.toLowerCase());
}
function validerStatut(statut) {
  const valides = ['en_attente','partiel','paye','annule','refuse'];
  return valides.includes(statut?.toLowerCase());
}
function calculerStatut(montantTotal, montantPaye) {
  const du = parseFloat(montantTotal) || 0;
  const verse = parseFloat(montantPaye) || 0;
  const reste = Math.max(0, du - verse);
  let statut = 'en_attente';
  let pourcentage = 0;
  if (du > 0) {
    pourcentage = Math.round((verse / du) * 100 * 10) / 10;
    if (verse >= du) statut = 'paye';
    else if (verse > 0) statut = 'partiel';
  }
  return { montantDu: du, montantVerse: verse, montantRestant: reste, statut, pourcentage };
}

// ==================================================
// 📊 ROUTE /TOUS — Pour Tableau de Bord Admin ✅ AJOUTÉE
// → Retourne la liste simple + total des montants
// ==================================================
router.get('/tous', protegerAdmin, async (req, res) => {
  try {
    const { rows: paiements } = await pool.query(`
      SELECT p.id_paiement, p.libelle, p.montant_total, p.montant_paye, 
             p.statut, p.date_paiement, p.reference_externe
      FROM paiements p ORDER BY p.date_paiement DESC
    `);

    const { rows: [resume] } = await pool.query(`
      SELECT 
        COUNT(*) AS total_enregistrements,
        COALESCE(SUM(p.montant_total),0)::NUMERIC AS somme_totale,
        COALESCE(SUM(p.montant_paye),0)::NUMERIC AS somme_recue,
        COALESCE(SUM(p.montant_restant),0)::NUMERIC AS somme_restante
      FROM paiements p
    `);

    console.log(`✅ Paiements consultés — ${paiements.length} enregistrement(s) | Total encaissé: ${resume.somme_recue} F CFA`);
    res.json({ ok: true, lignes: paiements, resume, total: resume.somme_recue });
  } catch (e) {
    console.error("❌ ERREUR /TOUS PAIEMENTS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE COMPLÈTE + FILTRES — Admin
// ==================================================
router.get('/liste', protegerAdmin, async (req, res) => {
  try {
    const { statut, moyen, mois, annee, categorie, search } = req.query;
    let conditions = [], params = [], idx = 1;

    if (statut && validerStatut(statut)) { conditions.push(`p.statut = $${idx++}`); params.push(statut); }
    if (moyen && validerMethode(moyen)) { conditions.push(`p.moyen_paiement = $${idx++}`); params.push(moyen); }
    if (mois && annee) {
      conditions.push(`EXTRACT(MONTH FROM p.date_paiement) = $${idx}`); params.push(parseInt(mois)); idx++;
      conditions.push(`EXTRACT(YEAR FROM p.date_paiement) = $${idx}`); params.push(parseInt(annee)); idx++;
    }
    if (categorie) { conditions.push(`p.categorie = $${idx++}`); params.push(categorie); }
    if (search) { conditions.push(`(u.nom ILIKE $${idx} OR u.prenom ILIKE $${idx} OR p.reference_externe ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: paiements } = await pool.query(`
      SELECT p.*,
        CASE WHEN p.montant_total > 0 THEN ROUND((p.montant_paye / p.montant_total) * 100, 1) ELSE 0 END AS pourcentage_calcule,
        u.nom, u.prenom, u.email
      FROM paiements p
      LEFT JOIN utilisateurs u ON p.id_utilisateur = u.id
      ${where}
      ORDER BY p.date_paiement DESC, p.date_creation DESC
    `, params);

    const { rows: [resume] } = await pool.query(`
      SELECT
        COUNT(*) AS total_enregistrements,
        COALESCE(SUM(p.montant_total),0)::NUMERIC AS somme_totale,
        COALESCE(SUM(p.montant_paye),0)::NUMERIC AS somme_recue,
        COALESCE(SUM(p.montant_restant),0)::NUMERIC AS somme_restante,
        COUNT(CASE WHEN p.statut = 'paye' THEN 1 END) AS nombre_paye,
        COUNT(CASE WHEN p.statut = 'partiel' THEN 1 END) AS nombre_partiel,
        COUNT(CASE WHEN p.statut = 'en_attente' THEN 1 END) AS nombre_attente,
        COUNT(CASE WHEN p.statut = 'annule' THEN 1 END) AS nombre_annule
      FROM paiements p ${where}
    `, params);

    console.log(`✅ Liste paiements — ${paiements.length} enregistrement(s)`);
    res.json({ ok: true, lignes: paiements, resume });
  } catch (e) {
    console.error("❌ ERREUR LISTE PAIEMENTS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ➕ ENREGISTRER UN PAIEMENT — Admin
// ==================================================
router.post('/enregistrer', protegerAdmin, async (req, res) => {
  try {
    const id_admin = req.user.id;
    const {
      reference_externe, libelle, montant_total, montant_paye = 0,
      moyen_paiement, date_paiement, date_echeance,
      numero_transaction, banque_emetteur, numero_cheque,
      commentaire, categorie, id_eleve
    } = req.body;

    if (!libelle?.trim()) return res.json({ ok: false, erreur: "⚠️ Libellé obligatoire" });
    if (!montant_total || parseFloat(montant_total) <= 0) return res.json({ ok: false, erreur: "⚠️ Montant total invalide" });
    if (!moyen_paiement || !validerMethode(moyen_paiement)) return res.json({ ok: false, erreur: "⚠️ Moyen de paiement invalide" });

    const { montantDu, montantVerse, montantRestant, statut, pourcentage } = calculerStatut(montant_total, montant_paye);
    const idCible = id_eleve || id_admin;
    const ref = reference_externe || `MZ-PMT-${Date.now().toString().slice(-10)}`;

    const { rows: [nouveau] } = await pool.query(`
      INSERT INTO paiements(
        id_utilisateur, reference_externe, libelle,
        montant_total, montant_paye, montant_restant,
        statut, pourcentage_paiement,
        moyen_paiement, date_paiement, date_echeance,
        numero_transaction, banque_emetteur, numero_cheque,
        commentaire, categorie, date_creation, date_mise_a_jour
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
      RETURNING *
    `, [
      idCible, ref, libelle.trim(),
      montantDu, montantVerse, montantRestant,
      statut, pourcentage,
      moyen_paiement.toLowerCase(), date_paiement || new Date(), date_echeance || null,
      numero_transaction || null, banque_emetteur || null, numero_cheque || null,
      commentaire || null, categorie || 'frais_scolaires'
    ]);

    console.log(`✅ Paiement enregistré — Réf: ${ref} | ${statut} | ${montantVerse}/${montantDu} F CFA`);
    res.json({ ok: true, message: "✅ Paiement enregistré", paiement: nouveau });
  } catch (e) {
    console.error("❌ ERREUR ENREGISTREMENT :", e.code, e.message);
    if (e.code === '23505') return res.json({ ok: false, erreur: "⚠️ Référence déjà utilisée" });
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ AJOUTER UN VERSEMENT — Admin
// ==================================================
router.put('/ajouter-versement/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { montant_paye, commentaire, numero_transaction } = req.body;
    const ajoute = parseFloat(montant_paye) || 0;
    if (ajoute <= 0) return res.json({ ok: false, erreur: "⚠️ Montant du versement invalide" });

    const { rows: [ancien] } = await pool.query(
      'SELECT montant_total, montant_paye, statut FROM paiements WHERE id_paiement = $1', [id]
    );
    if (!ancien) return res.json({ ok: false, erreur: "⚠️ Paiement introuvable" });
    if (ancien.statut === 'paye') return res.json({ ok: false, erreur: "⚠️ Paiement déjà soldé" });

    const { montantDu, montantVerse, montantRestant, statut, pourcentage } = calculerStatut(ancien.montant_total, ancien.montant_paye + ajoute);
    const nouvelleNote = `\n— Versement du ${new Date().toLocaleDateString('fr-FR')} : ${ajoute} F CFA${commentaire ? ` | ${commentaire}` : ''}`;

    const { rows: [maj] } = await pool.query(`
      UPDATE paiements SET
        montant_paye = $1, montant_restant = $2, statut = $3, pourcentage_paiement = $4,
        commentaire = CONCAT(COALESCE(commentaire, ''), $5),
        numero_transaction = COALESCE($6, numero_transaction), date_mise_a_jour = NOW()
      WHERE id_paiement = $7 RETURNING *
    `, [montantVerse, montantRestant, statut, pourcentage, nouvelleNote, numero_transaction || null, id]);

    console.log(`✅ Versement ajouté — ID: ${id} | ${ajoute} F CFA | Nouveau statut: ${statut}`);
    res.json({ ok: true, message: "✅ Versement enregistré", paiement: maj });
  } catch (e) {
    console.error("❌ ERREUR VERSEMENT :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UN PAIEMENT — Admin
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const {
      reference_externe, libelle, montant_total, montant_paye,
      moyen_paiement, date_paiement, date_echeance,
      numero_transaction, banque_emetteur, numero_cheque,
      commentaire, categorie, statut
    } = req.body;

    const { rows: [ancien] } = await pool.query('SELECT * FROM paiements WHERE id_paiement = $1', [id]);
    if (!ancien) return res.json({ ok: false, erreur: "⚠️ Paiement introuvable" });

    const calcul = calculerStatut(montant_total || ancien.montant_total, montant_paye ?? ancien.montant_paye);
    const nouveauStatut = validerStatut(statut) ? statut : calcul.statut;
    const methode = moyen_paiement ? (validerMethode(moyen_paiement) ? moyen_paiement.toLowerCase() : ancien.moyen_paiement) : ancien.moyen_paiement;

    const { rows: [maj] } = await pool.query(`
      UPDATE paiements SET
        reference_externe = COALESCE($1, reference_externe),
        libelle = COALESCE($2, libelle),
        montant_total = $3, montant_paye = $4, montant_restant = $5,
        statut = $6, pourcentage_paiement = $7, moyen_paiement = $8,
        date_paiement = COALESCE($9, date_paiement), date_echeance = COALESCE($10, date_echeance),
        numero_transaction = COALESCE($11, numero_transaction),
        banque_emetteur = COALESCE($12, banque_emetteur),
        numero_cheque = COALESCE($13, numero_cheque),
        commentaire = COALESCE($14, commentaire),
        categorie = COALESCE($15, categorie), date_mise_a_jour = NOW()
      WHERE id_paiement = $16 RETURNING *
    `, [
      reference_externe, libelle?.trim(),
      calcul.montantDu, calcul.montantVerse, calcul.montantRestant,
      nouveauStatut, calcul.pourcentage, methode,
      date_paiement, date_echeance, numero_transaction,
      banque_emetteur, numero_cheque, commentaire, categorie, id
    ]);

    console.log(`✅ Paiement modifié — ID: ${id}`);
    res.json({ ok: true, message: "✅ Paiement mis à jour", paiement: maj });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER UN PAIEMENT — Admin
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rows: [suppr] } = await pool.query('DELETE FROM paiements WHERE id_paiement = $1 RETURNING *', [id]);
    if (!suppr) return res.json({ ok: false, erreur: "⚠️ Paiement introuvable" });

    console.log(`🗑️ Paiement supprimé — ID: ${id} | Réf: ${suppr.reference_externe}`);
    res.json({ ok: true, message: "✅ Paiement supprimé" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION :", e.code, e.message);
    if (e.code === '23503') return res.json({ ok: false, erreur: "⚠️ Impossible : lié à d'autres enregistrements" });
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 👤 MES PAIEMENTS — Utilisateur connecté
// ==================================================
router.get('/mes-paiements', protegerAuth, async (req, res) => {
  try {
    const id_utilisateur = req.user.id;
    if (!id_utilisateur) return res.json({ ok: false, erreur: "⚠️ Authentification requise" });

    const { statut, annee, categorie } = req.query;
    let conditions = ['p.id_utilisateur = $1'], params = [id_utilisateur], idx = 2;
    if (statut && validerStatut(statut)) { conditions.push(`p.statut = $${idx++}`); params.push(statut); }
    if (annee) { conditions.push(`EXTRACT(YEAR FROM p.date_paiement) = $${idx++}`); params.push(parseInt(annee)); }
    if (categorie) { conditions.push(`p.categorie = $${idx++}`); params.push(categorie); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows: paiements } = await pool.query(`
      SELECT p.*,
        CASE WHEN p.montant_total > 0 THEN ROUND((p.montant_paye / p.montant_total) * 100, 1) ELSE 0 END AS pourcentage_calcule
      FROM paiements p ${where} ORDER BY p.date_paiement DESC, p.date_creation DESC
    `, params);

    const { rows: [resume] } = await pool.query(`
      SELECT
        COALESCE(SUM(p.montant_total),0)::NUMERIC AS somme_totale,
        COALESCE(SUM(p.montant_paye),0)::NUMERIC AS somme_recue,
        COALESCE(SUM(p.montant_restant),0)::NUMERIC AS somme_restante
      FROM paiements p ${where}
    `, params);

    console.log(`✅ Mes paiements — Utilisateur ID: ${id_utilisateur}`);
    res.json({ ok: true, lignes: paiements, resume });
  } catch (e) {
    console.error("❌ ERREUR MES PAIEMENTS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🔓 CONSULTER UN PAIEMENT PAR RÉFÉRENCE — Publique
// ==================================================
router.get('/reference/:ref', async (req, res) => {
  try {
    const reference = req.params.ref;
    const { rows: [paiement] } = await pool.query(`
      SELECT libelle, montant_total, montant_paye, montant_restant,
             statut, moyen_paiement, date_paiement, pourcentage_paiement
      FROM paiements WHERE reference_externe = $1
    `, [reference]);

    if (!paiement) return res.json({ ok: false, erreur: "⚠️ Référence introuvable" });
    res.json({ ok: true, paiement });
  } catch (e) {
    console.error("❌ ERREUR RÉFÉRENCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;