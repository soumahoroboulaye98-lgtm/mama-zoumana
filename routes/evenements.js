const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté systématiquement
const verifadmin = require('../middleware/verifadmin');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ✅ Protection groupée uniforme pour les routes d'administration
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📧 CONFIGURATION E-MAIL — PRÉSERVÉE
// ==================================================
const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});


// ==================================================
// ⏳ CALCUL JOURS RESTANTS
// ==================================================
function calculJoursRestants(dateEvenement) {
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const evt = new Date(dateEvenement);
  evt.setHours(0, 0, 0, 0);
  return Math.ceil((evt - aujourdhui) / (1000 * 60 * 60 * 24));
}


// ==================================================
// 🔔 NIVEAU D'AVERTISSEMENT — TRILINGUE
// ==================================================
function getAvertissement(jours) {
  if (jours === 5) return { niveau: "J-5", couleur: "#f59e0b", texte: { fr: "🟡 Dans 5 jours", en: "🟡 In 5 days", ar: "🟡 خلال 5 أيام" } };
  if (jours === 4) return { niveau: "J-4", couleur: "#fb923c", texte: { fr: "🟠 Dans 4 jours", en: "🟠 In 4 days", ar: "🟠 خلال 4 أيام" } };
  if (jours === 3) return { niveau: "J-3", couleur: "#f97316", texte: { fr: "🟠 Dans 3 jours", en: "🟠 In 3 days", ar: "🟠 خلال 3 أيام" } };
  if (jours === 2) return { niveau: "J-2", couleur: "#ef4444", texte: { fr: "🔴 Dans 2 jours", en: "🔴 In 2 days", ar: "🔴 خلال يومين" } };
  if (jours === 1) return { niveau: "J-1", couleur: "#dc2626", texte: { fr: "🔴 Demain", en: "🔴 Tomorrow", ar: "🔴 غداً" } };
  if (jours === 0) return { niveau: "JOUR J", couleur: "#b91c1c", texte: { fr: "⚠️ AUJOURD'HUI", en: "⚠️ TODAY", ar: "⚠️ اليوم" } };
  if (jours < 0) return { niveau: "Passé", couleur: "#94a3b8", texte: { fr: "✅ Terminé", en: "✅ Past", ar: "✅ انتهى" } };
  return { niveau: `${jours}j`, couleur: "#6b7280", texte: { fr: `📅 Dans ${jours} jours`, en: `📅 In ${jours} days`, ar: `📅 خلال ${jours} يوماً` } };
}


// ==================================================
// 📧 ENVOIE NOTIFICATIONS PAR E-MAIL — TRILINGUE
// ==================================================
async function notifierDestinataires(evt, avertissement) {
  const {
    date_evenement, heure_evenement, lieu,
    titre_fr, titre_en, titre_ar,
    description_fr, description_en, description_ar
  } = evt;

  const r = await pool.query(
    "SELECT email, nom, COALESCE(langue, 'fr') AS langue FROM utilisateurs WHERE statut_compte = 'valide'"
  );
  const listeUsers = r.rows;

  for (const u of listeUsers) {
    try {
      const langueUser = u.langue || 'fr';
      const titre = evt[`titre_${langueUser}`] || titre_fr;
      const description = evt[`description_${langueUser}`] || description_fr || '';

      await transport.sendMail({
        from: process.env.MAIL_USER,
        to: u.email,
        subject: `${avertissement.texte[langueUser]} — ${titre}`,
        html: `
          <div style="border-left:4px solid ${avertissement.couleur}; padding:15px; background:#fffbeb; border-radius:12px;">
            <h3 style="color:${avertissement.couleur}; margin-top:0;">${avertissement.texte[langueUser]}</h3>
            <h4 style="color:#0f172a; margin:10px 0;">${titre}</h4>
            <p><strong>📅 Date :</strong> ${new Date(date_evenement).toLocaleDateString('fr-FR')}</p>
            ${heure_evenement ? `<p><strong>⏰ Heure :</strong> ${heure_evenement}</p>` : ''}
            ${lieu ? `<p><strong>📍 Lieu :</strong> ${lieu}</p>` : ''}
            ${description ? `<p><strong>ℹ️ Détails :</strong><br>${description}</p>` : ''}
            <hr style="border:none; border-top:1px solid #f59e0b33; margin:15px 0;">
            <p style="color:#78716c; font-size:0.9em;">— 🏫 MOSQUÉE MEITE MOUHAMAD</p>
          </div>
        `
      });
      console.log(`✅ E-mail envoyé à : ${u.email} [${langueUser}]`);
    } catch (e) {
      console.log(`❌ Échec envoi e-mail à ${u.email} : ${e.message}`);
    }
  }
}


