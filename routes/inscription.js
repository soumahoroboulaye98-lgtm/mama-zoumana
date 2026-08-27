const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const upload = require('../config/multer-config');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ==============================================
// 🔐 MIDDLEWARES DE PROTECTION
// ==============================================
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const protegerAdmin = [veriftoken, verifadmin];

// ==============================================
// ✅ CONFIGURATION E-MAIL SÉCURISÉE
// ==============================================
const transport = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '465'),
  secure: process.env.MAIL_SECURE !== 'false',
  service: process.env.MAIL_SERVICE || undefined,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// ==============================================
// ✅ FONCTIONS UTILITAIRES
// ==============================================
const genererMatricule = () => `MAT-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

// ==============================================
// ✍️ NOUVELLE PRÉINSCRIPTION — Publique
// ==============================================
router.post('/nouvelle', upload.fields([
  { name: 'photo_identite', maxCount: 1 },
  { name: 'extrait_naissance', maxCount: 1 },
  { name: 'bulletin', maxCount: 1 },
  { name: 'cv', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      nom_famille, prenom, email, telephone, role, mot_de_passe,
      id_classe_souhaitee, nom_parent, telephone_parent, email_parent,
      nom_pere, nom_mere, annee_scolaire
    } = req.body;

    // ✅ Validation complète
    if (!nom_famille?.trim() || !prenom?.trim() || !email?.trim() || !mot_de_passe || !role?.trim()) {
      return res.json({
        ok: false,
        erreur: "⚠️ Veuillez renseigner nom, prénom, email, mot de passe et profil"
      });
    }

    const emailClean = email.toLowerCase().trim();

    // Vérification email unique
    const emailExiste = await pool.query(
      "SELECT id_utilisateur FROM utilisateurs WHERE LOWER(email) = $1",
      [emailClean]
    );
    if (emailExiste.rows.length > 0) {
      return res.json({ ok: false, erreur: "❌ Cet email est déjà utilisé" });
    }

    // Hachage mot de passe + code de vérification
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const cleVerif = Math.floor(100000 + Math.random() * 900000).toString();

    // ✅ Récupération fichiers uploadés
    const photoIdentite = req.files?.photo_identite?.[0]?.filename || null;
    const extraitNaissance = req.files?.extrait_naissance?.[0]?.filename || null;
    const bulletin = req.files?.bulletin?.[0]?.filename || null;
    const cv = req.files?.cv?.[0]?.filename || null;

    // 1. Création utilisateur
    const nouvelUtil = await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenom, email, telephone, mot_de_passe,
        role, statut_compte, cle_validation, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, 'en_attente', $7, CURRENT_TIMESTAMP)
      RETURNING id_utilisateur, nom, prenom, email, role
    `, [
      nom_famille.trim(), prenom.trim(), emailClean, telephone?.trim() || null,
      hash, role.trim(), cleVerif
    ]);

    const idUser = nouvelUtil.rows[0].id_utilisateur;

    // 2. Enregistrement préinscription
    await pool.query(`
      INSERT INTO preinscriptions(
        id_utilisateur, nom_famille, prenom, email, telephone, role,
        id_classe_souhaitee, nom_parent, telephone_parent, email_parent,
        nom_pere, nom_mere, annee_scolaire,
        photo_identite, extrait_naissance, bulletin, cv,
        statut, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'en_attente', CURRENT_TIMESTAMP)
    `, [
      idUser, nom_famille.trim(), prenom.trim(), emailClean,
      telephone?.trim() || null, role.trim(),
      id_classe_souhaitee || null, nom_parent?.trim() || null,
      (telephone_parent || '').replace(/\s/g, '') || null, email_parent?.trim() || null,
      nom_pere?.trim() || null, nom_mere?.trim() || null, annee_scolaire?.trim() || '2025-2026',
      photoIdentite, extraitNaissance, bulletin, cv
    ]);

    // 3. Table spécifique selon le rôle
    if (role.trim() === 'eleve') {
      await pool.query(`
        INSERT INTO eleves(matricule, id_utilisateur, photo_identite)
        VALUES ($1, $2, $3)
      `, [genererMatricule(), idUser, photoIdentite]);
    } else if (role.trim() === 'prof') {
      await pool.query(`
        INSERT INTO professeurs(id_utilisateur, photo_identite, cv)
        VALUES ($1, $2, $3)
      `, [idUser, photoIdentite, cv]);
    }

    // 4. Envoi e-mail
    await transport.sendMail({
      to: emailClean,
      subject: '🔐 Vérification préinscription — MAMA-ZOUMANA',
      html: `
        <h3>Bienvenue ${nom_famille.trim()} ${prenom.trim()} !</h3>
        <p>Votre code de vérification : <strong style="font-size:20px;background:#f59e0b;color:#000;padding:8px 16px;border-radius:4px">${cleVerif}</strong></p>
        <p>Validez votre inscription avec ce code, puis l'administration validera votre compte après vérification.</p>
        <hr><p style="color:#666">Établissement MAMA-ZOUMANA</p>
      `
    });

    console.log(`✅ Préinscription créée — Utilisateur ID: ${idUser}, Rôle: ${role}`);
    res.json({
      ok: true,
      message: "✅ Préinscription enregistrée. Un code de vérification vous a été envoyé par e-mail."
    });
  } catch (e) {
    console.error("❌ ERREUR PRÉINSCRIPTION :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==============================================
// ✅ VÉRIFICATION DU CODE
// ==============================================
router.post('/verifier', async (req, res) => {
  try {
    const { code } = req.body;
    const codeClean = code?.trim();

    if (!codeClean || codeClean.length !== 6) {
      return res.json({ ok: false, erreur: "⚠️ Code invalide (6 chiffres requis)" });
    }

    const utilisateur = await pool.query(`
      SELECT id_utilisateur, statut_compte, cle_validation
      FROM utilisateurs
      WHERE cle_validation = $1 AND statut_compte = 'en_attente'
    `, [codeClean]);

    if (utilisateur.rows.length === 0) {
      return res.json({ ok: false, erreur: "⛔ Code invalide ou déjà utilisé" });
    }

    await pool.query(`
      UPDATE utilisateurs
      SET verification_effectuee = true,
          statut_compte = 'en_attente',
          cle_validation = NULL
      WHERE id_utilisateur = $1
    `, [utilisateur.rows[0].id_utilisateur]);

    console.log(`✅ Compte vérifié — Utilisateur ID: ${utilisateur.rows[0].id_utilisateur}`);
    res.json({
      ok: true,
      message: "✅ Compte vérifié. En attente de validation administrative."
    });
  } catch (e) {
    console.error("❌ ERREUR VÉRIFICATION :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==============================================
// 📋 LISTE DES DEMANDES DE PRÉINSCRIPTION — 🔐 Admin seul
// ==============================================
router.get('/liste', protegerAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id, p.nom_famille, p.prenom, p.email, p.telephone, p.role AS profil,
        p.id_classe_souhaitee, p.nom_parent, p.telephone_parent, p.email_parent,
        p.statut, p.date_creation, p.date_decision,
        c.libelle_classe
      FROM preinscriptions p
      LEFT JOIN classes c ON p.id_classe_souhaitee = c.id_classe
      ORDER BY 
        CASE p.statut WHEN 'en_attente' THEN 1 ELSE 2 END,
        p.date_creation DESC
    `);

    res.json({ ok: true, liste: result.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==============================================
// ✅ VALIDER UNE DEMANDE — 🔐 Admin seul
// ==============================================
router.put('/valider/:id', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const demande = await pool.query(`
      SELECT p.id_utilisateur, p.nom_famille, p.prenom, p.email, p.statut
      FROM preinscriptions p
      WHERE p.id = $1
    `, [id]);

    if (demande.rows.length === 0) {
      return res.json({ ok: false, erreur: "❌ Demande introuvable" });
    }
    if (demande.rows[0].statut !== 'en_attente') {
      return res.json({ ok: false, erreur: "⚠️ Demande déjà traitée" });
    }

    const { id_utilisateur, nom_famille, prenom, email } = demande.rows[0];

    // Mise à jour préinscription
    await pool.query(`
      UPDATE preinscriptions
      SET statut = 'validee', date_decision = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    // Activation compte utilisateur
    await pool.query(`
      UPDATE utilisateurs
      SET statut_compte = 'actif', date_validation = CURRENT_TIMESTAMP
      WHERE id_utilisateur = $1
    `, [id_utilisateur]);

    // Envoi e-mail de confirmation
    await transport.sendMail({
      to: email,
      subject: '✅ Préinscription validée — MAMA-ZOUMANA',
      html: `
        <h3>Félicitations ${nom_famille} ${prenom} ! 🎉</h3>
        <p>Votre préinscription a été validée par l'administration.</p>
        <p>Votre compte est maintenant <strong>actif</strong>. Vous pouvez vous connecter.</p>
        <hr><p style="color:#666">Établissement MAMA-ZOUMANA</p>
      `
    });

    console.log(`✅ Demande validée — ID: ${id}`);
    res.json({ ok: true, message: "✅ Demande validée et compte activé" });
  } catch (e) {
    console.error("❌ ERREUR VALIDATION :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==============================================
// ❌ REFUSER UNE DEMANDE — 🔐 Admin seul
// ==============================================
router.put('/refuser/:id', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const demande = await pool.query(`
      SELECT p.id_utilisateur, p.nom_famille, p.prenom, p.email, p.statut
      FROM preinscriptions p
      WHERE p.id = $1
    `, [id]);

    if (demande.rows.length === 0) {
      return res.json({ ok: false, erreur: "❌ Demande introuvable" });
    }
    if (demande.rows[0].statut !== 'en_attente') {
      return res.json({ ok: false, erreur: "⚠️ Demande déjà traitée" });
    }

    const { id_utilisateur, nom_famille, prenom, email } = demande.rows[0];

    // Mise à jour préinscription
    await pool.query(`
      UPDATE preinscriptions
      SET statut = 'refusee', date_decision = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    // Mise à jour compte
    await pool.query(`
      UPDATE utilisateurs
      SET statut_compte = 'refuse'
      WHERE id_utilisateur = $1
    `, [id_utilisateur]);

    // Envoi e-mail
    await transport.sendMail({
      to: email,
      subject: "Réponse à votre préinscription — MAMA-ZOUMANA",
      html: `
        <h3>Cher/Chère ${nom_famille} ${prenom},</h3>
        <p>Nous regrettons de vous informer que votre demande de préinscription n'a pas pu être retenue pour cette rentrée.</p>
        <p>N'hésitez pas à nous contacter pour de plus amples informations.</p>
        <hr><p style="color:#666">Établissement MAMA-ZOUMANA</p>
      `
    });

    console.log(`❌ Demande refusée — ID: ${id}`);
    res.json({ ok: true, message: "✅ Demande refusée" });
  } catch (e) {
    console.error("❌ ERREUR REFUS :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

module.exports = router;