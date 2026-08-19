const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const nodemailer = require('nodemailer');
require('dotenv').config();

// 🔑 MIDDLEWARE VÉRIFICATION ADMIN
const verifadmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({erreur:"Token manquant"});
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if(decoded.role !== 'admin' && decoded.role !== 'super_admin'){
      return res.status(403).json({erreur:"Accès réservé à l'administrateur"});
    }
    req.user = decoded;
    next();
  } catch { 
    return res.status(401).json({erreur:"Token invalide ou expiré"}); 
  }
};

// 📁 CONFIG UPLOAD FICHIERS
const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, '../public/uploads/'),
  filename: (req, file, cb) => {
    const nomNettoye = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, Date.now() + '-' + nomNettoye);
  }
});
const upload = multer({ storage: stockage });

// 📧 CONFIG MAIL
const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: { 
    user: process.env.MAIL_USER, 
    pass: process.env.MAIL_PASS 
  }
});

// ==================================================
// 🆕 GÉNÉRER MATRICULE — FORMAT IVOIRIEN
// Format : MZ-AAAA-CLASSE-NNNN  Ex: MZ-2026-CE1-0042
// ==================================================
async function genererMatricule(profil, id_classe = null) {
  const annee = new Date().getFullYear();
  const codeEcole = 'MZ';
  let codeClasse = 'ELEV';

  if (profil === 'eleve' && id_classe) {
    try {
      const resClasse = await pool.query(
        `SELECT libelle_classe FROM classes WHERE id_classe = $1`,
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
    `SELECT COUNT(*) FROM utilisateurs WHERE matricule LIKE $1`,
    [`${codeEcole}-${annee}-${codeClasse}-%`]
  );
  const numero = String(parseInt(compte.rows[0].count) + 1).padStart(4, '0');
  return `${codeEcole}-${annee}-${codeClasse}-${numero}`;
}

// ==================================================
// 🔐 CONNEXION — ÉLÈVE=MATRICULE / AUTRES=EMAIL
// ✅ HARMONISÉE AVEC LA PAGE HTML + GESTION FINANCES
// ==================================================
router.post('/connexion', async (req, res) => {
  try {
    const { email, matricule, mot_de_passe, role } = req.body;

    // ✅ Validation des champs — identique à la page HTML
    if (!mot_de_passe || !role) {
      return res.json({ ok: false, erreur: "Identifiant, mot de passe et profil sont obligatoires" });
    }
    if (role === 'eleve' && !matricule) {
      return res.json({ ok: false, erreur: "Le matricule est obligatoire pour les Élèves" });
    }
    if (role !== 'eleve' && !email) {
      return res.json({ ok: false, erreur: "L'email est obligatoire pour ce profil" });
    }

    // 🔍 Recherche selon le profil
    let r;
    if (role === 'eleve') {
      r = await pool.query(`
        SELECT id_utilisateur, nom, prenoms, email, matricule, role, mot_de_passe, 
               statut_compte, compte_verrouille, tentatives_connexion, date_deverrouillage
        FROM utilisateurs 
        WHERE UPPER(matricule) = UPPER($1) AND role = $2
      `, [matricule ? matricule.trim() : '', role]);
    } else {
      r = await pool.query(`
        SELECT id_utilisateur, nom, prenoms, email, matricule, role, mot_de_passe, 
               statut_compte, compte_verrouille, tentatives_connexion, date_deverrouillage
        FROM utilisateurs 
        WHERE LOWER(email) = LOWER($1) AND role = $2
      `, [email ? email.trim() : '', role]);
    }

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: role === 'eleve'
        ? "Matricule introuvable, compte inactif ou mauvais profil"
        : "Email introuvable, compte inactif ou mauvais profil" });
    }

    const u = r.rows[0];

    // ⚠️ Vérification statut du compte
    if (u.statut_compte !== 'valide') {
      return res.json({ ok: false, erreur: "Compte en attente de validation par l'administration" });
    }

    // 🔒 Déverrouillage automatique après 30 min
    if (u.compte_verrouille) {
      const maintenant = new Date();
      if (maintenant < u.date_deverrouillage) {
        const min = Math.ceil((u.date_deverrouillage - maintenant) / 60000);
        return res.json({ ok: false, erreur: `Compte verrouillé — Réessayez dans ${min} min` });
      } else {
        await pool.query(`
          UPDATE utilisateurs 
          SET compte_verrouille = false, tentatives_connexion = 0 
          WHERE id_utilisateur = $1
        `, [u.id_utilisateur]);
      }
    }

    // ✅ Vérification du mot de passe (clair ou haché)
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
        await pool.query(`
          UPDATE utilisateurs 
          SET tentatives_connexion = $1, compte_verrouille = true, date_deverrouillage = $2 
          WHERE id_utilisateur = $3
        `, [essais, fin, u.id_utilisateur]);
        return res.json({ ok: false, erreur: "5 essais échoués — Compte verrouillé 30 min" });
      }
      await pool.query(`
        UPDATE utilisateurs SET tentatives_connexion = $1 WHERE id_utilisateur = $2
      `, [essais, u.id_utilisateur]);
      return res.json({ ok: false, erreur: `Mot de passe incorrect — ${5 - essais} essai(s) restant(s)` });
    }

    // ✅ Réinitialiser tentatives et mettre à jour connexion
    await pool.query(`
      UPDATE utilisateurs 
      SET tentatives_connexion = 0, derniere_connexion = NOW() 
      WHERE id_utilisateur = $1
    `, [u.id_utilisateur]);

    // 🪪 Générer le token JWT
    const token = jwt.sign(
      { id: u.id_utilisateur, role: u.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // ✅ RÉPONSE HARMONISÉE — correspond EXACTEMENT à ce que la page HTML attend
    res.json({
      ok: true,
      token,
      id_utilisateur: u.id_utilisateur,
      nom: u.nom,
      prenoms: u.prenoms,
      email: u.email,
      matricule: u.matricule,
      role: u.role
    });

  } catch (e) {
    console.error("❌ ERREUR CONNEXION :", e);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 📝 PRÉINSCRIPTION — AVEC NOUVEAU MATRICULE
// ==================================================
router.post('/preinscription/ajouter', upload.fields([{name:'photo_identite'},{name:'documents'}]), async (req, res) => {
  try {
    const { nom, prenoms, email, telephone, role, id_classe, profil, mot_de_passe } = req.body;

    const exist = await pool.query('SELECT * FROM preinscriptions WHERE email = $1', [email.toLowerCase()]);
    if(exist.rows.length > 0) return res.json({ok:false,erreur:'Cet email est déjà utilisé'});

    // ✅ Nouveau matricule
    const matricule = await genererMatricule(profil || role, id_classe);
    const hashMdp = await bcrypt.hash(mot_de_passe, 10);

    const photo = req.files?.photo_identite ? `uploads/${req.files.photo_identite[0].filename}` : null;
    const docs = req.files?.documents ? req.files.documents.map(f => `uploads/${f.filename}`).join('|') : null;

    await pool.query(`
      INSERT INTO preinscriptions(
        type_inscription, profil, nom, prenoms, email, telephone, 
        mot_de_passe, id_classe, matricule, 
        photo_identite, documents, date_preinscription, statut_preinscription
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),'en_attente')
    `, [
      'nouveau', profil || role, nom, prenoms, email.toLowerCase(), telephone,
      hashMdp, id_classe || null, matricule, photo, docs
    ]);

    res.json({ok:true, message:"Demande enregistrée ✅ Nous vous répondrons dans un délai de 24h", matricule});
  } catch (e) { 
    console.error("❌ ERREUR PRÉINSCRIPTION :", e);
    res.json({ok:false,erreur:e.message}); 
  }
});

// ==================================================
// 🔑 MOT DE PASSE OUBLIÉ
// ==================================================
router.post('/mot-de-passe-oublie', async (req, res) => {
  try {
    const { email } = req.body;
    const utilisateur = await pool.query(`
      SELECT id_utilisateur, nom, prenoms, email 
      FROM utilisateurs 
      WHERE email = $1 AND statut_compte = 'valide'
    `, [email]);
    
    if(utilisateur.rows.length === 0) return res.json({ ok: false, erreur: "Aucun compte actif trouvé avec cet email" });
    const user = utilisateur.rows[0];

    const motDePasseTemp = "MZ" + Math.floor(100000 + Math.random() * 900000);
    const motDePasseCrypte = await bcrypt.hash(motDePasseTemp, 10);
    
    await pool.query(`
      UPDATE utilisateurs 
      SET mot_de_passe = $1 
      WHERE id_utilisateur = $2
    `, [motDePasseCrypte, user.id_utilisateur]);
    
    await transport.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: '🔑 Récupération — MAMA-ZOUMANA',
      html: `
        <h2>Bonjour ${user.nom} ${user.prenoms},</h2>
        <p>Nous avons reçu une demande de réinitialisation de mot de passe.</p>
        <p>Votre nouveau mot de passe temporaire est :</p>
        <h3 style="background:#f59e0b; padding:12px; border-radius:6px; font-size:20px; text-align:center;">${motDePasseTemp}</h3>
        <p>Connectez-vous et changez-le immédiatement.</p>
      `
    });

    res.json({ ok: true, message: "Email de réinitialisation envoyé ✅" });
  } catch (e) { 
    console.error("❌ ERREUR MAIL :", e);
    res.json({ ok: false, erreur: "Erreur serveur — Réessayez plus tard" }); 
  }
});

