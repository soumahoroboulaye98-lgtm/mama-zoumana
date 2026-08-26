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
// ✅ CLÉ JWT UNIFIÉE
// ==================================================
const CLE_JWT = process.env.JWT_SECRET || 'ma_cle_secrete_pour_le_site_2026';

// ==================================================
// ✅ MIDDLEWARES
// ==================================================
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 📁 CONFIGURATION UPLOAD
// ==================================================
const dossierUpload = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(dossierUpload)) {
  fs.mkdirSync(dossierUpload, { recursive: true });
}

const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dossierUpload),
  filename: (req, file, cb) => {
    const nomNettoye = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, Date.now() + '-' + nomNettoye);
  }
});

const upload = multer({ storage: stockage, limits: { fileSize: 10 * 1024 * 1024 } });

// ==================================================
// 📧 CONFIGURATION EMAIL
// ==================================================
const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// ==================================================
// 🆕 GÉNÉRER MATRICULE
// ==================================================
async function genererMatricule(profil, id_classe = null) {
  const annee = new Date().getFullYear();
  const codeEcole = 'MZ';
  let codeClasse = 'ELEV';

  if (profil === 'eleve' && id_classe) {
    try {
      const resClasse = await pool.query(
        'SELECT libelle_classe FROM classes WHERE id_classe = $1',
        [id_classe]
      );
      if (resClasse.rows.length > 0) {
        codeClasse = resClasse.rows[0].libelle_classe
          .toUpperCase()
          .replace(/ÈME|EME|ÈRE|ERE/g, '')
          .replace(/[^A-Z0-9]/g, '');
      }
    } catch {
      codeClasse = 'ELEV';
    }
  }

  const compte = await pool.query(
    "SELECT COUNT(*) FROM utilisateurs WHERE matricule LIKE $1",
    [`${codeEcole}-${annee}-${codeClasse}-%`]
  );
  const numero = String(parseInt(compte.rows[0].count) + 1).padStart(4, '0');
  return `${codeEcole}-${annee}-${codeClasse}-${numero}`;
}

