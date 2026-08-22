const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();


// ✅ Middlewares importés et harmonisés
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📁 CONFIGURATION MULTER — Upload des fichiers
// ==================================================
const stockage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads/'));
  },
  filename: (req, file, cb) => {
    const nomNettoye = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, Date.now() + '-' + nomNettoye);
  }
});
const upload = multer({ storage: stockage });


// ==================================================
// 📧 FONCTION ENVOI D'EMAIL
// ==================================================
async function envoyerEmail(destinataire, sujet, messageHtml) {
  try {
    const transporteur = nodemailer.createTransport({
      service: process.env.MAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });

    await transporteur.sendMail({
      from: `"MAMA-ZOUMANA" <${process.env.MAIL_FROM || 'no-reply@mama-zoumana.ci'}>`,
      to: destinataire,
      subject: sujet,
      html: messageHtml
    });
    return true;
  } catch (erreur) {
    console.log("⚠️ Email non envoyé :", erreur.message);
    return false;
  }
}


// ==================================================
// ✅ ENREGISTRER UNE PRÉINSCRIPTION — Publique
// ==================================================
router.post('/', upload.fields([
  { name: 'photo_identite', maxCount: 1 },
  { name: 'extrait_naissance', maxCount: 1 },
  { name: 'bulletin', maxCount: 1 },
  { name: 'cv', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      profil, nom_famille, prenom, sexe, date_naissance, lieu_naissance,
      nationalite, adresse, telephone, email,
      nom_parent, telephone_parent, email_parent,
      id_classe_souhaitee, observations
    } = req.body;

    const id_classe_nombre = (id_classe_souhaitee && id_classe_souhaitee !== '' && !isNaN(Number(id_classe_souhaitee)))
      ? Number(id_classe_souhaitee)
      : null;

    // ══════════════════════════════════════════════════
    // ✅ ÉTAPE 1 : VÉRIFICATION DES PLACES DISPONIBLES (Élève seul)
    // ══════════════════════════════════════════════════
    let libelleClasse = null;
    let placesRestantes = null;
    let capaciteMax = null;
    let placesOccupeesActuelles = null;

    if (profil === 'eleve' && id_classe_nombre) {
      const verifclasse = await pool.query(
        'SELECT id_classe, libelle_classe, capacite_max, places_occupees FROM classes WHERE id_classe = $1',
        [id_classe_nombre]
      );
      if (verifclasse.rows.length === 0) {
        return res.json({
          ok: false,
          erreur: "❌ Cette classe n'existe pas ! Choisissez dans la liste."
        });
      }

      libelleClasse = verifclasse.rows[0].libelle_classe;
      capaciteMax = verifclasse.rows[0].capacite_max;
      placesOccupeesActuelles = verifclasse.rows[0].places_occupees || 0;
      placesRestantes = capaciteMax - placesOccupeesActuelles;

      if (placesRestantes <= 0) {
        return res.json({
          ok: false,
          erreur: `❌ La classe ${libelleClasse} est complète ! Aucune place disponible.`
        });
      }
    }

    // ══════════════════════════════════════════════════
    // ✅ TRAITEMENT DES FICHIERS
    // ══════════════════════════════════════════════════
    const photo_identite = req.files?.photo_identite ? 'uploads/' + req.files.photo_identite[0].filename : null;
    const extrait_naissance = req.files?.extrait_naissance ? 'uploads/' + req.files.extrait_naissance[0].filename : null;
    const bulletin = req.files?.bulletin ? 'uploads/' + req.files.bulletin[0].filename : null;
    const cv = req.files?.cv ? 'uploads/' + req.files.cv[0].filename : null;

    // ══════════════════════════════════════════════════
    // ✅ ENREGISTRER LA PRÉINSCRIPTION — COLONNES CONFORMES À LA BASE
    // ══════════════════════════════════════════════════
    const resultat = await pool.query(`
      INSERT INTO preinscriptions(
        nom_famille, prenom, sexe, date_naissance, lieu_naissance,
        nationalite, adresse, telephone, email,
        nom_parent, telephone_parent, email_parent,
        id_classe_souhaitee, observations, statut, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'en_attente', CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      nom_famille, prenom, sexe, date_naissance || null, lieu_naissance || null,
      nationalite || null, adresse || null, telephone || null, email || null,
      nom_parent || null, telephone_parent || null, email_parent || null,
      id_classe_nombre || null, observations || null
    ]);

    const idDemande = resultat.rows[0].id;

    // ══════════════════════════════════════════════════
    // ✅ RÉSERVER LA PLACE (Élève seul)
    // ══════════════════════════════════════════════════
    if (profil === 'eleve' && id_classe_nombre && placesRestantes !== null) {
      const nouveauOccupees = placesOccupeesActuelles + 1;
      await pool.query(`
        UPDATE classes
        SET places_occupees = $1
        WHERE id_classe = $2
      `, [nouveauOccupees, id_classe_nombre]);
      placesRestantes = capaciteMax - nouveauOccupees;
    }

    // ══════════════════════════════════════════════════
    // ✅ EMAIL DE CONFIRMATION
    // ══════════════════════════════════════════════════
    const infoClasse = libelleClasse
      ? `🏫 Classe demandée : ${libelleClasse}<br>📊 Places restantes : <strong>${placesRestantes}</strong> place(s)`
      : '';

    const destEmail = email || email_parent;
    if (destEmail) {
      await envoyerEmail(destEmail, 'Préinscription enregistrée — MAMA-ZOUMANA', `
        <h3>✅ Demande enregistrée</h3>
        <p>Bonjour <strong>${prenom} ${nom_famille}</strong>,</p>
        <p>Nous accusons réception de votre demande de préinscription.</p>
        <p><strong>Profil :</strong> ${profil}<br>${infoClasse}</p>
        <p>Nous vous répondrons dans un délai de <strong>24 HEURES</strong> maximum.</p>
        <p>À la validation définitive, vous recevrez votre <strong>matricule</strong> et vos identifiants de connexion.</p>
        <hr><p>Établissement MAMA-ZOUMANA</p>
      `);
    }

    console.log(`✅ PRÉINSCRIPTION ENREGISTRÉE — ID: ${idDemande}, Profil: ${profil}`);

    const messageClasse = libelleClasse
      ? `\n🏫 Classe : ${libelleClasse}\n📊 Places restantes : ${placesRestantes} place(s)`
      : '';

    res.json({
      ok: true,
      message: `✅ Préinscription enregistrée !${messageClasse}\n⏳ En attente de validation par l'administration.`,
      id: idDemande,
      libelle_classe: libelleClasse,
      places_restantes: placesRestantes
    });

  } catch (e) {
    console.error("❌ ERREUR INSERTION PRÉINSCRIPTION :", e.message);
    res.json({
      ok: false,
      erreur: e.message.includes('unique constraint')
        ? '❌ Cet email est déjà utilisé !'
        : e.message
    });
  }
});


