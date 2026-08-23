const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const upload = require('../config/multer-config');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Configuration de l'envoi d'e-mails
const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});


// ==================================================
// ✍️ NOUVELLE INSCRIPTION — Publique
// Gestion automatique des rôles : élève / enseignant / autre
// ==================================================
router.post('/nouvelle', upload.fields([
  { name: 'photo_id', maxCount: 1 },
  { name: 'documents', maxCount: 5 }
]), async (req, res) => {
  try {
    const { nom, prenoms, email, telephone, role, mot_de_passe } = req.body;

    // ✅ Validation minimale
    if (!nom || !prenoms || !email || !mot_de_passe || !role) {
      return res.json({
        ok: false,
        erreur: "Veuillez renseigner nom, prénoms, email, mot de passe et profil"
      });
    }

    // Hachage du mot de passe et génération du code de vérification
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const cleVerif = Math.floor(100000 + Math.random() * 900000).toString(); // Code 6 chiffres

    // 1. Enregistrement utilisateur de base
    const nouvelUtil = await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenoms, email, telephone, mot_de_passe,
        role, statut_compte, cle_validation
      ) VALUES ($1, $2, $3, $4, $5, $6, 'en_attente', $7)
      RETURNING id_utilisateur
    `, [nom, prenoms, email.toLowerCase(), telephone, hash, role, cleVerif]);

    const idUser = nouvelUtil.rows[0].id_utilisateur;
    const photoId = req.files['photo_id'] ? req.files['photo_id'][0].filename : null;
    const docs = req.files['documents']
      ? req.files['documents'].map(f => f.filename).join(',')
      : null;

    // 2. Traitement spécifique selon le rôle
    if (role === 'eleve') {
      await pool.query(`
        INSERT INTO eleves(matricule, id_utilisateur, photo_identite, documents_inscription)
        VALUES ($1, $2, $3, $4)
      `, ['MAT-' + Date.now(), idUser, photoId, docs]);
    }
    else if (role === 'enseignant') {
      await pool.query(`
        INSERT INTO enseignants(id_utilisateur, photo_identite, documents_prof)
        VALUES ($1, $2, $3)
      `, [idUser, photoId, docs]);
    }
    // Pour admin / parent / personnel : aucune table supplémentaire

    // 3. Envoi de l'e-mail de vérification
    await transport.sendMail({
      to: email,
      subject: '🔐 Vérification inscription — MAMA-ZOUMANA',
      html: `
        <h3>Bienvenue ${nom} ${prenoms}</h3>
        <p>Votre code de vérification : <strong>${cleVerif}</strong></p>
        <p>Il sera valide 24h. L'administration validera votre compte après contrôle des documents fournis.</p>
      `
    });

    console.log(`✅ Inscription créée — ID: ${idUser}, Rôle: ${role}`);
    res.json({
      ok: true,
      message: "✅ Inscription enregistrée. Un code de vérification vous a été envoyé par e-mail."
    });

  } catch (e) {
    console.error("❌ ERREUR NOUVELLE INSCRIPTION :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✅ VÉRIFICATION DU CODE
// ==================================================
router.post('/verifier', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || code.length !== 6) {
      return res.json({ ok: false, erreur: "⚠️ Veuillez fournir un code valide (6 chiffres)" });
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
      message: "✅ Compte vérifié. Il est en attente de validation par l'administration."
    });

  } catch (e) {
    console.error("❌ ERREUR VÉRIFICATION CODE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

 
module.exports = router;