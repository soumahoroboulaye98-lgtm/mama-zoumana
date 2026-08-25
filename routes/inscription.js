const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const upload = require('../config/multer-config');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ==============================================
// CONFIGURATION E-MAIL
// ==============================================
const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// ==============================================
// FONCTIONS UTILITAIRES
// ==============================================
const genererMatricule = () => `MAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// ==============================================
// ✍️ NOUVELLE INSCRIPTION — Publique
// ==============================================
router.post('/nouvelle', upload.fields([
  { name: 'photo_id', maxCount: 1 },
  { name: 'documents', maxCount: 5 }
]), async (req, res) => {
  try {
    const { 
      nom, prenoms, email, telephone, role, mot_de_passe,
      classe, nom_responsable, telephone_responsable
    } = req.body;

    // ✅ Validation complète
    if (!nom || !prenoms || !email || !mot_de_passe || !role) {
      return res.json({
        ok: false,
        erreur: "Veuillez renseigner nom, prénoms, email, mot de passe et profil"
      });
    }

    // Vérification email unique
    const emailExiste = await pool.query(
      "SELECT id_utilisateur FROM utilisateurs WHERE email = $1",
      [email.toLowerCase()]
    );
    if (emailExiste.rows.length > 0) {
      return res.json({ ok: false, erreur: "Cet email est déjà utilisé" });
    }

    // Hachage mot de passe + code de vérification
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const cleVerif = Math.floor(100000 + Math.random() * 900000).toString();

    // 1. Création utilisateur
    const nouvelUtil = await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenoms, email, telephone, mot_de_passe,
        role, statut_compte, cle_validation, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, 'en_attente', $7, NOW())
      RETURNING id_utilisateur, nom, prenoms, email, role
    `, [nom, prenoms, email.toLowerCase(), telephone, hash, role, cleVerif]);

    const idUser = nouvelUtil.rows[0].id_utilisateur;
    const photoId = req.files?.photo_id?.[0]?.filename || null;
    const docs = req.files?.documents?.map(f => f.filename).join(',') || null;

    // 2. Enregistrement préinscription
    await pool.query(`
      INSERT INTO preinscription(
        id_utilisateur, classe, nom_responsable, telephone_responsable,
        photo_identite, documents_inscription, statut, date_demande
      ) VALUES ($1, $2, $3, $4, $5, $6, 'attente', NOW())
      RETURNING id_preinscription
    `, [idUser, classe || null, nom_responsable || null, telephone_responsable || null, photoId, docs]);

    // 3. Table spécifique selon le rôle
    if (role === 'eleve') {
      await pool.query(`
        INSERT INTO eleves(matricule, id_utilisateur, photo_identite, documents_inscription)
        VALUES ($1, $2, $3, $4)
      `, [genererMatricule(), idUser, photoId, docs]);
    } else if (role === 'enseignant') {
      await pool.query(`
        INSERT INTO enseignants(id_utilisateur, photo_identite, documents_prof)
        VALUES ($1, $2, $3)
      `, [idUser, photoId, docs]);
    }

    // 4. Envoi e-mail
    await transport.sendMail({
      to: email,
      subject: '🔐 Vérification inscription — MAMA-ZOUMANA',
      html: `
        <h3>Bienvenue ${nom} ${prenoms}</h3>
        <p>Votre code de vérification : <strong>${cleVerif}</strong></p>
        <p>Validez votre inscription avec ce code, puis l'administration validera votre compte après contrôle.</p>
      `
    });

    console.log(`✅ Inscription créée — ID: ${idUser}, Rôle: ${role}`);
    res.json({
      ok: true,
      message: "✅ Inscription enregistrée. Un code de vérification vous a été envoyé par e-mail."
    });

  } catch (e) {
    console.error("❌ ERREUR NOUVELLE INSCRIPTION :", e);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==============================================
// ✅ VÉRIFICATION DU CODE
// ==============================================
router.post('/verifier', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || code.length !== 6) {
      return res.json({ ok: false, erreur: "⚠️ Code invalide (6 chiffres requis)" });
    }

    const utilisateur = await pool.query(
      "SELECT * FROM utilisateurs WHERE cle_validation = $1",
      [code]
    );

    if (utilisateur.rows.length === 0) {
      return res.json({ ok: false, erreur: "⛔ Code invalide ou déjà utilisé" });
    }

    await pool.query(`
      UPDATE utilisateurs
      SET verification_effectuee = true,
          statut_compte = 'en_attente',
          cle_validation = NULL
      WHERE cle_validation = $1
    `, [code]);

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
// 📋 LISTE DES DEMANDES DE PRÉINSCRIPTION
// ==============================================
router.get('/liste', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id_preinscription,
        u.id_utilisateur,
        u.nom,
        u.prenoms,
        u.email,
        u.telephone,
        u.role AS profil,
        p.classe,
        p.nom_responsable,
        p.telephone_responsable,
        p.statut,
        p.date_demande,
        p.date_decision,
        c.libelle_classe_fr
      FROM preinscription p
      JOIN utilisateurs u ON p.id_utilisateur = u.id_utilisateur
      LEFT JOIN classes c ON p.classe = c.id_classe
      ORDER BY 
        CASE p.statut WHEN 'attente' THEN 1 ELSE 2 END,
        p.date_demande DESC
    `);

    res.json({ ok: true, liste: result.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==============================================
// ✅ VALIDER UNE DEMANDE
// ==============================================
router.put('/valider/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date_inscription } = req.body;

    // Vérifier l'existence de la demande
    const demande = await pool.query(`
      SELECT p.id_utilisateur, u.nom, u.prenoms, u.email
      FROM preinscription p
      JOIN utilisateurs u ON p.id_utilisateur = u.id_utilisateur
      WHERE p.id_preinscription = $1 AND p.statut = 'attente'
    `, [id]);

    if (demande.rows.length === 0) {
      return res.json({ ok: false, erreur: "Demande introuvable ou déjà traitée" });
    }

    const { id_utilisateur, nom, prenoms, email } = demande.rows[0];

    // Mise à jour préinscription
    await pool.query(`
      UPDATE preinscription
      SET statut = 'validee', date_decision = NOW()
      WHERE id_preinscription = $1
    `, [id]);

    // Activation compte utilisateur
    await pool.query(`
      UPDATE utilisateurs
      SET statut_compte = 'actif', date_validation = NOW()
      WHERE id_utilisateur = $1
    `, [id_utilisateur]);

    // Envoi e-mail de confirmation
    await transport.sendMail({
      to: email,
      subject: '✅ Inscription validée — MAMA-ZOUMANA',
      html: `
        <h3>Félicitations ${nom} ${prenoms} !</h3>
        <p>Votre inscription a été validée par l'administration.</p>
        <p>Votre compte est maintenant actif. Vous pouvez vous connecter.</p>
      `
    });

    console.log(`✅ Demande validée — ID: ${id}, Utilisateur: ${nom} ${prenoms}`);
    res.json({ ok: true, message: "Inscription validée et compte activé" });

  } catch (e) {
    console.error("❌ ERREUR VALIDATION :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==============================================
// ❌ REFUSER UNE DEMANDE
// ==============================================
router.put('/refuser/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const demande = await pool.query(`
      SELECT p.id_utilisateur, u.nom, u.prenoms, u.email
      FROM preinscription p
      JOIN utilisateurs u ON p.id_utilisateur = u.id_utilisateur
      WHERE p.id_preinscription = $1 AND p.statut = 'attente'
    `, [id]);

    if (demande.rows.length === 0) {
      return res.json({ ok: false, erreur: "Demande introuvable ou déjà traitée" });
    }

    const { id_utilisateur, nom, prenoms, email } = demande.rows[0];

    // Mise à jour préinscription
    await pool.query(`
      UPDATE preinscription
      SET statut = 'refusee', date_decision = NOW()
      WHERE id_preinscription = $1
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
      subject: "Réponse à votre inscription — MAMA-ZOUMANA",
      html: `
        <h3>Cher/Chère ${nom} ${prenoms}</h3>
        <p>Nous regrettons de vous informer que votre inscription n'a pas pu être retenue.</p>
        <p>Pour toute information complémentaire, contactez l'administration.</p>
      `
    });

    console.log(`❌ Demande refusée — ID: ${id}`);
    res.json({ ok: true, message: "Demande refusée" });

  } catch (e) {
    console.error("❌ ERREUR REFUS :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

module.exports = router;