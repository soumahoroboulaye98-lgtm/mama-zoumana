const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
require('dotenv').config();


// ==================================================
// ✅ CLÉ JWT UNIFIÉE — MÊME VALEUR PARTOUT
// ==================================================
const CLE_JWT = process.env.JWT_SECRET || 'ma_cle_secrete_pour_le_site_2026';


// ==================================================
// ✅ MIDDLEWARES IMPORTÉS
// ==================================================
const veriftoken = require('../middleware/veriftoken');


// ✅ Middleware interne de vérification du parent
function verifParent(req, res, next) {
  try {
    const u = req.user;
    if (u.role !== 'parent') {
      return res.json({ ok: false, erreur: "⛔ Espace réservé aux parents" });
    }
    req.filtreParent = {
      email_parent: u.email_parent || null,
      telephone_parent: u.telephone_parent || null
    };
    next();
  } catch {
    return res.json({ ok: false, erreur: "⛔ Session invalide" });
  }
}
const protegerParent = [veriftoken, verifParent];


// ==================================================
// ✅ FONCTION CONTRÔLE D'ACCÈS À UN ENFANT
// ==================================================
async function verifierAppartenanceEnfant(id_eleve, filtre, pool) {
  const r = await pool.query(`
    SELECT u.id, u.nom, u.prenom, u.matricule, u.id_classe, u.statut_compte,
           c.libelle_classe
    FROM utilisateurs u
    LEFT JOIN classes c ON u.id_classe = c.id_classe
    WHERE u.role = 'eleve' AND u.id = $1
      AND (
        (LOWER(u.email_parent) = LOWER($2) AND $2 <> '')
        OR (REPLACE(u.telephone_parent, ' ', '') = REPLACE($3, ' ', '') AND $3 <> '')
      )
    LIMIT 1
  `, [id_eleve, filtre.email_parent || '', filtre.telephone_parent || '']);
  return r.rows.length ? r.rows[0] : null;
}


