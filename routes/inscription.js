const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const upload = require('../config/multer-config');
const nodemailer = require('nodemailer');
require('dotenv').config();

const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
});

// 📝 ROUTE UNIQUE AVEC GESTION DES RÔLES
router.post('/nouvelle', upload.fields([{name:'photo_id', maxCount:1}, {name:'documents', maxCount:5}]), async (req, res) => {
  try {
    const { nom, prenoms, email, telephone, role, mot_de_passe } = req.body;
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const cleVerif = Math.floor(100000 + Math.random()*900000).toString(); // Code 6 chiffres

    // 1. Enregistrer l'utilisateur de base
    const nouvelUtil = await pool.query(`
      INSERT INTO utilisateurs(nom,prenoms,email,telephone,mot_de_passe,role,statut_compte,cle_validation)
      VALUES ($1,$2,$3,$4,$5,$6,'en_attente',$7)
      RETURNING id_utilisateur
    `, [nom,prenoms,email.toLowerCase(),telephone,hash,role,cleVerif]);

    const idUser = nouvelUtil.rows[0].id_utilisateur;
    const photoId = req.files['photo_id'] ? req.files['photo_id'][0].filename : null;
    const docs = req.files['documents'] ? req.files['documents'].map(f=>f.filename).join(',') : null;

    // 2. TRAITEMENT SELON LE RÔLE
    if (role === 'eleve') {
      await pool.query(`
        INSERT INTO eleves(matricule,id_utilisateur,photo_identite,documents_inscription)
        VALUES ($1,$2,$3,$4)
      `, ['MAT-'+Date.now(), idUser, photoId, docs]);
    }
    else if (role === 'enseignant') {
      await pool.query(`
        INSERT INTO enseignants(id_utilisateur,photo_identite,documents_prof)
        VALUES ($1,$2,$3)
      `, [idUser, photoId, docs]);
    }
    // Pour admin/parent/personnel : rien d'autre à ajouter

    // 3. Envoyer email de vérification
    await transport.sendMail({
      to: email,
      subject: '🔐 Vérification inscription — MAMA-ZOUMANA',
      html: `
        <h3>Bienvenue ${nom} ${prenoms}</h3>
        <p>Votre code de vérification : <strong>${cleVerif}</strong></p>
        <p>Il sera valide 24h. L'administration validera votre compte après contrôle des documents.</p>
      `
    });

    res.json({ok:true, message:"Inscription enregistrée — code de vérification envoyé par email"});

  } catch (e) {
    console.error(e);
    res.status(500).json({erreur: e.message});
  }
});
// ✅ VÉRIFICATION DU CODE
router.post('/verifier', async (req, res) => {
  try {
    const { code } = req.body;
    const user = await pool.query("SELECT * FROM utilisateurs WHERE cle_validation = $1", [code]);
    
    if (user.rows.length === 0) return res.json({ok:false, erreur:"Code invalide"});
    
    await pool.query(`
      UPDATE utilisateurs 
      SET verification_effectuee=true, statut_compte='en_attente', cle_validation=NULL 
      WHERE cle_validation=$1
    `, [code]);
    
    res.json({ok:true, message:"Compte vérifié — en attente validation"});
  } catch (e) {
    res.json({ok:false, erreur:e.message});
  }
});

module.exports = router;