// ==================================================
// 🔔 VÉRIFIER & ENVOYER LES NOTIFICATIONS
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.get('/verifier-notifications', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM evenements ORDER BY date_evenement');
    const traites = [];

    for (const evt of r.rows) {
      const jours = calculJoursRestants(evt.date_evenement);
      const notif = evt.notification_envoyee || {};
      let envoyer = false;
      let etape = '';

      if (jours === 5 && !notif.j5) { notif.j5 = true; envoyer = true; etape = 'J-5'; }
      else if (jours === 4 && !notif.j4) { notif.j4 = true; envoyer = true; etape = 'J-4'; }
      else if (jours === 3 && !notif.j3) { notif.j3 = true; envoyer = true; etape = 'J-3'; }
      else if (jours === 2 && !notif.j2) { notif.j2 = true; envoyer = true; etape = 'J-2'; }
      else if (jours === 1 && !notif.j1) { notif.j1 = true; envoyer = true; etape = 'J-1'; }
      else if (jours === 0 && !notif.jourJ) { notif.jourJ = true; envoyer = true; etape = 'Jour J'; }

      if (envoyer) {
        const avert = getAvertissement(jours);
        await notifierDestinataires(evt, avert);
        await pool.query(
          'UPDATE evenements SET notification_envoyee = $1 WHERE id_evenement = $2',
          [JSON.stringify(notif), evt.id_evenement]
        );
        traites.push({ id_evenement: evt.id_evenement, etape, avertissement: avert.texte.fr });
      }
    }

    console.log(`✅ Vérification notifications terminée — ${traites.length} notification(s) envoyée(s)`);
    res.json({ ok: true, traites });

  } catch (e) {
    console.error("❌ ERREUR TRAITEMENT NOTIFICATIONS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 LISTER LES ÉVÉNEMENTS — Publique
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout, type_fr, rentree, annee_scolaire } = req.query;
    let conditions = [];
    let valeurs = [];

    // Par défaut : seulement publiés et à venir
    if (tout !== '1') {
      conditions.push('est_publie = true');
      conditions.push('date_evenement >= CURRENT_DATE');
    }

    if (type_fr) {
      valeurs.push(type_fr);
      conditions.push(`type_fr = $${valeurs.length}`);
    }

    if (rentree === '1' || rentree === 'true') {
      conditions.push('rentree = true');
    }

    if (annee_scolaire) {
      valeurs.push(annee_scolaire);
      conditions.push(`annee_scolaire = $${valeurs.length}`);
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT * FROM evenements
      ${clauseWhere}
      ORDER BY date_evenement ASC
    `, valeurs);

    const liste = r.rows.map(evt => {
      const jours = calculJoursRestants(evt.date_evenement);
      return {
        ...evt,
        jours_restants: jours,
        avertissement: getAvertissement(jours)
      };
    });

    console.log(`✅ Liste événements renvoyée — ${liste.length} élément(s)`);
    res.json({ ok: true, evenements: liste });

  } catch (e) {
    console.error("❌ ERREUR LISTE ÉVÉNEMENTS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UN ÉVÉNEMENT
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.post('/ajouter', protegerAdmin, async (req, res) => {
  try {
    const id_utilisateur = req.user?.id_utilisateur;
    const {
      titre_fr, titre_en, titre_ar,
      description_fr, description_en, description_ar,
      date_evenement, heure_evenement, lieu,
      type_fr, type_en, type_ar,
      url_image, url_video, cible, est_publie,
      rentree, annee_scolaire
    } = req.body;

    if (!titre_fr || !date_evenement) {
      return res.json({
        ok: false,
        erreur: "Le titre en français et la date sont obligatoires"
      });
    }

    const r = await pool.query(`
      INSERT INTO evenements(
        titre_fr, titre_en, titre_ar,
        description_fr, description_en, description_ar,
        date_evenement, heure_evenement, lieu,
        type_fr, type_en, type_ar,
        url_image, url_video, cible, est_publie,
        rentree, annee_scolaire, id_utilisateur, date_creation,
        notification_envoyee
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),'{}'::jsonb)
      RETURNING *
    `, [
      titre_fr, titre_en || null, titre_ar || null,
      description_fr || null, description_en || null, description_ar || null,
      date_evenement, heure_evenement || null, lieu || null,
      type_fr || 'Général', type_en || 'General', type_ar || 'عام',
      url_image || null, url_video || null, cible || 'Tous', est_publie !== false,
      rentree === true, annee_scolaire || null, id_utilisateur
    ]);

    console.log(`✅ Événement créé — ID: ${r.rows[0].id_evenement}, ${titre_fr}`);
    res.json({ ok: true, evenement: r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR CRÉATION ÉVÉNEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UN ÉVÉNEMENT
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.put('/:id_evenement', protegerAdmin, async (req, res) => {
  try {
    const id_evenement = parseInt(req.params.id_evenement);
    if (isNaN(id_evenement)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const {
      titre_fr, titre_en, titre_ar,
      description_fr, description_en, description_ar,
      date_evenement, heure_evenement, lieu,
      type_fr, type_en, type_ar,
      url_image, url_video, cible, est_publie,
      rentree, annee_scolaire
    } = req.body;

    if (!titre_fr || !date_evenement) {
      return res.json({
        ok: false,
        erreur: "Le titre en français et la date sont obligatoires"
      });
    }

    const r = await pool.query(`
      UPDATE evenements SET
        titre_fr=$2, titre_en=$3, titre_ar=$4,
        description_fr=$5, description_en=$6, description_ar=$7,
        date_evenement=$8, heure_evenement=$9, lieu=$10,
        type_fr=$11, type_en=$12, type_ar=$13,
        url_image=$14, url_video=$15, cible=$16, est_publie=$17,
        rentree=$18, annee_scolaire=$19
      WHERE id_evenement=$1 RETURNING *
    `, [
      id_evenement,
      titre_fr, titre_en || null, titre_ar || null,
      description_fr || null, description_en || null, description_ar || null,
      date_evenement, heure_evenement || null, lieu || null,
      type_fr || 'Général', type_en || 'General', type_ar || 'عام',
      url_image || null, url_video || null, cible || 'Tous', est_publie,
      rentree === true, annee_scolaire || null
    ]);

    if (r.rows.length) {
      console.log(`✅ Événement modifié — ID: ${id_evenement}`);
      res.json({ ok: true, evenement: r.rows[0] });
    } else {
      res.json({ ok: false, erreur: "Événement introuvable" });
    }

  } catch (e) {
    console.error("❌ ERREUR MODIFICATION ÉVÉNEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UN ÉVÉNEMENT
// 🔒 Réservé : Administrateur uniquement
// ==================================================
router.delete('/:id_evenement', protegerAdmin, async (req, res) => {
  try {
    const id_evenement = parseInt(req.params.id_evenement);
    if (isNaN(id_evenement)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM evenements WHERE id_evenement=$1 RETURNING *',
      [id_evenement]
    );

    if (r.rows.length) {
      console.log(`🗑️ Événement supprimé — ID: ${id_evenement}`);
      res.json({ ok: true });
    } else {
      res.json({ ok: false, erreur: "Événement introuvable" });
    }

  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION ÉVÉNEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;