// ==================================================
// 🔐 CHANGEMENT DE MOT DE PASSE
// ==================================================
router.post('/changer-mot-de-passe', async (req, res) => {
  try {
    const { id_utilisateur, ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;
    
    const userResult = await pool.query(`
      SELECT mot_de_passe FROM utilisateurs WHERE id_utilisateur = $1
    `, [id_utilisateur]);
    
    if (userResult.rows.length === 0) return res.json({ ok: false, erreur: "Utilisateur introuvable" });
    
    const utilisateur = userResult.rows[0];
    const estValide = await bcrypt.compare(ancien_mot_de_passe, utilisateur.mot_de_passe);
    
    if (!estValide) return res.json({ ok: false, erreur: "L'ancien mot de passe est incorrect" });
    if (nouveau_mot_de_passe.length < 6) return res.json({ ok: false, erreur: "6 caractères minimum" });
    
    const nouveauCrypte = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await pool.query(`
      UPDATE utilisateurs 
      SET mot_de_passe = $1 
      WHERE id_utilisateur = $2
    `, [nouveauCrypte, id_utilisateur]);
    
    res.json({ ok: true, message: "Mot de passe modifié ✅" });
  } catch (e) { 
    console.error("❌ ERREUR CHANGEMENT MDP :", e);
    res.json({ ok: false, erreur: "Erreur serveur" }); 
  }
});

// ==================================================
// ✅ VALIDER UNE PRÉINSCRIPTION → CRÉER COMPTE AVEC BON MATRICULE
// ==================================================
router.put('/preinscription/valider/:id', verifadmin, async (req, res) => {
  try {
    const id = req.params.id;
    
    const demandeResult = await pool.query(`
      SELECT * FROM preinscriptions WHERE id_preinscription = $1
    `, [id]);
    
    if (demandeResult.rows.length === 0) return res.json({ ok: false, erreur: "Demande introuvable" });
    
    const demande = demandeResult.rows[0];
    if (demande.statut_preinscription !== 'en_attente') {
      return res.json({ ok: false, erreur: "Cette demande n'est pas en attente" });
    }

    const motDePasseTemp = "MZ" + Math.floor(100000 + Math.random() * 900000);
    const hashMdp = await bcrypt.hash(motDePasseTemp, 10);

    await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenoms, email, telephone, role, matricule, 
        mot_de_passe, statut_compte, date_validation, langue_defaut
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'valide', NOW(), 'fr')
    `, [
      demande.nom, demande.prenoms, demande.email, demande.telephone,
      demande.profil, demande.matricule, hashMdp
    ]);

    await pool.query(`
      UPDATE preinscriptions 
      SET statut_preinscription = 'validee' 
      WHERE id_preinscription = $1
    `, [id]);

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

    res.json({ ok: true, message: "Inscription validée ✅ Compte créé et email envoyé." });
  } catch (e) {
    console.error("❌ ERREUR VALIDATION :", e);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ REFUSER UNE PRÉINSCRIPTION
// ==================================================
router.put('/preinscription/refuser/:id', verifadmin, async (req, res) => {
  try {
    await pool.query(`
      UPDATE preinscriptions 
      SET statut_preinscription = 'annulee' 
      WHERE id_preinscription = $1
    `, [req.params.id]);
    
    res.json({ ok: true, message: "Demande refusée ✅" });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTER LES PRÉINSCRIPTIONS EN ATTENTE
// ==================================================
router.get('/preinscription/liste', verifadmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_preinscription, profil, nom, prenoms, email, telephone, 
             matricule, date_preinscription, statut_preinscription,
             photo_identite, documents
      FROM preinscriptions 
      WHERE statut_preinscription = 'en_attente'
      ORDER BY date_preinscription DESC
    `);
    res.json({ ok: true, liste: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE :", e);
    res.json({ ok: false, erreur: e.message });
  }
});

// 📋 LISTE TOUS LES UTILISATEURS
router.get('/utilisateurs', verifadmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_utilisateur, nom, prenoms, email, matricule, telephone, role, statut_compte, date_creation
      FROM utilisateurs ORDER BY nom, prenoms
    `);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.error("Erreur liste utilisateurs :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// 🔴 LIRE UN SEUL UTILISATEUR
router.get('/utilisateur/:id', verifadmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_utilisateur, nom, prenoms, email, matricule, telephone, role, statut_compte
      FROM utilisateurs WHERE id_utilisateur = $1
    `, [req.params.id]);
    if(r.rows.length === 0) return res.json({ok:false, erreur:"Utilisateur introuvable"});
    res.json({ ok: true, utilisateur: r.rows[0] });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// ✏️ MODIFIER UN UTILISATEUR
router.put('/utilisateur/:id', verifadmin, async (req, res) => {
  try {
    const { nom, prenoms, email, telephone, role, statut_compte, matricule, mot_de_passe } = req.body;
    const id = req.params.id;

    const exist = await pool.query('SELECT id_utilisateur FROM utilisateurs WHERE email = $1 AND id_utilisateur != $2', [email, id]);
    if(exist.rows.length > 0) return res.json({ok:false, erreur:"Cet email est déjà utilisé"});

    if(mot_de_passe && mot_de_passe.trim() !== ''){
      const hash = await bcrypt.hash(mot_de_passe, 10);
      await pool.query(`
        UPDATE utilisateurs 
        SET nom=$1, prenoms=$2, email=$3, telephone=$4, role=$5, matricule=$6, statut_compte=$7, mot_de_passe=$8
        WHERE id_utilisateur=$9
      `, [nom, prenoms, email, telephone, role, matricule, statut_compte, hash, id]);
    } else {
      await pool.query(`
        UPDATE utilisateurs 
        SET nom=$1, prenoms=$2, email=$3, telephone=$4, role=$5, matricule=$6, statut_compte=$7
        WHERE id_utilisateur=$8
      `, [nom, prenoms, email, telephone, role, matricule, statut_compte, id]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// 🗑️ SUPPRIMER UN UTILISATEUR
router.delete('/utilisateur/:id', verifadmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM utilisateurs WHERE id_utilisateur = $1 RETURNING id_utilisateur', [req.params.id]);
    if(r.rows.length === 0) return res.json({ok:false, erreur:"Utilisateur introuvable"});
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;