// ==================================================
// 📋 PRÉINSCRIPTIONS EN ATTENTE — Admin seul
// ==================================================
router.get('/en-attente', protegerAdmin, async (req, res) => {
  try {
    const liste = await pool.query(`
      SELECT
        id, nom_famille, prenom, email, telephone,
        nom_parent, telephone_parent, id_classe_souhaitee, statut, date_creation
      FROM preinscriptions
      WHERE statut = 'en_attente'
      ORDER BY date_creation DESC
    `);

    console.log(`📋 DEMANDES EN ATTENTE : ${liste.rows.length}`);
    res.json({ ok: true, lignes: liste.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE EN ATTENTE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 LISTE COMPLÈTE — Admin seul
// ==================================================
router.get('/liste', protegerAdmin, async (req, res) => {
  try {
    const liste = await pool.query(`
      SELECT
        id, nom_famille, prenom, sexe, date_naissance,
        email, telephone, nom_parent, telephone_parent,
        id_classe_souhaitee, statut, date_creation
      FROM preinscriptions
      ORDER BY date_creation DESC
    `);

    const resultat = await Promise.all(liste.rows.map(async (dem) => {
      let libelleClasse = null;
      if (dem.id_classe_souhaitee) {
        try {
          const c = await pool.query('SELECT libelle_classe FROM classes WHERE id_classe = $1', [dem.id_classe_souhaitee]);
          if (c.rows.length > 0) libelleClasse = c.rows[0].libelle_classe;
        } catch {
          libelleClasse = `Classe #${dem.id_classe_souhaitee}`;
        }
      }
      return { ...dem, classe: libelleClasse };
    }));

    console.log(`📋 LISTE PRÉINSCRIPTIONS : ${resultat.length}`);
    res.json({ ok: true, liste: resultat });
  } catch (e) {
    console.error("❌ ERREUR LISTE PRÉINSCRIPTIONS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✅ VALIDER UNE DEMANDE — Admin seul
// ==================================================
router.put('/valider/:id', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const demande = await pool.query("SELECT * FROM preinscriptions WHERE id = $1", [id]);
    if (demande.rows.length === 0) {
      return res.json({ ok: false, erreur: "❌ Demande introuvable !" });
    }
    const d = demande.rows[0];

    // Déterminer le profil à partir des informations saisies
    let profil = 'visiteur';
    if (d.nom_parent && d.nom_famille) profil = 'parent';
    else if (d.id_classe_souhaitee) profil = 'eleve';

    const prefixe = profil === 'eleve' ? 'ELV'
      : profil === 'prof' ? 'ENS'
      : profil === 'parent' ? 'PAR' : 'VIS';
    const annee = new Date().getFullYear();
    const compteur = String(d.id).padStart(5, '0');
    const matricule = `${prefixe}-${annee}-${compteur}`;

    const motDePasseProvisoire = Math.random().toString(36).substring(2, 10).toUpperCase() + '@1A';
    const hashMdp = await bcrypt.hash(motDePasseProvisoire, 10);

    // Mise à jour du statut
    await pool.query(`
      UPDATE preinscriptions
      SET statut = 'valide'
      WHERE id = $1
    `, [id]);

    // Création compte utilisateur
    await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenom, email, telephone, mot_de_passe,
        role, matricule, id_classe, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    `, [
      d.nom_famille, d.prenom, d.email || d.email_parent, d.telephone || d.telephone_parent, hashMdp,
      profil, matricule, d.id_classe_souhaitee || null
    ]);

    // 📧 Email de validation
    const destEmail = d.email || d.email_parent;
    if (destEmail) {
      const htmlMail = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; background: #f0f9ff; padding: 20px; }
          .boite { background: white; padding: 25px; border-radius: 12px; border: 3px solid #f59e0b; max-width: 500px; }
          h2 { color: #0c4a6e; text-align: center; }
          .info { background: #f8fafc; padding: 12px; margin: 8px 0; border-radius: 8px; border-left: 4px solid #0369a1; }
          .important { background: #fffbeb; border-left: 4px solid #f59e0b; font-weight: bold; }
          .succes { background: #f0fdf4; border-left: 4px solid #10b981; }
          code { background: #e2e8f0; padding: 4px 10px; border-radius: 4px; font-size: 16px; color: #0c4a6e; }
        </style>
      </head>
      <body>
        <div class="boite">
          <h2>✅ INSCRIPTION VALIDÉE</h2>
          <p>Bonjour <strong>${d.prenom} ${d.nom_famille}</strong>,</p>
          <p>Votre demande de préinscription a été validée avec succès !</p>
          <div class="info">📋 <strong>Matricule :</strong><br><code>${matricule}</code></div>
          <div class="info important">🔑 <strong>Mot de passe provisoire :</strong><br><code>${motDePasseProvisoire}</code></div>
          <div class="info">👤 <strong>Profil :</strong> ${profil.toUpperCase()}<br>📧 <strong>Email de connexion :</strong> ${destEmail}</div>
          <p style="color:#ef4444; font-weight:bold; margin-top:20px;">
            ⚠️ Connectez-vous puis modifiez votre mot de passe provisoire.
          </p>
          <hr><p style="text-align:center; color:#64748b;">Établissement MAMA-ZOUMANA — ${new Date().getFullYear()}</p>
        </div>
      </body>
      </html>
      `;
      await envoyerEmail(destEmail, '✅ INSCRIPTION VALIDÉE — MAMA-ZOUMANA', htmlMail);
    }

    console.log(`✅ PRÉINSCRIPTION VALIDÉE — ID: ${id}, Matricule: ${matricule}`);
    res.json({ ok: true, message: "✅ Inscription validée ! Compte créé et email envoyé." });

  } catch (e) {
    console.error("❌ ERREUR VALIDATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ REFUSER UNE DEMANDE — Admin seul
// ==================================================
router.put('/refuser/:id', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const demande = await pool.query("SELECT id_classe_souhaitee FROM preinscriptions WHERE id = $1", [id]);
    if (demande.rows.length === 0) {
      return res.json({ ok: false, erreur: "❌ Demande introuvable !" });
    }

    const idClasse = demande.rows[0].id_classe_souhaitee;

    // ✅ RENDRE LA PLACE DISPONIBLE (si élève)
    if (idClasse) {
      await pool.query(`
        UPDATE classes
        SET places_occupees = GREATEST(0, places_occupees - 1)
        WHERE id_classe = $1
      `, [idClasse]);
    }

    await pool.query(`UPDATE preinscriptions SET statut = 'refusee' WHERE id = $1`, [id]);

    console.log(`🗑️ PRÉINSCRIPTION REFUSÉE — ID: ${id}, Classe: ${idClasse || 'aucune'}`);
    res.json({ ok: true, message: "✅ Demande refusée. Place rendue disponible dans la classe." });

  } catch (e) {
    console.error("❌ ERREUR REFUS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🔍 DÉTAILS D'UNE PRÉINSCRIPTION — Admin seul
// ==================================================
router.get('/detail/:id', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom_famille, prenom, sexe, date_naissance,
             email, telephone, nom_parent, telephone_parent,
             id_classe_souhaitee, statut, date_creation
      FROM preinscriptions WHERE id = $1
    `, [req.params.id]);

    if (r.rows.length === 0) return res.json({ ok: false, erreur: "Préinscription introuvable" });

    const d = r.rows[0];
    let nomClasse = null;
    if (d.id_classe_souhaitee) {
      const c = await pool.query('SELECT libelle_classe FROM classes WHERE id_classe = $1', [d.id_classe_souhaitee]);
      if (c.rows.length > 0) nomClasse = c.rows[0].libelle_classe;
    }

    console.log(`🔍 DÉTAIL PRÉINSCRIPTION — ID: ${req.params.id}`);
    res.json({ ok: true, demande: { ...d, classe: nomClasse } });

  } catch (e) {
    console.error("❌ ERREUR DÉTAIL :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;