// ==================================================
// 🔐 CONNEXION
// ==================================================
router.post('/connexion', async (req, res) => {
  try {
    const { email, matricule, mot_de_passe, role } = req.body;

    if (!mot_de_passe || !role) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant, mot de passe et profil sont obligatoires" });
    }
    if (role === 'eleve' && !matricule) {
      return res.json({ ok: false, erreur: "⚠️ Le matricule est obligatoire pour les Élèves" });
    }
    if (role !== 'eleve' && !email) {
      return res.json({ ok: false, erreur: "⚠️ L'email est obligatoire pour ce profil" });
    }

    let r;
    if (role === 'eleve') {
      r = await pool.query(
        `SELECT id, nom, prenom, email, matricule, role, mot_de_passe,
          COALESCE(statut_compte, 'valide') AS statut_compte,
          COALESCE(compte_verrouille, false) AS compte_verrouille,
          COALESCE(tentatives_connexion, 0) AS tentatives_connexion,
          date_deverrouillage, derniere_connexion
         FROM utilisateurs
         WHERE UPPER(matricule) = UPPER($1) AND role = $2`,
        [matricule ? matricule.trim() : '', role]
      );
    } else {
      r = await pool.query(
        `SELECT id, nom, prenom, email, matricule, role, mot_de_passe,
          COALESCE(statut_compte, 'valide') AS statut_compte,
          COALESCE(compte_verrouille, false) AS compte_verrouille,
          COALESCE(tentatives_connexion, 0) AS tentatives_connexion,
          date_deverrouillage, derniere_connexion
         FROM utilisateurs
         WHERE LOWER(email) = LOWER($1) AND role = $2`,
        [email ? email.trim() : '', role]
      );
    }

    if (r.rows.length === 0) {
      return res.json({
        ok: false,
        erreur: role === 'eleve'
          ? "⚠️ Matricule introuvable, compte inactif ou mauvais profil"
          : "⚠️ Email introuvable, compte inactif ou mauvais profil"
      });
    }

    const u = r.rows[0];

    if (u.statut_compte !== 'valide') {
      return res.json({ ok: false, erreur: "⚠️ Compte en attente de validation par l'administration" });
    }

    if (u.compte_verrouille) {
      const maintenant = new Date();
      if (maintenant < new Date(u.date_deverrouillage)) {
        const min = Math.ceil((new Date(u.date_deverrouillage) - maintenant) / 60000);
        return res.json({ ok: false, erreur: `⚠️ Compte verrouillé — Réessayez dans ${min} min` });
      } else {
        await pool.query(
          'UPDATE utilisateurs SET compte_verrouille = false, tentatives_connexion = 0 WHERE id = $1',
          [u.id]
        );
      }
    }

    let mdpValide = false;
    if (u.mot_de_passe && !u.mot_de_passe.startsWith('$2b$')) {
      mdpValide = (mot_de_passe === u.mot_de_passe);
    } else {
      mdpValide = await bcrypt.compare(mot_de_passe, u.mot_de_passe || '');
    }

    if (!mdpValide) {
      const essais = (u.tentatives_connexion || 0) + 1;
      if (essais >= 5) {
        const fin = new Date(Date.now() + 30 * 60000);
        await pool.query(
          'UPDATE utilisateurs SET tentatives_connexion = $1, compte_verrouille = true, date_deverrouillage = $2 WHERE id = $3',
          [essais, fin, u.id]
        );
        return res.json({ ok: false, erreur: "⚠️ 5 essais échoués — Compte verrouillé 30 min" });
      }
      await pool.query(
        'UPDATE utilisateurs SET tentatives_connexion = $1 WHERE id = $2',
        [essais, u.id]
      );
      return res.json({ ok: false, erreur: `⚠️ Mot de passe incorrect — ${5 - essais} essai(s) restant(s)` });
    }

    await pool.query(
      'UPDATE utilisateurs SET tentatives_connexion = 0, derniere_connexion = NOW() WHERE id = $1',
      [u.id]
    );

    const token = jwt.sign(
      { id: u.id, nom: u.nom, prenom: u.prenom, role: u.role, email: u.email },
      CLE_JWT,
      { expiresIn: '8h' }
    );

    console.log(`✅ Connexion réussie — ${u.matricule || u.email}, rôle: ${u.role}`);
    res.json({
      ok: true,
      token,
      id: u.id,
      nom: u.nom,
      prenom: u.prenom,
      email: u.email,
      matricule: u.matricule,
      role: u.role
    });
  } catch (e) {
    console.error("❌ ERREUR CONNEXION :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 👨‍👩‍👧 CONNEXION PARENT PAR MATRICULE ENFANT
// ==================================================
router.post('/preinscription/parent-matricule', async (req, res) => {
  try {
    const { matricule, email_parent, telephone_parent } = req.body;

    if (!matricule) {
      return res.json({ ok: false, erreur: "⚠️ Saisissez le matricule de l'enfant" });
    }
    if (!email_parent && !telephone_parent) {
      return res.json({ ok: false, erreur: "⚠️ Saisissez au moins email OU téléphone du parent" });
    }

    const eleve = await pool.query(
      `SELECT id, nom, prenom, email, telephone, matricule, id_parent
       FROM utilisateurs
       WHERE UPPER(matricule) = UPPER($1) AND role = 'eleve' AND COALESCE(statut_compte, 'valide') = 'valide'`,
      [matricule.trim()]
    );

    if (eleve.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Aucun élève trouvé avec ce matricule" });
    }

    const enfant = eleve.rows[0];

    if (enfant.id_parent) {
      const parent = await pool.query(
        `SELECT id, nom, prenom, email, telephone, role
         FROM utilisateurs
         WHERE id = $1 AND role = 'parent'`,
        [enfant.id_parent]
      );

      if (parent.rows.length > 0) {
        const p = parent.rows[0];
        const correspondEmail = !email_parent || p.email?.toLowerCase().trim() === email_parent?.toLowerCase().trim();
        const correspondTel = !telephone_parent || p.telephone?.trim() === telephone_parent?.trim();

        if (correspondEmail || correspondTel) {
          const token = jwt.sign(
            { id: p.id, nom: p.nom, prenom: p.prenom, role: 'parent', email: p.email },
            CLE_JWT,
            { expiresIn: '8h' }
          );
          console.log(`✅ Connexion Parent réussie — Accès à ${enfant.matricule}`);
          return res.json({
            ok: true,
            token,
            role: 'parent',
            nom: p.nom,
            prenom: p.prenom,
            enfants: [{ id: enfant.id, nom: enfant.nom, prenom: enfant.prenom, matricule: enfant.matricule }]
          });
        }
      }
    }

    const correspondEmail = !email_parent || enfant.email?.toLowerCase().trim() === email_parent?.toLowerCase().trim();
    const correspondTel = !telephone_parent || enfant.telephone?.trim() === telephone_parent?.trim();

    if (correspondEmail || correspondTel) {
      const token = jwt.sign(
        { id: enfant.id, nom: enfant.nom, prenom: enfant.prenom, role: 'parent', email: enfant.email },
        CLE_JWT,
        { expiresIn: '8h' }
      );
      console.log(`✅ Connexion Parent réussie (coordonnée élève) — ${enfant.matricule}`);
      return res.json({
        ok: true,
        token,
        role: 'parent',
        nom: 'Parent',
        prenom: '',
        enfants: [{ id: enfant.id, nom: enfant.nom, prenom: enfant.prenom, matricule: enfant.matricule }]
      });
    }

    return res.json({ ok: false, erreur: "⚠️ Email ou téléphone ne correspond pas à cet enfant" });
  } catch (e) {
    console.error("❌ ERREUR CONNEXION PARENT :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 📝 PRÉINSCRIPTION
// ==================================================
router.post('/preinscription/ajouter', upload.fields([{ name: 'photo_identite' }, { name: 'documents' }]), async (req, res) => {
  try {
    const { nom, prenoms, email, telephone, role, id_classe, profil, mot_de_passe } = req.body;

    if (!nom || !prenoms || !email || !mot_de_passe) {
      return res.json({ ok: false, erreur: "⚠️ Nom, prénoms, email et mot de passe sont obligatoires" });
    }
    if (mot_de_passe.length < 6) {
      return res.json({ ok: false, erreur: "⚠️ Le mot de passe doit contenir au moins 6 caractères" });
    }

    const emailNettoye = email.toLowerCase().trim();
    const exist = await pool.query('SELECT * FROM preinscriptions WHERE email = $1', [emailNettoye]);
    if (exist.rows.length > 0) {
      return res.json({ ok: false, erreur: "⚠️ Cet email est déjà utilisé pour une préinscription" });
    }

    const matricule = await genererMatricule(profil || role, id_classe);
    const hashMdp = await bcrypt.hash(mot_de_passe, 10);
    const photo = req.files?.photo_identite ? `uploads/${req.files.photo_identite[0].filename}` : null;
    const docs = req.files?.documents ? req.files.documents.map(f => `uploads/${f.filename}`).join('|') : null;

    await pool.query(
      `INSERT INTO preinscriptions(
        type_inscription, profil, nom, prenoms, email, telephone,
        mot_de_passe, id_classe, matricule,
        photo_identite, documents, date_preinscription, statut
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'en_attente')`,
      [
        'nouveau', profil || role, nom.trim(), prenoms.trim(), emailNettoye, telephone || null,
        hashMdp, id_classe || null, matricule, photo, docs
      ]
    );

    console.log(`✅ Préinscription enregistrée — ${matricule}, ${nom} ${prenoms}`);
    res.json({ ok: true, message: "✅ Demande enregistrée. Nous vous répondrons dans un délai de 24h.", matricule });
  } catch (e) {
    console.error("❌ ERREUR PRÉINSCRIPTION :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 🔑 MOT DE PASSE OUBLIÉ
// ==================================================
router.post('/mot-de-passe-oublie', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.json({ ok: false, erreur: "⚠️ Indiquez votre adresse email" });
    }

    const utilisateur = await pool.query(
      `SELECT id, nom, prenom, email
       FROM utilisateurs
       WHERE LOWER(email) = LOWER($1) AND COALESCE(statut_compte, 'valide') = 'valide'`,
      [email.trim()]
    );

    if (utilisateur.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Aucun compte actif trouvé avec cet email" });
    }

    const user = utilisateur.rows[0];
    const motDePasseTemp = "MZ" + Math.floor(100000 + Math.random() * 900000);
    const motDePasseCrypte = await bcrypt.hash(motDePasseTemp, 10);

    await pool.query(
      'UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2',
      [motDePasseCrypte, user.id]
    );

    await transport.sendMail({
      from: process.env.MAIL_USER,
      to: user.email,
      subject: '🔑 Récupération — MAMA-ZOUMANA',
      html: `
        <h2>Bonjour ${user.nom} ${user.prenom},</h2>
        <p>Nous avons reçu une demande de réinitialisation de mot de passe.</p>
        <p>Votre nouveau mot de passe temporaire est :</p>
        <h3 style="background:#f59e0b; padding:12px; border-radius:6px; font-size:20px; text-align:center;">${motDePasseTemp}</h3>
        <p>Connectez-vous et changez-le immédiatement.</p>
      `
    });

    console.log(`✅ Email de réinitialisation envoyé — ${user.email}`);
    res.json({ ok: true, message: "✅ Email de réinitialisation envoyé. Consultez votre boîte de réception." });
  } catch (e) {
    console.error("❌ ERREUR ENVOI EMAIL :", e.message);
    res.json({ ok: false, erreur: "⚠️ Erreur serveur — Réessayez plus tard" });
  }
});

// ==================================================
// 🔐 CHANGEMENT DE MOT DE PASSE
// ==================================================
router.post('/changer-mot-de-passe', veriftoken, async (req, res) => {
  try {
    const { id, ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

    if (!id || !ancien_mot_de_passe || !nouveau_mot_de_passe) {
      return res.json({ ok: false, erreur: "⚠️ Tous les champs sont obligatoires" });
    }
    if (nouveau_mot_de_passe.length < 6) {
      return res.json({ ok: false, erreur: "⚠️ Le nouveau mot de passe doit contenir au moins 6 caractères" });
    }

    const userResult = await pool.query(
      'SELECT mot_de_passe, nom, prenom FROM utilisateurs WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Utilisateur introuvable" });
    }

    const utilisateur = userResult.rows[0];
    const estValide = await bcrypt.compare(ancien_mot_de_passe, utilisateur.mot_de_passe);

    if (!estValide) {
      return res.json({ ok: false, erreur: "⚠️ L'ancien mot de passe est incorrect" });
    }

    const nouveauCrypte = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await pool.query(
      'UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2',
      [nouveauCrypte, id]
    );

    console.log(`✅ Mot de passe modifié — ${utilisateur.nom} ${utilisateur.prenom}`);
    res.json({ ok: true, message: "✅ Mot de passe modifié avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR CHANGEMENT MDP :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur" });
  }
});

// ==================================================
// ✅ VALIDER UNE PRÉINSCRIPTION → CRÉER COMPTE
// ==================================================
router.put('/preinscription/valider/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const demandeResult = await pool.query(
      'SELECT * FROM preinscriptions WHERE id_preinscription = $1',
      [id]
    );
    if (demandeResult.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Demande introuvable" });
    }

    const demande = demandeResult.rows[0];
    if (demande.statut !== 'en_attente') {
      return res.json({ ok: false, erreur: "⚠️ Cette demande n'est pas en attente" });
    }

    const existeDeja = await pool.query(
      'SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER($1)',
      [demande.email]
    );
    if (existeDeja.rows.length > 0) {
      return res.json({ ok: false, erreur: "⚠️ Un compte avec cet email existe déjà" });
    }

    const motDePasseTemp = "MZ" + Math.floor(100000 + Math.random() * 900000);
    const hashMdp = await bcrypt.hash(motDePasseTemp, 10);

    await pool.query(
      `INSERT INTO utilisateurs(
        nom, prenom, email, telephone, role, matricule,
        mot_de_passe, statut_compte, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'valide', NOW())`,
      [demande.nom, demande.prenoms, demande.email, demande.telephone, demande.profil, demande.matricule, hashMdp]
    );

    await pool.query(
      "UPDATE preinscriptions SET statut = 'validee' WHERE id_preinscription = $1",
      [id]
    );

    await transport.sendMail({
      from: process.env.MAIL_USER,
      to: demande.email,
      subject: '✅ Inscription validée — MAMA-ZOUMANA',
      html: `
        <h2>Félicitations ${demande.nom} ! 🎉</h2>
        <p>Votre inscription a été validée par l'administration.</p>
        <p><strong>Matricule :</strong> ${demande.matricule}</p>
        <p><strong>Profil :</strong> ${demande.profil}</p>
        <hr>
        <h4>🔑 Vos identifiants :</h4>
        <p>📧 Email : ${demande.email}</p>
        <p>🔑 Mot de passe temporaire : <code style="background:#f59e0b;padding:6px 12px;border-radius:4px;font-size:18px;">${motDePasseTemp}</code></p>
        <p>👉 Connectez-vous et changez votre mot de passe immédiatement.</p>
      `
    });

    console.log(`✅ Préinscription validée — ${demande.matricule}, ${demande.nom} ${demande.prenoms}`);
    res.json({ ok: true, message: "✅ Inscription validée. Compte créé et email envoyé." });
  } catch (e) {
    console.error("❌ ERREUR VALIDATION PRÉINSCRIPTION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ REFUSER UNE PRÉINSCRIPTION
// ==================================================
router.put('/preinscription/refuser/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const resultat = await pool.query(
      "UPDATE preinscriptions SET statut = 'annulee' WHERE id_preinscription = $1 RETURNING nom, prenoms",
      [id]
    );

    if (resultat.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Demande introuvable" });
    }

    console.log(`✅ Préinscription refusée — ${resultat.rows[0].nom} ${resultat.rows[0].prenoms}`);
    res.json({ ok: true, message: "✅ Demande refusée." });
  } catch (e) {
    console.error("❌ ERREUR REFUS PRÉINSCRIPTION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTER LES PRÉINSCRIPTIONS EN ATTENTE
// ==================================================
router.get('/preinscription/liste', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id_preinscription, profil, nom, prenoms, email, telephone,
              matricule, date_preinscription, statut,
              photo_identite, documents
       FROM preinscriptions
       WHERE statut = 'en_attente'
       ORDER BY date_preinscription DESC`
    );

    console.log(`✅ Liste préinscriptions consultée — ${r.rows.length} demande(s) en attente`);
    res.json({ ok: true, liste: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE PRÉINSCRIPTIONS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE TOUS LES UTILISATEURS
// ==================================================
router.get('/utilisateurs', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nom, prenom, email, matricule, telephone, role, COALESCE(statut_compte, 'valide') AS statut_compte, date_creation
       FROM utilisateurs
       ORDER BY nom, prenom`
    );

    console.log(`✅ Liste utilisateurs consultée — ${r.rows.length} utilisateur(s)`);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE UTILISATEURS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🔴 LIRE UN SEUL UTILISATEUR
// ==================================================
router.get('/utilisateur/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const r = await pool.query(
      `SELECT id, nom, prenom, email, matricule, telephone, role, COALESCE(statut_compte, 'valide') AS statut_compte
       FROM utilisateurs
       WHERE id = $1`,
      [id]
    );

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Utilisateur introuvable" });
    }

    console.log(`✅ Consultation utilisateur — ${r.rows[0].matricule || r.rows[0].email}`);
    res.json({ ok: true, utilisateur: r.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR CONSULTATION UTILISATEUR :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UN UTILISATEUR
// ==================================================
router.put('/utilisateur/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const { nom, prenoms, email, telephone, role, statut_compte, matricule, mot_de_passe } = req.body;

    if (!nom || !prenoms || !email) {
      return res.json({ ok: false, erreur: "⚠️ Nom, prénoms et email sont obligatoires" });
    }

    const emailNettoye = email.toLowerCase().trim();
    const exist = await pool.query(
      'SELECT id FROM utilisateurs WHERE LOWER(email) = $1 AND id != $2',
      [emailNettoye, id]
    );
    if (exist.rows.length > 0) {
      return res.json({ ok: false, erreur: "⚠️ Cet email est déjà utilisé par un autre compte" });
    }

    if (mot_de_passe && mot_de_passe.trim() !== '') {
      if (mot_de_passe.length < 6) {
        return res.json({ ok: false, erreur: "⚠️ Le mot de passe doit contenir au moins 6 caractères" });
      }
      const hash = await bcrypt.hash(mot_de_passe, 10);
      await pool.query(
        `UPDATE utilisateurs
         SET nom = $1, prenom = $2, email = $3, telephone = $4, role = $5, matricule = $6, statut_compte = $7, mot_de_passe = $8
         WHERE id = $9`,
        [nom.trim(), prenoms.trim(), emailNettoye, telephone || null, role, matricule, statut_compte, hash, id]
      );
    } else {
      await pool.query(
        `UPDATE utilisateurs
         SET nom = $1, prenom = $2, email = $3, telephone = $4, role = $5, matricule = $6, statut_compte = $7
         WHERE id = $8`,
        [nom.trim(), prenoms.trim(), emailNettoye, telephone || null, role, matricule, statut_compte, id]
      );
    }

    console.log(`✅ Utilisateur mis à jour — ID: ${id}, ${nom} ${prenoms}`);
    res.json({ ok: true, message: "✅ Utilisateur modifié avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION UTILISATEUR :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UN UTILISATEUR
// ==================================================
router.delete('/utilisateur/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM utilisateurs WHERE id = $1 RETURNING nom, prenom, matricule',
      [id]
    );

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Utilisateur introuvable" });
    }

    const u = r.rows[0];
    console.log(`✅ Utilisateur supprimé — ID: ${id}, ${u.matricule || u.nom}`);
    res.json({ ok: true, message: "✅ Utilisateur supprimé avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION UTILISATEUR :", e.message);
    if (e.code === '23503') {
      return res.json({ ok: false, erreur: "⚠️ Impossible : cet utilisateur est référencé dans d'autres modules" });
    }
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✅ ROUTE PRÉINSCRIPTION DU FORMULAIRE HTML
// ==================================================
router.post('/preinscription', upload.none(), async (req, res) => {
  try {
    const donnees = req.body;
    console.log("📥 Données reçues préinscription :", donnees);

    // Ici : insérer dans la table preinscriptions
    // À adapter selon tes champs

    res.json({
      ok: true,
      message: "✅ Demande enregistrée ! Nous vous contacterons rapidement."
    });
  } catch (err) {
    console.error("❌ Erreur /api/preinscription :", err.message);
    res.json({ ok: false, erreur: "Erreur serveur, réessayez plus tard." });
  }
});

module.exports = router;