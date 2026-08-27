const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ==================================================
// 🔑 CONFIGURATION GLOBALE
// ==================================================
const CLE_JWT = process.env.JWT_SECRET || 'ma_cle_secrete_pour_le_site_2026';
const dossierUpload = path.join(__dirname, '../public/uploads/');
if (!fs.existsSync(dossierUpload)) fs.mkdirSync(dossierUpload, { recursive: true });

// ==================================================
// 📦 MIDDLEWARES
// ==================================================
let veriftoken, verifadmin, protegerAdmin;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  protegerAdmin = [veriftoken, verifadmin];
} catch {
  protegerAdmin = [];
}

// ✅ Vérification appartenance parent
async function verifierAppartenanceEnfant(id_eleve, filtre) {
  const telNettoye = (filtre.telephone_parent || '').replace(/\s/g, '');
  const { rows } = await pool.query(`
    SELECT u.id_utilisateur AS id, u.nom, u.prenoms, u.matricule, u.id_classe, u.statut AS statut_compte,
           c.libelle_classe
    FROM utilisateurs u
    LEFT JOIN classes c ON u.id_classe = c.id_classe
    WHERE u.role = 'eleve' AND u.id_utilisateur = $1
      AND (
        (LOWER(u.email_parent) = LOWER($2) AND $2 <> '')
        OR (REPLACE(u.telephone_parent, ' ', '') = $3 AND $3 <> '')
      )
    LIMIT 1
  `, [id_eleve, filtre.email_parent || '', telNettoye]);
  return rows[0] || null;
}

// ✅ Middleware protection Espace Parent
async function verifParent(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'parent') {
      return res.json({ ok: false, erreur: "⛔ Espace réservé aux parents" });
    }
    req.filtreParent = {
      email_parent: req.user.email_parent || '',
      telephone_parent: req.user.telephone_parent || ''
    };
    next();
  } catch {
    return res.json({ ok: false, erreur: "⛔ Session invalide" });
  }
}
const protegerParent = protegerAdmin.length ? [veriftoken, verifParent] : [];