// ==================================================
// 👶 1. LISTE DES ENFANTS — GET /mes-enfants
// ==================================================
router.get('/mes-enfants', protegerParent, async (req, res) => {
  try {
    const { email_parent, telephone_parent } = req.filtreParent;

    const r = await pool.query(`
      SELECT u.id, u.nom, u.prenom, u.matricule, u.id_classe, u.statut_compte,
             c.libelle_classe
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve'
        AND (
          (LOWER(u.email_parent) = LOWER($1) AND $1 <> '')
          OR (REPLACE(u.telephone_parent, ' ', '') = REPLACE($2, ' ', '') AND $2 <> '')
        )
      ORDER BY u.prenom, u.nom
    `, [email_parent || '', telephone_parent || '']);

    console.log(`✅ mes-enfants : ${r.rows.length} élève(s) trouvé(s)`);
    res.json({ ok: true, enfants: r.rows });

  } catch (e) {
    console.error("❌ ERREUR mes-enfants :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📝 2. NOTES PAR TRIMESTRE — GET /notes/:id_eleve?trimestre=
// ==================================================
router.get('/notes/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const trimestre = req.query.trimestre || '1';
    const filtre = req.filtreParent;

    // ✅ Vérifie que l'enfant appartient bien au parent
    const enfant = await verifierAppartenanceEnfant(id_eleve, filtre, pool);
    if (!enfant) {
      return res.json({ ok: false, erreur: "⛔ Accès refusé — Cet enfant ne vous appartient pas." });
    }

    // ✅ Récupère les notes avec les matières
    const r = await pool.query(`
      SELECT n.id, n.trimestre, n.note1, n.note2, n.note3, n.moyenne,
             m.libelle_matiere, m.coefficient
      FROM notes n
      LEFT JOIN matieres m ON n.id_matiere = m.id_matiere
      WHERE n.id_eleve = $1 AND n.trimestre = $2
      ORDER BY m.libelle_matiere
    `, [id_eleve, trimestre]);

    // ✅ Calcul moyenne générale et mention
    const notesValides = r.rows.filter(n => n.moyenne !== null && n.moyenne !== '');
    const valeurs = notesValides.map(n => parseFloat(n.moyenne));
    const moyenne_generale = valeurs.length
      ? (valeurs.reduce((a, b) => a + b, 0) / valeurs.length).toFixed(2)
      : null;

    let mention = '';
    if (moyenne_generale >= 18) mention = '🏆 EXCELLENT';
    else if (moyenne_generale >= 16) mention = '⭐ TRÈS BIEN';
    else if (moyenne_generale >= 14) mention = '✅ BIEN';
    else if (moyenne_generale >= 12) mention = '📝 ASSEZ BIEN';
    else if (moyenne_generale >= 10) mention = '🟡 PASSABLE';
    else if (moyenne_generale) mention = '🔴 INSUFFISANT';

    console.log(`✅ notes/${id_eleve} Trimestre ${trimestre} — ${r.rows.length} notes`);
    res.json({ ok: true, notes: r.rows, moyenne_generale, mention });

  } catch (e) {
    console.error("❌ ERREUR notes :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📚 3. BULLETINS 3 DERNIÈRES ANNÉES — GET /bulletins/:id_eleve
// ==================================================
router.get('/bulletins/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const filtre = req.filtreParent;

    // ✅ Vérifie appartenance
    const enfant = await verifierAppartenanceEnfant(id_eleve, filtre, pool);
    if (!enfant) {
      return res.json({ ok: false, erreur: "⛔ Accès refusé" });
    }

    // ✅ Récupère les bulletins (3 dernières années)
    const r = await pool.query(`
      SELECT annee_scolaire, moyenne, mention, rang, note_conduite
      FROM bulletins
      WHERE id_eleve = $1
      ORDER BY annee_scolaire DESC
      LIMIT 3
    `, [id_eleve]);

    console.log(`✅ bulletins/${id_eleve} — ${r.rows.length} année(s)`);
    res.json({ ok: true, bulletins: r.rows });

  } catch (e) {
    console.error("❌ ERREUR bulletins :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📅 4. EMPLOI DU TEMPS — GET /edt/:id_eleve
// ==================================================
router.get('/edt/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const filtre = req.filtreParent;

    // ✅ Vérifie appartenance et récupère la classe de l'élève
    const enfant = await verifierAppartenanceEnfant(id_eleve, filtre, pool);
    if (!enfant || !enfant.id_classe) {
      return res.json({ ok: false, erreur: enfant ? "ℹ️ Classe non définie" : "⛔ Accès refusé" });
    }

    // ✅ Récupère l'emploi du temps de la classe
    const r = await pool.query(`
      SELECT jour, heure_debut, heure_fin, libelle_matiere, salle
      FROM emploi
      WHERE id_classe = $1
      ORDER BY
        CASE jour
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6
        END,
        heure_debut
    `, [enfant.id_classe]);

    console.log(`✅ edt/${id_eleve} — ${r.rows.length} séance(s)`);
    res.json({ ok: true, seances: r.rows });

  } catch (e) {
    console.error("❌ ERREUR edt :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 💰 5. FRAIS & PAIEMENTS — GET /paiements/:id_eleve
// ==================================================
router.get('/paiements/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const filtre = req.filtreParent;

    // ✅ Vérifie appartenance
    const enfant = await verifierAppartenanceEnfant(id_eleve, filtre, pool);
    if (!enfant) {
      return res.json({ ok: false, erreur: "⛔ Accès refusé" });
    }

    // ✅ Synthèse globale des paiements
    const synthese = await pool.query(`
      SELECT
        COALESCE(SUM(montant_total), 0) AS totale,
        COALESCE(SUM(montant_paye), 0) AS paye,
        COALESCE(SUM(montant_total - montant_paye), 0) AS restant
      FROM frais_scolaires
      WHERE id_eleve = $1
    `, [id_eleve]);

    // ✅ Détail des frais par ligne
    const detail = await pool.query(`
      SELECT libelle, montant_total, montant_paye,
             (montant_total - montant_paye) AS reste_a_payer
      FROM frais_scolaires
      WHERE id_eleve = $1
      ORDER BY annee_scolaire DESC
    `, [id_eleve]);

    console.log(`✅ paiements/${id_eleve} — Synthèse calculée`);
    res.json({
      ok: true,
      totale: synthese.rows[0].totale,
      paye: synthese.rows[0].paye,
      restant: synthese.rows[0].restant,
      frais: detail.rows
    });

  } catch (e) {
    console.error("❌ ERREUR paiements :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ℹ️ 6. INFOS COMPLÈTES ÉLÈVE — GET /eleve/:id_eleve
// ==================================================
router.get('/eleve/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const filtre = req.filtreParent;

    // ✅ Récupère toutes les infos + vérifie appartenance
    const r = await pool.query(`
      SELECT u.id, u.nom, u.prenom, u.matricule, u.date_naissance, u.adresse,
             u.nom_parent, u.telephone_parent, u.email_parent,
             u.nom_pere, u.nom_mere, u.adresse_famille,
             u.moyenne_annee_precedente, u.mention, u.rang, u.note_conduite,
             u.id_classe, u.statut_compte,
             c.libelle_classe
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve' AND u.id = $1
        AND (
          (LOWER(u.email_parent) = LOWER($2) AND $2 <> '')
          OR (REPLACE(u.telephone_parent, ' ', '') = REPLACE($3, ' ', '') AND $3 <> '')
        )
      LIMIT 1
    `, [id_eleve, filtre.email_parent || '', filtre.telephone_parent || '']);

    if (!r.rows.length) {
      return res.json({ ok: false, erreur: "⛔ Élève introuvable ou accès refusé" });
    }

    console.log(`✅ eleve/${id_eleve} — Infos complètes renvoyées`);
    res.json({ ok: true, eleve: r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR eleve :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;