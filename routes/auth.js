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
// ✅ MIDDLEWARES — Chargement sécurisé
// ==================================================
let veriftoken, verifadmin, protegerAdmin;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  protegerAdmin = [veriftoken, verifadmin];
} catch {
  protegerAdmin = []; // Mode secours développement
}

// ==================================================
// 📁 CONFIGURATION UPLOAD
// ==================================================
const dossierUpload = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(dossierUpload)) fs.mkdirSync(dossierUpload, { recursive: true });

const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dossierUpload),
  filename: (req, file, cb) => {
    const nomNettoye = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${Date.now()}-${nomNettoye}`);
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
async function genererMatricule(profil) {
  const annee = new Date().getFullYear();
  const codeEcole = 'MZ';
  const prefixes = {
    admin: 'ADM', directeur: 'DIR', comptable: 'CMP',
    professeur: 'PRF', eleve: 'ELE', parent: 'PAR'
  };
  const prefixe = prefixes[profil] || 'AUT';
  const compte = await pool.query(
    "SELECT COUNT(*) FROM utilisateurs WHERE matricule LIKE $1",
    [`${codeEcole}-${annee}-${prefixe}-%`]
  );
  const numero = String(parseInt(compte.rows[0].count, 10) + 1).padStart(4, '0');
  return `${codeEcole}-${annee}-${prefixe}-${numero}`;
}

// ==================================================
// 🔐 CONNEXION
// ==================================================
router.post('/connexion', async (req, res) => {
  try {
    const { email, matricule, mot_de_passe, role } = req.body;
    if (!mot_de_passe || !role)
      return res.json({ ok: false, erreur: "⚠️ Identifiant, mot de passe et profil sont obligatoires" });
    if (role === 'eleve' && !matricule)
      return res.json({ ok: false, erreur: "⚠️ Le matricule est obligatoire pour les Élèves" });
    if (role !== 'eleve' && !email)
      return res.json({ ok: false, erreur: "⚠️ L'email est obligatoire pour ce profil" });

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
        [matricule?.trim() || '', role]
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
        [email?.trim() || '', role]
      );
    }

    if (r.rows.length === 0) {
      return res.json({
        ok: false,
        erreur: role === 'eleve'
          ? "⚠️ Matricule introuvable ou mauvais profil"
          : "⚠️ Email introuvable ou mauvais profil"
      });
    }

    const u = r.rows[0];
    if (u.statut_compte !== 'valide')
      return res.json({ ok: false, erreur: "⚠️ Compte en attente de validation par l'administration" });

    if (u.compte_verrouille) {
      const maintenant = new Date();
      if (maintenant < new Date(u.date_deverrouillage)) {
        const minutes = Math.ceil((new Date(u.date_deverrouillage) - maintenant) / 60000);
        return res.json({ ok: false, erreur: `⚠️ Compte verrouillé — Réessayez dans ${minutes} min` });
      }
      await pool.query(
        'UPDATE utilisateurs SET compte_verrouille = false, tentatives_connexion = 0 WHERE id = $1',
        [u.id]
      );
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
        const dateDeverrouillage = new Date(Date.now() + 30 * 60000);
        await pool.query(
          'UPDATE utilisateurs SET tentatives_connexion = $1, compte_verrouille = true, date_deverrouillage = $2 WHERE id = $3',
          [essais, dateDeverrouillage, u.id]
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
    console.error("❌ ERREUR CONNEXION :", e.code || '', e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 👨‍👩‍👧 CONNEXION PARENT PAR MATRICULE ENFANT
// ==================================================
router.post('/preinscription/parent-matricule', async (req, res) => {
  try {
    const { matricule, email_parent, telephone_parent } = req.body;
    if (!matricule)
      return res.json({ ok: false, erreur: "⚠️ Saisissez le matricule de l'enfant" });
    if (!email_parent && !telephone_parent)
      return res.json({ ok: false, erreur: "⚠️ Saisissez au moins email OU téléphone du parent" });

    const eleveResult = await pool.query(
      `SELECT id, nom, prenom, email, telephone, matricule,
              email_parent, telephone_parent, nom_parent
       FROM utilisateurs
       WHERE UPPER(matricule) = UPPER($1) AND role = 'eleve' AND COALESCE(statut_compte, 'valide') = 'valide'`,
      [matricule.trim()]
    );

    if (eleveResult.rows.length === 0)
      return res.json({ ok: false, erreur: "⚠️ Aucun élève trouvé avec ce matricule" });

    const enfant = eleveResult.rows[0];
    const correspondEmail = !email_parent || enfant.email_parent?.toLowerCase().trim() === email_parent?.toLowerCase().trim();
    const correspondTel = !telephone_parent || enfant.telephone_parent?.trim() === telephone_parent?.trim();

    if (correspondEmail || correspondTel) {
      const token = jwt.sign(
        { id: enfant.id, nom: enfant.nom_parent || 'Parent', prenom: '', role: 'parent', email: enfant.email_parent },
        CLE_JWT,
        { expiresIn: '8h' }
      );
      console.log(`✅ Connexion Parent réussie — Accès à ${enfant.matricule}`);
      return res.json({
        ok: true,
        token,
        role: 'parent',
        nom: enfant.nom_parent || 'Parent',
        prenom: '',
        enfants: [{
          id: enfant.id,
          nom: enfant.nom,
          prenom: enfant.prenom,
          matricule: enfant.matricule
        }]
      });
    }
    return res.json({ ok: false, erreur: "⚠️ Email ou téléphone ne correspond pas à cet enfant" });
  } catch (e) {
    console.error("❌ ERREUR CONNEXION PARENT :", e.code || '', e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 📝 PRÉINSCRIPTION
// ==================================================
router.post('/preinscription/ajouter', upload.fields([{ name: 'photo_identite' }, { name: 'documents' }]), async (req, res) => {
  try {
    const { nom, prenom, email, telephone, profil, id_classe, mot_de_passe, email_parent, telephone_parent, nom_parent, annee_scolaire } = req.body;

    if (!nom || !prenom || !email || !mot_de_passe)
      return res.json({ ok: false, erreur: "⚠️ Nom, prénom, email et mot de passe sont obligatoires" });
    if (mot_de_passe.length < 6)
      return res.json({ ok: false, erreur: "⚠️ Le mot de passe doit contenir au moins 6 caractères" });

    const emailNettoye = email.toLowerCase().trim();
    const exist = await pool.query('SELECT * FROM preinscriptions WHERE LOWER(email) = $1', [emailNettoye]);
    if (exist.rows.length > 0)
      return res.json({ ok: false, erreur: "⚠️ Cet email est déjà utilisé pour une préinscription" });

    const matricule = await genererMatricule(profil);
    const hashMdp = await bcrypt.hash(mot_de_passe, 10);
    const photo = req.files?.photo_identite?.[0] ? `uploads/${req.files.photo_identite[0].filename}` : null;
    const docs = req.files?.documents?.map(f => `uploads/${f.filename}`).join('|') || null;

    await pool.query(
      `INSERT INTO preinscriptions(
        type_inscription, profil, nom, prenom, email, telephone,
        mot_de_passe, id_classe, matricule, annee_scolaire,
        email_parent, telephone_parent, nom_parent,
        photo_identite, documents, date_preinscription, statut
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), 'en_attente')`,
      [
        'nouveau', profil, nom.trim(), prenom.trim(), emailNettoye, telephone || null,
        hashMdp, id_classe || null, matricule, annee_scolaire || '2026-2027',
        email_parent?.toLowerCase().trim() || null, telephone_parent || null, nom_parent || null,
        photo, docs
      ]
    );

    console.log(`✅ Préinscription enregistrée — ${matricule}, ${nom} ${prenom}`);
    res.json({
      ok: true,
      message: "✅ Demande enregistrée. Nous vous répondrons dans un délai de 24h.",
      matricule
    });
  } catch (e) {
    console.error("❌ ERREUR PRÉINSCRIPTION :", e.code || '', e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 🔑 MOT DE PASSE OUBLIÉ
// ==================================================
router.post('/mot-de-passe-oublie', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.json({ ok: false, erreur: "⚠️ Indiquez votre adresse email" });

    const utilisateurResult = await pool.query(
      `SELECT id, nom, prenom, email
       FROM utilisateurs
       WHERE LOWER(email) = LOWER($1) AND COALESCE(statut_compte, 'valide') = 'valide'`,
      [email.trim()]
    );

    if (utilisateurResult.rows.length === 0)
      return res.json({ ok: false, erreur: "⚠️ Aucun compte actif trouvé avec cet email" });

    const user = utilisateurResult.rows[0];
    const motDePasseTemp = `MZ${Math.floor(100000 + Math.random() * 900000)}`;
    const motDePasseCrypte = await bcrypt.hash(motDePasseTemp, 10);

    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2', [motDePasseCrypte, user.id]);

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
    console.error("❌ ERREUR ENVOI EMAIL :", e.code || '', e.message);
    res.json({ ok: false, erreur: "⚠️ Erreur serveur — Réessayez plus tard" });
  }
});

// ==================================================
// 🔐 CHANGEMENT DE MOT DE PASSE
// ==================================================
router.post('/changer-mot-de-passe', veriftoken, async (req, res) => {
  try {
    const { id, ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;
    if (!id || !ancien_mot_de_passe || !nouveau_mot_de_passe)
      return res.json({ ok: false, erreur: "⚠️ Tous les champs sont obligatoires" });
    if (nouveau_mot_de_passe.length < 6)
      return res.json({ ok: false, erreur: "⚠️ Le nouveau mot de passe doit contenir au moins 6 caractères" });

    const userResult = await pool.query('SELECT mot_de_passe, nom, prenom FROM utilisateurs WHERE id = $1', [id]);
    if (userResult.rows.length === 0)
      return res.json({ ok: false, erreur: "⚠️ Utilisateur introuvable" });

    const utilisateur = userResult.rows[0];
    const estValide = await bcrypt.compare(ancien_mot_de_passe, utilisateur.mot_de_passe);
    if (!estValide)
      return res.json({ ok: false, erreur: "⚠️ L'ancien mot de passe est incorrect" });

    const nouveauCrypte = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2', [nouveauCrypte, id]);

    console.log(`✅ Mot de passe modifié — ${utilisateur.nom} ${utilisateur.prenom}`);
    res.json({ ok: true, message: "✅ Mot de passe modifié avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR CHANGEMENT MDP :", e.code || '', e.message);
    res.json({ ok: false, erreur: "Erreur serveur" });
  }
});

// ==================================================
// ✅ CRÉER UTILISATEUR PAR ADMIN (corrigé id_classe)
// ==================================================
router.post('/utilisateurs/creer-admin', protegerAdmin, async (req, res) => {
  try {
    const {
      nom, prenom, email, telephone, role, statut_compte, annee_scolaire,
      date_naissance, lieu_naissance, id_classe,
      nom_pere, nom_mere, telephone_pere, telephone_mere
    } = req.body;

    if (!nom || !prenom || !email || !role)
      return res.json({ ok: false, erreur: "Nom, Prénom, Email et Profil sont OBLIGATOIRES" });

    // ✅ Classe OBLIGATOIRE UNIQUEMENT si ÉLÈVE
    if (role === 'eleve' && !id_classe)
      return res.json({ ok: false, erreur: "⚠️ La Classe est OBLIGATOIRE pour un Élève" });

    const matricule = await genererMatricule(role);
    const mdpProvisoire = Math.random().toString(36).slice(2, 10).toUpperCase();
    const motDePasseHash = await bcrypt.hash(mdpProvisoire, 10);

    // ✅ id_classe = NULL si pas élève
    const result = await pool.query(`
      INSERT INTO utilisateurs (
        nom, prenom, email, mot_de_passe, matricule, telephone,
        role, statut_compte, est_actif, annee_scolaire,
        id_classe, date_naissance, lieu_naissance,
        nom_pere, nom_mere, telephone_pere, telephone_mere,
        date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      RETURNING id, matricule, nom, prenom
    `, [
      nom.trim(), prenom.trim(), email.toLowerCase().trim(), motDePasseHash, matricule, telephone || null,
      role, statut_compte || 'en_attente', true, annee_scolaire || '2026-2027',
      role === 'eleve' ? id_classe : null,
      date_naissance || null, lieu_naissance || null,
      nom_pere || null, nom_mere || null, telephone_pere || null, telephone_mere || null
    ]);

    res.json({
      ok: true,
      utilisateur: result.rows[0],
      matricule,
      mdp_provisoire: mdpProvisoire,
      message: "✅ Utilisateur créé"
    });
  } catch (e) {
    console.error("❌ ERREUR CRÉATION :", e.code || '', e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE UTILISATEURS (format harmonisé)
// ==================================================
router.get('/utilisateurs', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone, u.role,
        COALESCE(u.statut_compte, 'valide') AS statut_compte,
        u.annee_scolaire,
        CASE WHEN u.role = 'eleve' THEN c.libelle_classe ELSE NULL END AS classe,
        CASE WHEN u.role = 'eleve' THEN u.id_classe ELSE NULL END AS id_classe
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      ORDER BY u.role, u.nom, u.prenom
    `);
    console.log(`✅ Liste utilisateurs consultée — ${rows.length} élément(s)`);
    res.json({ ok: true, utilisateurs: rows, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE :", e.code || '', e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🔍 CHARGER UN SEUL UTILISATEUR
// ==================================================
router.get('/utilisateurs/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.json({ ok: false, erreur: "ID invalide" });

    const { rows } = await pool.query(`
      SELECT *,
        CASE WHEN role = 'eleve' THEN id_classe ELSE NULL END AS id_classe
      FROM utilisateurs WHERE id = $1
    `, [id]);

    if (rows.length === 0)
      return res.json({ ok: false, erreur: "Utilisateur introuvable" });

    res.json({ ok: true, utilisateur: rows[0] });
  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT :", e.code || '', e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UTILISATEUR (id_classe conditionnel)
// ==================================================
router.put('/utilisateurs/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.json({ ok: false, erreur: "ID invalide" });

    const {
      nom, prenom, email, telephone, role, statut_compte, annee_scolaire,
      date_naissance, lieu_naissance, id_classe,
      nom_pere, nom_mere, telephone_pere, telephone_mere
    } = req.body;

    if (!nom || !prenom || !email)
      return res.json({ ok: false, erreur: "Nom, Prénom et Email OBLIGATOIRES" });
    if (role === 'eleve' && !id_classe)
      return res.json({ ok: false, erreur: "⚠️ Classe OBLIGATOIRE pour un Élève" });

    await pool.query(`
      UPDATE utilisateurs SET
        nom = $1, prenom = $2, email = $3, telephone = $4,
        role = $5, statut_compte = $6, annee_scolaire = $7,
        id_classe = CASE WHEN $5 = 'eleve' THEN $8 ELSE NULL END,
        date_naissance = $9, lieu_naissance = $10,
        nom_pere = $11, nom_mere = $12, telephone_pere = $13, telephone_mere = $14,
        date_mise_a_jour = NOW()
      WHERE id = $15
    `, [
      nom.trim(), prenom.trim(), email.toLowerCase().trim(), telephone || null,
      role, statut_compte, annee_scolaire,
      id_classe || null,
      date_naissance || null, lieu_naissance || null,
      nom_pere || null, nom_mere || null, telephone_pere || null, telephone_mere || null,
      id
    ]);

    res.json({ ok: true, message: "✅ Utilisateur modifié" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION :", e.code || '', e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UTILISATEUR
// ==================================================
router.delete('/utilisateurs/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.json({ ok: false, erreur: "ID invalide" });

    const { rows } = await pool.query('DELETE FROM utilisateurs WHERE id = $1 RETURNING nom, prenom', [id]);
    if (rows.length === 0)
      return res.json({ ok: false, erreur: "Utilisateur introuvable" });

    console.log(`✅ Utilisateur supprimé — ${rows[0].nom} ${rows[0].prenom}`);
    res.json({ ok: true, message: "✅ Utilisateur supprimé" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION :", e.code || '', e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Impossible : référencé ailleurs" });
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✅ VALIDER PRÉINSCRIPTION → CRÉER COMPTE UTILISATEUR
// ==================================================
router.put('/preinscription/valider/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const demandeResult = await pool.query('SELECT * FROM preinscriptions WHERE id_preinscription = $1', [id]);
    if (demandeResult.rows.length === 0)
      return res.json({ ok: false, erreur: "⚠️ Demande introuvable" });

    const demande = demandeResult.rows[0];
    if (demande.statut !== 'en_attente')
      return res.json({ ok: false, erreur: "⚠️ Déjà traitée" });

    const existeDeja = await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER($1)', [demande.email]);
    if (existeDeja.rows.length > 0)
      return res.json({ ok: false, erreur: "⚠️ Email déjà utilisé" });

    const motDePasseTemp = `MZ${Math.floor(100000 + Math.random() * 900000)}`;
    const hashMdp = await bcrypt.hash(motDePasseTemp, 10);
    const matricule = await genererMatricule(demande.profil);

    // ✅ INSERT avec id_classe conditionnel
    await pool.query(
      `INSERT INTO utilisateurs(
        nom, prenom, email, telephone, role, matricule,
        mot_de_passe, statut_compte, annee_scolaire,
        id_classe, date_naissance, lieu_naissance,
        email_parent, telephone_parent, nom_parent, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'valide', $8, $9, $10, $11, $12, $13, $14, NOW())`,
      [
        demande.nom, demande.prenom, demande.email, demande.telephone, demande.profil, matricule, hashMdp,
        demande.annee_scolaire || '2026-2027',
        demande.profil === 'eleve' ? demande.id_classe : null,
        demande.date_naissance || null, demande.lieu_naissance || null,
        demande.email_parent || null, demande.telephone_parent || null, demande.nom_parent || null
      ]
    );

    await pool.query(
      "UPDATE preinscriptions SET statut = 'validee', matricule = $1 WHERE id_preinscription = $2",
      [matricule, id]
    );

    await transport.sendMail({
      from: process.env.MAIL_USER,
      to: demande.email,
      subject: '✅ Inscription validée — MAMA-ZOUMANA',
      html: `
        <h2>Félicitations ${demande.nom} ! 🎉</h2>
        <p>Votre inscription a été validée.</p>
        <p><strong>Matricule :</strong> ${matricule}</p>
        <p><strong>Mot de passe temporaire :</strong> <code>${motDePasseTemp}</code></p>
        <p>Connectez-vous et changez-le immédiatement.</p>
      `
    });

    console.log(`✅ Préinscription validée — ${matricule}`);
    res.json({ ok: true, message: "✅ Inscription validée", matricule });
  } catch (e) {
    console.error("❌ ERREUR VALIDATION :", e.code || '', e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ REFUSER PRÉINSCRIPTION
// ==================================================
router.put('/preinscription/refuser/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rows } = await pool.query(
      "UPDATE preinscriptions SET statut = 'annulee' WHERE id_preinscription = $1 RETURNING nom, prenom",
      [id]
    );
    if (rows.length === 0)
      return res.json({ ok: false, erreur: "⚠️ Demande introuvable" });

    console.log(`✅ Préinscription refusée — ${rows[0].nom} ${rows[0].prenom}`);
    res.json({ ok: true, message: "✅ Demande refusée" });
  } catch (e) {
    console.error("❌ ERREUR REFUS :", e.code || '', e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE PRÉINSCRIPTIONS EN ATTENTE
// ==================================================
router.get('/preinscription/liste', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_preinscription, profil, nom, prenom, email, telephone,
             matricule, date_preinscription, statut,
             email_parent, telephone_parent, nom_parent,
             annee_scolaire, id_classe
      FROM preinscriptions WHERE statut = 'en_attente' ORDER BY date_preinscription DESC
    `);
    console.log(`✅ Liste préinscriptions — ${rows.length} demande(s)`);
    res.json({ ok: true, liste: rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE PRÉINS :", e.code || '', e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;