// ==================================================
// 📁 CONFIGURATION UPLOAD SÉCURISÉE
// ==================================================
const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dossierUpload),
  filename: (req, file, cb) => {
    const nomNettoye = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${Date.now()}-${nomNettoye}`);
  }
});
const upload = multer({ storage: stockage });

// ==================================================
// 📧 SERVICE EMAIL
// ==================================================
async function envoyerEmail(destinataire, sujet, messageHtml) {
  if (!destinataire) return false;
  try {
    const transporteur = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT || '465'),
      secure: process.env.MAIL_SECURE === 'true',
      service: process.env.MAIL_SERVICE || undefined,
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
// 🔧 UTILITAIRES
// ==================================================
// ✅ Déterminer profil
function determinerProfil(d) {
  if (d.profil) return d.profil;
  if (d.id_classe) return 'eleve';
  if (d.cv) return 'professeur';
  return 'visiteur';
}

// ✅ Générer matricule élève
async function genererMatricule(dateNaissance, anneeScolaire) {
  const anneeDebut = String(anneeScolaire || '2025-2026').slice(0, 4);
  const anneeFin = String(anneeScolaire || '2025-2026').slice(-4);
  const dateRef = new Date(`${anneeDebut}-10-01`);
  const naissance = new Date(dateNaissance);
  let age = dateRef.getFullYear() - naissance.getFullYear();
  const mois = dateRef.getMonth() - naissance.getMonth();
  if (mois < 0 || (mois === 0 && dateRef.getDate() < naissance.getDate())) age--;
  age = Math.max(5, Math.min(99, age));
  const prefixe = `MZ${anneeFin}${String(age).padStart(2, '0')}`;
  const { rows } = await pool.query(
    `SELECT matricule FROM utilisateurs WHERE matricule LIKE $1 ORDER BY matricule DESC LIMIT 1`,
    [`${prefixe}%`]
  );
  const numero = rows.length ? parseInt(rows[0].matricule.slice(-3), 10) + 1 : 1;
  return `${prefixe}${String(numero).padStart(3, '0')}`;
}

// ==================================================
// 📋 ROUTES PUBLIQUES
// ==================================================
// ➕ SOUMETTRE UNE PRÉINSCRIPTION
router.post('/', upload.fields([
  { name: 'photo_identite', maxCount: 1 },
  { name: 'extrait_naissance', maxCount: 1 },
  { name: 'bulletin', maxCount: 1 },
  { name: 'cv', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      profil, nom, prenoms, sexe, date_naissance, lieu_naissance, nationalite, adresse,
      telephone, email,
      nom_pere, profession_pere, telephone_pere, email_pere, date_naissance_pere,
      nom_mere, profession_mere, telephone_mere, email_mere, date_naissance_mere,
      telephone_parent, email_parent, responsable, adresse_famille,
      moyenne_annee_precedente, rang_annee_precedente, mention_annee_precedente, conduite,
      libelle_classe_fr, libelle_classe_ar, id_classe,
      cantine, transport, circuit_transport,
      specialite, experience, organisme, objet,
      mode_paiement, annee_scolaire, observations
    } = req.body;

    // ==================================================
    // ✅ VALIDATION DES CHAMPS OBLIGATOIRES
    // ==================================================
    const erreurs = [];

    // 🔴 OBLIGATOIRES pour TOUS
    if (!nom?.trim()) erreurs.push("• Nom est obligatoire");
    if (!prenoms?.trim()) erreurs.push("• Prénoms sont obligatoires");
    if (!profil?.trim()) erreurs.push("• Profil est obligatoire");

    // ⚠️ Au moins un moyen de contact
    const telNettoye = telephone?.replace(/\s/g, '') || '';
    const emailNettoye = email?.trim() || '';
    if (!telNettoye && !emailNettoye) {
      erreurs.push("• Au moins un moyen de contact est requis : Téléphone OU Email");
    }

    // 🔴 OBLIGATOIRE si ÉLÈVE
    const profilNettoye = profil?.trim();
    if (profilNettoye === 'eleve') {
      if (!id_classe && !libelle_classe_fr?.trim()) {
        erreurs.push("• Classe demandée est obligatoire pour un élève");
      }
      if (!date_naissance) {
        erreurs.push("• Date de naissance est obligatoire pour un élève");
      }
    }

    // 🔴 OBLIGATOIRE si PROFESSEUR
    if (profilNettoye === 'professeur') {
      if (!specialite?.trim()) {
        erreurs.push("• Spécialité est obligatoire pour un enseignant");
      }
    }

    // ✅ Valeur par défaut pour l'année scolaire
    const anneeScolaire = annee_scolaire?.trim() || '2025-2026';

    // ❌ Afficher toutes les erreurs
    if (erreurs.length > 0) {
      return res.json({
        ok: false,
        erreur: `⚠️ Veuillez compléter les champs suivants :\n${erreurs.join('\n')}`
      });
    }

    // ✅ Vérification doublon
    if (emailNettoye) {
      const { rows: existe } = await pool.query(
        `SELECT id_preinscription FROM preinscriptions WHERE LOWER(email) = LOWER($1) AND statut <> 'refusée' AND statut <> 'annulée'`,
        [emailNettoye]
      );
      if (existe.length) return res.json({ ok: false, erreur: "⚠️ Cet email est déjà utilisé pour une préinscription en cours" });
    }
    if (telNettoye) {
      const { rows: existe } = await pool.query(
        `SELECT id_preinscription FROM preinscriptions WHERE REPLACE(telephone, ' ', '') = $1 AND statut <> 'refusée' AND statut <> 'annulée'`,
        [telNettoye]
      );
      if (existe.length) return res.json({ ok: false, erreur: "⚠️ Ce téléphone est déjà utilisé pour une préinscription en cours" });
    }

    // ✅ Vérification classe et places
    let placesRestantes = null, libelleClasse = null;
    if (id_classe && !isNaN(Number(id_classe))) {
      const { rows: [classe] } = await pool.query(
        `SELECT libelle_classe, capacite_max, places_occupees FROM classes WHERE id_classe = $1`,
        [id_classe]
      );
      if (!classe) return res.json({ ok: false, erreur: "❌ Classe introuvable" });
      libelleClasse = classe.libelle_classe;
      placesRestantes = classe.capacite_max - (classe.places_occupees || 0);
      if (placesRestantes <= 0)
        return res.json({ ok: false, erreur: `❌ Classe ${libelleClasse} complète ! Plus de place disponible.` });
    }

    // ✅ Fichiers uploadés
    const photo_identite = req.files?.photo_identite?.[0] ? `uploads/${req.files.photo_identite[0].filename}` : null;
    const extrait_naissance = req.files?.extrait_naissance?.[0] ? `uploads/${req.files.extrait_naissance[0].filename}` : null;
    const bulletin = req.files?.bulletin?.[0] ? `uploads/${req.files.bulletin[0].filename}` : null;
    const cv = req.files?.cv?.[0] ? `uploads/${req.files.cv[0].filename}` : null;

    // ✅ Insertion conforme à la table → VARIABLE RENOMMÉE
    const { rows: [nouvellePreinscription] } = await pool.query(`
      INSERT INTO preinscriptions (
        profil, nom, prenoms, sexe, date_naissance, lieu_naissance, nationalite, adresse,
        telephone, email,
        nom_pere, profession_pere, telephone_pere, email_pere, date_naissance_pere,
        nom_mere, profession_mere, telephone_mere, email_mere, date_naissance_mere,
        telephone_parent, email_parent, responsable, adresse_famille,
        moyenne_annee_precedente, rang_annee_precedente, mention_annee_precedente, conduite,
        libelle_classe_fr, libelle_classe_ar, id_classe,
        cantine, transport, circuit_transport,
        specialite, experience, organisme, objet,
        mode_paiement, photo_identite, extrait_naissance, bulletin, cv,
        annee_scolaire, observations,
        statut, date_preinscription, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,NOW(),NOW())
      RETURNING id_preinscription
    `, [
      profilNettoye, nom.trim(), prenoms.trim(), sexe || null, date_naissance || null, lieu_naissance || null, nationalite || null, adresse || null,
      telNettoye || null, emailNettoye || null,
      nom_pere?.trim() || null, profession_pere?.trim() || null, telephone_pere?.replace(/\s/g, '') || null, email_pere?.trim() || null, date_naissance_pere || null,
      nom_mere?.trim() || null, profession_mere?.trim() || null, telephone_mere?.replace(/\s/g, '') || null, email_mere?.trim() || null, date_naissance_mere || null,
      telephone_parent?.replace(/\s/g, '') || null, email_parent?.trim() || null, responsable?.trim() || null, adresse_famille?.trim() || null,
      moyenne_annee_precedente || null, rang_annee_precedente || null, mention_annee_precedente?.trim() || null, conduite?.trim() || null,
      libelle_classe_fr?.trim() || null, libelle_classe_ar?.trim() || null, id_classe && !isNaN(id_classe) ? Number(id_classe) : null,
      cantine || null, transport || null, circuit_transport?.trim() || null,
      specialite?.trim() || null, experience?.trim() || null, organisme?.trim() || null, objet?.trim() || null,
      mode_paiement?.trim() || null, photo_identite, extrait_naissance, bulletin, cv,
      anneeScolaire, observations?.trim() || null,
      'en attente'
    ]);

    // ✅ Incrémenter places occupées
    if (id_classe && !isNaN(Number(id_classe))) {
      await pool.query(
        `UPDATE classes SET places_occupees = places_occupees + 1 WHERE id_classe = $1`,
        [id_classe]
      );
      placesRestantes = Math.max(0, placesRestantes - 1);
    }

    // ✅ Email accusé réception
    const destEmail = emailNettoye || email_parent?.trim();
    if (destEmail) {
      await envoyerEmail(destEmail, '✅ Préinscription enregistrée — MAMA-ZOUMANA', `
        <h3>Demande enregistrée</h3>
        <p>Bonjour <strong>${prenoms} ${nom}</strong>,</p>
        <p>Nous accusons réception de votre demande de préinscription.</p>
        ${libelleClasse ? `<p>🏫 Classe demandée : ${libelleClasse}<br>📊 Places restantes : ${placesRestantes}</p>` : ''}
        <p>⏳ En attente de validation (~24h).</p>
        <p>Vous recevrez une réponse par e-mail dès que l'administration aura examiné votre dossier.</p>
      `);
    }

    console.log(`✅ Préinscription soumise — ID: ${nouvellePreinscription.id_preinscription}`);
    res.json({
      ok: true,
      message: `✅ Demande enregistrée !${libelleClasse ? `\n🏫 Classe: ${libelleClasse}\n📊 Places restantes: ${placesRestantes}` : ''}`,
      id: nouvellePreinscription.id_preinscription
    });

  } catch (e) {
    console.error("❌ ERREUR soumission :", e.code, e.message);
    res.json({
      ok: false,
      erreur: e.message.includes('unique constraint')
        ? '❌ Doublon détecté (email/téléphone déjà utilisé)'
        : e.message
    });
  }
});

// 🔑 CONNEXION PARENT PAR MATRICULE
router.post('/parent-matricule', async (req, res) => {
  try {
    const { matricule, email_parent, telephone_parent } = req.body;
    if (!matricule?.trim())
      return res.json({ ok: false, erreur: "⚠️ Indiquez le matricule de l'élève" });

    const telNettoye = (telephone_parent || '').replace(/\s/g, '');
    const { rows: [eleve] } = await pool.query(`
      SELECT id_utilisateur, nom, prenoms, matricule, id_classe, email_parent, telephone_parent, statut
      FROM utilisateurs WHERE matricule = $1 AND role = 'eleve' LIMIT 1
    `, [matricule.trim()]);

    if (!eleve)
      return res.json({ ok: false, erreur: "❌ Élève introuvable avec ce matricule" });

    const okEmail = email_parent && eleve.email_parent?.toLowerCase().trim() === email_parent.toLowerCase().trim();
    const okTel = telNettoye && eleve.telephone_parent?.replace(/\s/g, '') === telNettoye;
    if (!okEmail && !okTel)
      return res.json({ ok: false, erreur: "⚠️ Email ou téléphone non concordant" });

    // Récupérer tous les enfants du parent
    const { rows: enfants } = await pool.query(`
      SELECT id_utilisateur AS id, nom, prenoms, matricule, id_classe, statut
      FROM utilisateurs WHERE role = 'eleve'
        AND ((LOWER(email_parent) = LOWER($1) AND $1 <> '') OR (REPLACE(telephone_parent,' ','') = $2 AND $2 <> ''))
      ORDER BY nom, prenoms
    `, [eleve.email_parent || '', telNettoye || eleve.telephone_parent?.replace(/\s/g, '')]);

    const token = jwt.sign({
      id: `parent-${Date.now()}`, role: 'parent',
      email_parent: eleve.email_parent || '', telephone_parent: eleve.telephone_parent || ''
    }, CLE_JWT, { expiresIn: '30d' });

    res.json({ ok: true, token, enfants, message: `✅ ${enfants.length} enfant(s) trouvé(s)` });
  } catch (e) {
    console.error("❌ ERREUR connexion parent :", e.message);
    res.json({ ok: false, erreur: "❌ Erreur serveur" });
  }
});

// ==================================================
// 🔐 ROUTES ADMINISTRATION
// ==================================================
if (protegerAdmin.length) {
  // 📋 LISTE EN ATTENTE
  router.get('/en-attente', protegerAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT * FROM preinscriptions WHERE statut = 'en attente' ORDER BY date_preinscription DESC
      `);
      res.json({ ok: true, lignes: rows });
    } catch (e) {
      res.json({ ok: false, erreur: e.message });
    }
  });

  // 📋 TOUTES LES PRÉINSCRIPTIONS
  router.get('/', protegerAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT * FROM preinscriptions ORDER BY date_preinscription DESC
      `);
      res.json({ ok: true, lignes: rows });
    } catch (e) {
      res.json({ ok: false, erreur: e.message });
    }
  });

  // ✅ VALIDER → CRÉER COMPTE UTILISATEUR
  router.post('/valider/:id', protegerAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id_preinscription = parseInt(req.params.id);
      if (isNaN(id_preinscription))
        return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

      // 🔍 Lire la demande
      const { rows: [demande] } = await client.query(
        `SELECT * FROM preinscriptions WHERE id_preinscription = $1`, [id_preinscription]
      );
      if (!demande) return res.json({ ok: false, erreur: "❌ Demande introuvable" });
      if (demande.statut !== 'en attente') return res.json({ ok: false, erreur: "⚠️ Déjà traitée" });

      const profil = determinerProfil(demande);

      // ✅ Définir la classe
      let id_classe_final = demande.id_classe;
      if (!id_classe_final && demande.libelle_classe_fr) {
        const { rows: [c] } = await client.query(
          `SELECT id_classe FROM classes WHERE libelle_classe = $1`, [demande.libelle_classe_fr]
        );
        if (c) id_classe_final = c.id_classe;
      }

      // ✅ Générer matricule
      let matricule;
      if (profil === 'eleve' && demande.date_naissance) {
        matricule = await genererMatricule(demande.date_naissance, demande.annee_scolaire);
      } else {
        const prefixes = { professeur: 'ENS', parent: 'PAR', visiteur: 'VIS' };
        matricule = `${prefixes[profil] || 'VIS'}-${String(id_preinscription).padStart(5, '0')}`;
      }

      // ✅ Créer compte utilisateur
      const mdpProvisoire = Math.random().toString(36).substring(2, 10).toUpperCase() + '@1A';
      const hashMdp = await bcrypt.hash(mdpProvisoire, 10);
      const { rows: [nouvelUtilisateur] } = await client.query(`
        INSERT INTO utilisateurs (
          nom, prenoms, email, telephone, date_naissance, lieu_naissance, nationalite, sexe, adresse,
          nom_pere, profession_pere, telephone_pere, email_pere,
          nom_mere, profession_mere, telephone_mere, email_mere,
          telephone_parent, email_parent,
          id_classe, matricule, role, mot_de_passe, statut, date_inscription
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW())
        RETURNING id_utilisateur, matricule
      `, [
        demande.nom, demande.prenoms, demande.email || demande.email_parent,
        demande.telephone || demande.telephone_parent?.replace(/\s/g, ''),
        demande.date_naissance, demande.lieu_naissance, demande.nationalite, demande.sexe, demande.adresse,
        demande.nom_pere, demande.profession_pere, demande.telephone_pere?.replace(/\s/g, ''), demande.email_pere,
        demande.nom_mere, demande.profession_mere, demande.telephone_mere?.replace(/\s/g, ''), demande.email_mere,
        demande.telephone_parent?.replace(/\s/g, ''), demande.email_parent,
        id_classe_final, matricule, profil, hashMdp
      ]);

      // ✅ Mise à jour statut préinscription
      await client.query(`
        UPDATE preinscriptions
        SET statut = 'validée', date_traitement = NOW(), id_utilisateur_valideur = $1, date_mise_a_jour = NOW()
        WHERE id_preinscription = $2
      `, [req.user.id, id_preinscription]);

      await client.query('COMMIT');

      // ✅ Email identifiants
      const destEmail = demande.email || demande.email_parent;
      if (destEmail) {
        await envoyerEmail(destEmail, '✅ INSCRIPTION VALIDÉE — MAMA-ZOUMANA', `
          <div style="background:#f0f9ff;padding:20px;font-family:Arial">
            <div style="background:white;padding:25px;border-radius:12px;border:3px solid #f59e0b;max-width:500px;margin:0 auto">
              <h2 style="color:#0c4a6e;text-align:center">✅ INSCRIPTION VALIDÉE</h2>
              <p>Bonjour <strong>${demande.prenoms} ${demande.nom}</strong>,</p>
              <p>Votre demande a été validée ! Voici vos identifiants :</p>
              <p><strong>Matricule :</strong><br><code style="background:#e2e8f0;padding:4px 10px;border-radius:4px">${matricule}</code></p>
              <p><strong>Connexion :</strong><br>Email : ${destEmail}<br>Mot de passe : <code>${mdpProvisoire}</code></p>
              <p style="color:#ef4444">⚠️ Connectez-vous et modifiez votre mot de passe immédiatement.</p>
            </div>
          </div>
        `);
      }

      console.log(`✅ Validée — ID:${id_preinscription} → Utilisateur ${nouvelUtilisateur.id_utilisateur} | ${matricule}`);
      res.json({ ok: true, matricule, message: "✅ Demande validée et compte créé" });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("❌ ERREUR validation :", e.message);
      res.json({ ok: false, erreur: "⚠️ Échec validation : " + e.message });
    } finally {
      client.release();
    }
  });

  // ❌ REFUSER UNE DEMANDE
  router.patch('/:id/refuser', protegerAdmin, async (req, res) => {
    try {
      const id_preinscription = parseInt(req.params.id);
      const { rows: [demande] } = await pool.query(
        `SELECT id_classe, statut FROM preinscriptions WHERE id_preinscription = $1`, [id_preinscription]
      );
      if (!demande) return res.json({ ok: false, erreur: "❌ Introuvable" });

      // ✅ Libérer place si classe réservée
      if (demande.id_classe && demande.statut === 'en attente') {
        await pool.query(
          `UPDATE classes SET places_occupees = GREATEST(0, places_occupees - 1) WHERE id_classe = $1`,
          [demande.id_classe]
        );
      }

      await pool.query(`
        UPDATE preinscriptions SET statut = 'refusée', date_traitement = NOW(), date_mise_a_jour = NOW()
        WHERE id_preinscription = $1
      `, [id_preinscription]);

      res.json({ ok: true, message: "✅ Demande refusée" });
    } catch (e) {
      res.json({ ok: false, erreur: e.message });
    }
  });

  // ✏️ MODIFIER STATUT
  router.patch('/:id/statut', protegerAdmin, async (req, res) => {
    try {
      const id_preinscription = parseInt(req.params.id);
      const { statut } = req.body;
      if (!['en attente', 'validée', 'refusée', 'annulée'].includes(statut))
        return res.json({ ok: false, erreur: "⚠️ Statut invalide" });

      const { rowCount } = await pool.query(`
        UPDATE preinscriptions SET statut = $1, date_traitement = NOW(), id_utilisateur_valideur = $2, date_mise_a_jour = NOW()
        WHERE id_preinscription = $3
      `, [statut, req.user.id, id_preinscription]);

      if (!rowCount) return res.json({ ok: false, erreur: "❌ Introuvable" });
      res.json({ ok: true, message: `✅ Statut mis à jour : ${statut}` });
    } catch (e) {
      res.json({ ok: false, erreur: e.message });
    }
  });

  // 🔍 DÉTAILS
  router.get('/:id', protegerAdmin, async (req, res) => {
    try {
      const { rows: [demande] } = await pool.query(
        `SELECT * FROM preinscriptions WHERE id_preinscription = $1`, [req.params.id]
      );
      if (!demande) return res.json({ ok: false, erreur: "❌ Introuvable" });
      res.json({ ok: true, demande });
    } catch (e) {
      res.json({ ok: false, erreur: e.message });
    }
  });
}

// ==================================================
// 👨‍👩‍👧 ESPACE PARENT
// ==================================================
if (protegerParent.length) {
  // 📋 MES ENFANTS
  router.get('/mes-enfants', protegerParent, async (req, res) => {
    try {
      const { email_parent, telephone_parent } = req.filtreParent;
      const telNettoye = (telephone_parent || '').replace(/\s/g, '');
      const { rows } = await pool.query(`
        SELECT u.id_utilisateur AS id, u.nom, u.prenoms, u.matricule, u.id_classe, u.statut, c.libelle_classe
        FROM utilisateurs u LEFT JOIN classes c ON u.id_classe = c.id_classe
        WHERE u.role = 'eleve' AND ((LOWER(u.email_parent)=LOWER($1) AND $1<>'') OR (REPLACE(u.telephone_parent,' ','')=$2 AND $2<>''))
        ORDER BY u.nom, u.prenoms
      `, [email_parent || '', telNettoye]);
      res.json({ ok: true, enfants: rows });
    } catch (e) {
      res.json({ ok: false, erreur: e.message });
    }
  });
}

module.exports = router;