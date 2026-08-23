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
// ✅ CLÉ JWT UNIFIÉE — MÊME VALEUR PARTOUT
// ==================================================
const CLE_JWT = process.env.JWT_SECRET || 'ma_cle_secrete_pour_le_site_2026';

// ==================================================
// ✅ MIDDLEWARES IMPORTÉS ET HARMONISÉS
// ==================================================
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const protegerAdmin = [veriftoken, verifadmin];

// ✅ Middleware vérification parent
async function verifParent(req, res, next) {
  try {
    const u = req.user;
    if (u.role !== 'parent') {
      return res.json({ ok: false, erreur: "⛔ Espace réservé aux parents" });
    }
    req.filtreParent = {
      email_parent: u.email_parent || null,
      telephone_parent: u.telephone_parent || null
    };
    next();
  } catch {
    return res.json({ ok: false, erreur: "⛔ Session invalide" });
  }
}
const protegerParent = [veriftoken, verifParent];

// ==================================================
// ✅ GÉNÉRATION DU MATRICULE — FORME : MZ + ANNÉE + ÂGE + N°
// ==================================================
async function genererMatricule(dateNaissance, anneeScolaire) {
  // 1. Extraire l'année de fin (ex: '2025-2026' → '2026')
  const anneeFin = anneeScolaire.slice(-4);

  // 2. Calculer l'âge au 1er octobre de l'année scolaire
  const dateDebut = new Date(`${anneeScolaire.slice(0,4)}-10-01`);
  const naissance = new Date(dateNaissance);
  let age = dateDebut.getFullYear() - naissance.getFullYear();
  const mois = dateDebut.getMonth() - naissance.getMonth();
  if (mois < 0 || (mois === 0 && dateDebut.getDate() < naissance.getDate())) {
    age--;
  }
  // Garantir 2 chiffres minimum, borne raisonnable
  age = Math.max(5, Math.min(99, age));

  // 3. Trouver le prochain numéro pour ce couple (année + âge)
  const prefixeRecherche = `MZ${anneeFin}${String(age).padStart(2,'0')}`;
  const resultat = await pool.query(
    `SELECT matricule FROM utilisateurs WHERE matricule LIKE $1 ORDER BY matricule DESC LIMIT 1`,
    [`${prefixeRecherche}%`]
  );

  let numero = 1;
  if (resultat.rows.length > 0) {
    const dernier = resultat.rows[0].matricule;
    numero = parseInt(dernier.slice(-3), 10) + 1;
  }

  // 4. Construire le matricule final
  return `MZ${anneeFin}${String(age).padStart(2,'0')}${String(numero).padStart(3,'0')}`;
}

// ==================================================
// ✅ VÉRIFIER APPARTENANCE D'UN ENFANT
// ==================================================
async function verifierAppartenanceEnfant(id_eleve, filtre, pool) {
  const r = await pool.query(`
    SELECT u.id, u.nom, u.prenom, u.matricule, u.id_classe, u.statut_compte,
           c.libelle_classe
    FROM utilisateurs u
    LEFT JOIN classes c ON u.id_classe = c.id_classe
    WHERE u.role = 'eleve' AND u.id = $1
      AND (
        (LOWER(u.email_parent) = LOWER($2) AND $2 <> '')
        OR (REPLACE(u.telephone_parent, ' ', '') = REPLACE($3, ' ', '') AND $3 <> '')
      )
    LIMIT 1
  `, [id_eleve, filtre.email_parent || '', filtre.telephone_parent || '']);
  return r.rows.length ? r.rows[0] : null;
}

// ==================================================
// 📁 CONFIGURATION MULTER — Upload sécurisé
// ==================================================
const dossierUpload = path.join(__dirname, '../../public/uploads/');
if (!fs.existsSync(dossierUpload)) {
  fs.mkdirSync(dossierUpload, { recursive: true });
}

const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dossierUpload),
  filename: (req, file, cb) => {
    const nomNettoye = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${Date.now()}-${nomNettoye}`);
  }
});
const upload = multer({ storage: stockage });

// ==================================================
// 📧 ENVOI D'EMAIL CENTRALISÉ
// ==================================================
async function envoyerEmail(destinataire, sujet, messageHtml) {
  if (!destinataire) return false;
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
// 🔧 DÉTERMINER LE PROFIL
// ==================================================
function determinerProfil(d) {
  if (d.profil) return d.profil;
  if (d.id_classe_souhaitee) return 'eleve';
  if (d.nom_parent) return 'parent';
  if (d.cv) return 'prof';
  return 'visiteur';
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
      nom_pere, profession_pere, telephone_pere, email_pere,
      nom_mere, profession_mere, telephone_mere, email_mere, adresse_famille,
      moyenne, rang, mention, conduite,
      id_classe_souhaitee, observations,
      cantine, transport, circuit_transport,
      annee_scolaire
    } = req.body;

    const id_classe_nombre = (id_classe_souhaitee && id_classe_souhaitee !== '' && !isNaN(Number(id_classe_souhaitee)))
      ? Number(id_classe_souhaitee)
      : null;

    let libelleClasse = null, placesRestantes = null, capaciteMax = null, placesOccupeesActuelles = null;
    if ((profil === 'eleve' || id_classe_nombre) && id_classe_nombre) {
      const verifClasse = await pool.query(
        'SELECT id_classe, libelle_classe, capacite_max, places_occupees FROM classes WHERE id_classe = $1',
        [id_classe_nombre]
      );
      if (verifClasse.rows.length === 0) {
        return res.json({ ok: false, erreur: "❌ Cette classe n'existe pas ! Choisissez dans la liste." });
      }
      libelleClasse = verifClasse.rows[0].libelle_classe;
      capaciteMax = verifClasse.rows[0].capacite_max;
      placesOccupeesActuelles = verifClasse.rows[0].places_occupees || 0;
      placesRestantes = capaciteMax - placesOccupeesActuelles;
      if (placesRestantes <= 0) {
        return res.json({ ok: false, erreur: `❌ La classe ${libelleClasse} est complète ! Aucune place disponible.` });
      }
    }

    const photo_identite = req.files?.photo_identite ? `uploads/${req.files.photo_identite[0].filename}` : null;
    const extrait_naissance = req.files?.extrait_naissance ? `uploads/${req.files.extrait_naissance[0].filename}` : null;
    const bulletin = req.files?.bulletin ? `uploads/${req.files.bulletin[0].filename}` : null;
    const cv = req.files?.cv ? `uploads/${req.files.cv[0].filename}` : null;

    const champs = [
      'nom_famille', 'prenom', 'sexe', 'date_naissance', 'lieu_naissance',
      'nationalite', 'adresse', 'telephone', 'email',
      'nom_parent', 'telephone_parent', 'email_parent',
      'id_classe_souhaitee', 'observations', 'statut',
      'photo_identite', 'extrait_naissance', 'bulletin', 'cv',
      'cantine', 'transport', 'circuit_transport', 'annee_scolaire'
    ];
    const valeurs = [
      nom_famille, prenom, sexe, date_naissance || null, lieu_naissance || null,
      nationalite || null, adresse || null, telephone || null, email || null,
      nom_parent || null, telephone_parent || null, email_parent || null,
      id_classe_nombre || null, observations || null, 'en_attente',
      photo_identite, extrait_naissance, bulletin, cv,
      cantine === 'on', transport === 'on', circuit_transport || null,
      annee_scolaire || '2025-2026'
    ];

    if (profil === 'eleve') {
      champs.push(
        'nom_pere', 'profession_pere', 'telephone_pere', 'email_pere',
        'nom_mere', 'profession_mere', 'telephone_mere', 'email_mere', 'adresse_famille',
        'moyenne_annee_precedente', 'classement', 'mention', 'conduite'
      );
      valeurs.push(
        nom_pere || null, profession_pere || null, telephone_pere || null, email_pere || null,
        nom_mere || null, profession_mere || null, telephone_mere || null, email_mere || null, adresse_famille || null,
        moyenne || null, rang || null, mention || null, conduite || null
      );
    }

    const requete = `INSERT INTO preinscriptions (${champs.join(', ')}) VALUES (${champs.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`;
    const resultat = await pool.query(requete, valeurs);
    const idDemande = resultat.rows[0].id;

    if (id_classe_nombre && placesRestantes !== null) {
      await pool.query('UPDATE classes SET places_occupees = places_occupees + 1 WHERE id_classe = $1', [id_classe_nombre]);
      placesRestantes = (capaciteMax || 0) - ((placesOccupeesActuelles || 0) + 1);
    }

    const infoClasse = libelleClasse
      ? `🏫 Classe demandée : ${libelleClasse}<br>📊 Places restantes : <strong>${placesRestantes}</strong> place(s)`
      : '';
    const infosParentsHtml = profil === 'eleve' && nom_pere
      ? `<br>👨‍👩 Informations famille enregistrées ✅`
      : '';
    const infosAnneeHtml = profil === 'eleve' && moyenne
      ? `<br>📊 Résultats année précédente : ${moyenne}/20 — ${mention || ''}`
      : '';

    const destEmail = email || email_parent;
    if (destEmail) {
      await envoyerEmail(destEmail, '✅ Préinscription enregistrée — MAMA-ZOUMANA', `
        <h3>Demande enregistrée</h3>
        <p>Bonjour <strong>${prenom} ${nom_famille}</strong>,</p>
        <p>Nous accusons réception de votre demande de préinscription.</p>
        <p>${infoClasse}${infosParentsHtml}${infosAnneeHtml}</p>
        <p>⏳ En attente de validation par l'administration (délai ~24h).</p>
        <p>À la validation, vous recevrez votre <strong>matricule</strong> et vos identifiants.</p>
        <hr><p>Établissement MAMA-ZOUMANA</p>
      `);
    }

    console.log(`✅ PRÉINSCRIPTION ENREGISTRÉE — ID: ${idDemande} | Profil: ${profil}`);
    res.json({
      ok: true,
      message: `✅ Préinscription enregistrée !${libelleClasse ? `\n🏫 Classe : ${libelleClasse}\n📊 Places restantes : ${placesRestantes}` : ''}\n⏳ En attente de validation.`,
      id: idDemande,
      libelle_classe: libelleClasse,
      places_restantes: placesRestantes
    });

  } catch (e) {
    console.error("❌ ERREUR INSERTION :", e.message);
    res.json({
      ok: false,
      erreur: e.message.includes('unique constraint') ? '❌ Cet email est déjà utilisé !' : e.message
    });
  }
});

// ==================================================
// ✅ VALIDER UNE DEMANDE → CRÉE COMPTE + MATRICULE
// ==================================================
router.put('/valider/:id', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const demande = await pool.query('SELECT * FROM preinscriptions WHERE id = $1', [id]);
    if (demande.rows.length === 0) return res.json({ ok: false, erreur: "❌ Demande introuvable !" });
    const d = demande.rows[0];

    const profil = determinerProfil(d);

    // ✅ NOUVEAU MATRICULE UNIQUEMENT POUR ÉLÈVE
    let matricule;
    if (profil === 'eleve' && d.date_naissance) {
      const anneeScolaire = d.annee_scolaire || '2025-2026';
      matricule = await genererMatricule(d.date_naissance, anneeScolaire);
    } else {
      // Pour les autres profils → format simple
      const prefixes = { prof: 'ENS', parent: 'PAR', visiteur: 'VIS' };
      matricule = `${prefixes[profil] || 'VIS'}-${String(d.id).padStart(5, '0')}`;
    }

    const motDePasseProvisoire = Math.random().toString(36).substring(2, 10).toUpperCase() + '@1A';
    const hashMdp = await bcrypt.hash(motDePasseProvisoire, 10);

    await pool.query("UPDATE preinscriptions SET statut = 'valide' WHERE id = $1", [id]);

    await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenom, email, telephone, mot_de_passe, role, matricule,
        email_parent, telephone_parent, nom_pere, nom_mere, adresse_famille,
        moyenne_annee_precedente, mention, classement, note_conduite,
        id_classe, est_actif, statut_compte, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true, 'valide', CURRENT_TIMESTAMP)
    `, [
      d.nom_famille, d.prenom, d.email || d.email_parent, d.telephone || d.telephone_parent,
      hashMdp, profil, matricule,
      d.email_parent || null, d.telephone_parent || null,
      d.nom_pere || null, d.nom_mere || null, d.adresse_famille || null,
      d.moyenne_annee_precedente || null, d.mention || null, d.classement || null, d.conduite || null,
      d.id_classe_souhaitee || null
    ]);

    const destEmail = d.email || d.email_parent;
    if (destEmail) {
      const infosParentsHtml = profil === 'eleve' && d.nom_pere
        ? `<div class="info">👨‍👩 Parents enregistrés ✅</div>` : '';
      const infosAnneeHtml = profil === 'eleve' && d.moyenne_annee_precedente
        ? `<div class="info">📚 Résultat année précédente : ${d.moyenne_annee_precedente}/20 — ${d.mention || ''}</div>` : '';

      await envoyerEmail(destEmail, '✅ INSCRIPTION VALIDÉE — MAMA-ZOUMANA', `
        <!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>
          body{font-family:Arial,sans-serif;background:#f0f9ff;padding:20px;}
          .boite{background:white;padding:25px;border-radius:12px;border:3px solid #f59e0b;max-width:500px;}
          h2{color:#0c4a6e;text-align:center;}
          .info{background:#f8fafc;padding:12px;margin:8px 0;border-radius:8px;border-left:4px solid #0369a1;}
          .important{background:#fffbeb;border-left:4px solid #f59e0b;font-weight:bold;}
          code{background:#e2e8f0;padding:4px 10px;border-radius:4px;font-size:16px;color:#0c4a6e;}
        </style></head><body><div class="boite">
          <h2>✅ INSCRIPTION VALIDÉE</h2>
          <p>Bonjour <strong>${d.prenom} ${d.nom_famille}</strong>,</p>
          <p>Votre demande de préinscription a été validée !</p>
          ${infosParentsHtml}${infosAnneeHtml}
          <div class="info">📋 <strong>Matricule :</strong><br><code>${matricule}</code></div>
          <div class="info important">🔑 <strong>Identifiants de connexion :</strong><br>
            Email : ${destEmail}<br>
            MDP provisoire : <code>${motDePasseProvisoire}</code>
          </div>
          <p style="color:#ef4444;font-weight:bold;">⚠️ Connectez-vous et modifiez votre mot de passe.</p>
          <hr><p style="text-align:center;color:#64748b;">Établissement MAMA-ZOUMANA</p>
        </div></body></html>
      `);
    }

    console.log(`✅ VALIDÉE — ID:${id} | Matricule:${matricule} | Profil:${profil}`);
    res.json({
      ok: true,
      message: "✅ Inscription validée ! Compte créé et identifiants envoyés par email.",
      matricule
    });

  } catch (e) {
    console.error("❌ ERREUR VALIDATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 PRÉINSCRIPTIONS EN ATTENTE — Admin seul
// ==================================================
router.get('/en-attente', protegerAdmin, async (req, res) => {
  try {
    const liste = await pool.query(`
      SELECT id, nom_famille, prenom, email, telephone,
             nom_parent, telephone_parent, id_classe_souhaitee, statut, date_creation
      FROM preinscriptions WHERE statut = 'en_attente' ORDER BY date_creation DESC
    `);
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
      SELECT id, nom_famille, prenom, sexe, date_naissance, email, telephone,
             nom_parent, telephone_parent, id_classe_souhaitee, statut, date_creation
      FROM preinscriptions ORDER BY date_creation DESC
    `);
    const resultat = await Promise.all(liste.rows.map(async d => {
      let libelleClasse = null;
      if (d.id_classe_souhaitee) {
        const c = await pool.query('SELECT libelle_classe FROM classes WHERE id_classe = $1', [d.id_classe_souhaitee]);
        if (c.rows.length) libelleClasse = c.rows[0].libelle_classe;
      }
      return { ...d, classe: libelleClasse };
    }));
    res.json({ ok: true, liste: resultat });
  } catch (e) {
    console.error("❌ ERREUR LISTE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ REFUSER UNE DEMANDE — Admin seul
// ==================================================
router.put('/refuser/:id', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const demande = await pool.query('SELECT id_classe_souhaitee FROM preinscriptions WHERE id = $1', [id]);
    if (demande.rows.length === 0) return res.json({ ok: false, erreur: "❌ Demande introuvable !" });
    const idClasse = demande.rows[0].id_classe_souhaitee;

    if (idClasse) {
      await pool.query('UPDATE classes SET places_occupees = GREATEST(0, places_occupees - 1) WHERE id_classe = $1', [idClasse]);
    }
    await pool.query("UPDATE preinscriptions SET statut = 'refusee' WHERE id = $1", [id]);

    console.log(`🗑️ REFUSÉE — ID:${id} | Classe:${idClasse || 'aucune'}`);
    res.json({ ok: true, message: "✅ Demande refusée. Place libérée." });
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
      SELECT *, nom_pere, nom_mere, adresse_famille,
             moyenne_annee_precedente, mention, classement, conduite
      FROM preinscriptions WHERE id = $1
    `, [req.params.id]);
    if (r.rows.length === 0) return res.json({ ok: false, erreur: "❌ Introuvable" });
    const d = r.rows[0];
    let libelleClasse = null;
    if (d.id_classe_souhaitee) {
      const c = await pool.query('SELECT libelle_classe FROM classes WHERE id_classe = $1', [d.id_classe_souhaitee]);
      if (c.rows.length) libelleClasse = c.rows[0].libelle_classe;
    }
    res.json({ ok: true, demande: { ...d, classe: libelleClasse } });
  } catch (e) {
    console.error("❌ ERREUR DÉTAIL :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🔑 CONNEXION PARENT PAR MATRICULE — Publique
// ==================================================
router.post('/parent-matricule', async (req, res) => {
  try {
    const { matricule, email_parent, telephone_parent } = req.body;
    if (!matricule) {
      return res.json({ ok: false, erreur: "⚠️ Veuillez fournir le matricule de l'enfant." });
    }

    const enfant = await pool.query(`
      SELECT id, nom, prenom, matricule, id_classe, telephone_parent, email_parent, statut_compte, est_actif
      FROM utilisateurs WHERE matricule = $1 AND role = 'eleve' LIMIT 1
    `, [matricule]);
    if (enfant.rows.length === 0) {
      return res.json({ ok: false, erreur: "❌ Aucun élève trouvé avec ce matricule." });
    }
    const e = enfant.rows[0];

    const correspondEmail = email_parent && e.email_parent && e.email_parent.toLowerCase() === email_parent.toLowerCase();
    const correspondTel = telephone_parent && e.telephone_parent && e.telephone_parent.replace(/\s/g, '') === telephone_parent.replace(/\s/g, '');
    if (!correspondEmail && !correspondTel) {
      return res.json({ ok: false, erreur: "⚠️ Informations du parent non concordantes. Vérifiez l'email ou le téléphone." });
    }

    const tousEnfants = await pool.query(`
      SELECT id, nom, prenom, matricule, id_classe, statut_compte
      FROM utilisateurs WHERE role = 'eleve'
        AND (
          (email_parent IS NOT NULL AND LOWER(email_parent) = LOWER($1))
          OR (telephone_parent IS NOT NULL AND REPLACE(telephone_parent, ' ', '') = REPLACE($2, ' ', ''))
        )
      ORDER BY nom, prenom
    `, [e.email_parent || '', e.telephone_parent || '']);

    const token = jwt.sign({
      id: `parent-${Date.now()}`,
      role: 'parent',
      email_parent: e.email_parent,
      telephone_parent: e.telephone_parent,
      nombre_enfants: tousEnfants.rows.length
    }, CLE_JWT, { expiresIn: '30d' });

    console.log(`👨‍👩‍👧 CONNEXION PARENT — ${tousEnfants.rows.length} enfant(s) trouvé(s)`);
    res.json({
      ok: true,
      message: `✅ Connexion réussie ! ${tousEnfants.rows.length} enfant(s) trouvé(s).`,
      token,
      parent: { email_parent: e.email_parent, telephone_parent: e.telephone_parent },
      enfants: tousEnfants.rows
    });

  } catch (err) {
    console.error("❌ ERREUR CONNEXION PARENT :", err.message);
    res.json({ ok: false, erreur: "❌ Erreur serveur : " + err.message });
  }
});

// ==================================================
// 👶 1. LISTE DES ENFANTS — GET /mes-enfants
// ==================================================
router.get('/mes-enfants', protegerParent, async (req, res) => {
  try {
    const { email_parent, telephone_parent } = req.filtreParent;

    const r = await pool.query(`
      SELECT u.id, u.nom, u.prenom, u.matricule, u.id_classe, u.statut_compte,
             c.libelle_classe
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve'
        AND (
          (LOWER(u.email_parent) = LOWER($1) AND $1 <> '')
          OR (REPLACE(u.telephone_parent, ' ', '') = REPLACE($2, ' ', '') AND $2 <> '')
        )
      ORDER BY u.prenom, u.nom
    `, [email_parent || '', telephone_parent || '']);

    console.log(`✅ mes-enfants : ${r.rows.length} élève(s) trouvé(s)`);
    res.json({ ok: true, enfants: r.rows });

  } catch (e) {
    console.error("❌ ERREUR mes-enfants :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📝 2. NOTES PAR TRIMESTRE — GET /notes/:id_eleve
// ==================================================
router.get('/notes/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const trimestre = req.query.trimestre || '1';
    const filtre = req.filtreParent;

    const enfant = await verifierAppartenanceEnfant(id_eleve, filtre, pool);
    if (!enfant) {
      return res.json({ ok: false, erreur: "⛔ Accès refusé — Cet enfant ne vous appartient pas." });
    }

    const r = await pool.query(`
      SELECT n.id, n.trimestre, n.note1, n.note2, n.note3, n.moyenne,
             m.libelle_matiere, m.coefficient
      FROM notes n
      LEFT JOIN matieres m ON n.id_matiere = m.id_matiere
      WHERE n.id_eleve = $1 AND n.trimestre = $2
      ORDER BY m.libelle_matiere
    `, [id_eleve, trimestre]);

    const notesValides = r.rows.filter(n => n.moyenne !== null && n.moyenne !== '');
    const valeurs = notesValides.map(n => parseFloat(n.moyenne));
    const moyenne_generale = valeurs.length
      ? (valeurs.reduce((a, b) => a + b, 0) / valeurs.length).toFixed(2)
      : null;

    let mention = '';
    if (moyenne_generale >= 18) mention = '🏆 EXCELLENT';
    else if (moyenne_generale >= 16) mention = '⭐ TRÈS BIEN';
    else if (moyenne_generale >= 14) mention = '✅ BIEN';
    else if (moyenne_generale >= 12) mention = '📝 ASSEZ BIEN';
    else if (moyenne_generale >= 10) mention = '🟡 PASSABLE';
    else if (moyenne_generale) mention = '🔴 INSUFFISANT';

    console.log(`✅ notes/${id_eleve} Trimestre ${trimestre} — ${r.rows.length} notes`);
    res.json({ ok: true, notes: r.rows, moyenne_generale, mention });

  } catch (e) {
    console.error("❌ ERREUR notes :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📚 3. BULLETINS 3 ANS — GET /bulletins/:id_eleve
// ==================================================
router.get('/bulletins/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const filtre = req.filtreParent;

    const enfant = await verifierAppartenanceEnfant(id_eleve, filtre, pool);
    if (!enfant) {
      return res.json({ ok: false, erreur: "⛔ Accès refusé" });
    }

    const r = await pool.query(`
      SELECT annee_scolaire, moyenne, mention, rang, note_conduite
      FROM bulletins
      WHERE id_eleve = $1
      ORDER BY annee_scolaire DESC
      LIMIT 3
    `, [id_eleve]);

    console.log(`✅ bulletins/${id_eleve} — ${r.rows.length} année(s)`);
    res.json({ ok: true, bulletins: r.rows });

  } catch (e) {
    console.error("❌ ERREUR bulletins :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📅 4. EMPLOI DU TEMPS — GET /edt/:id_eleve
// ==================================================
router.get('/edt/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const filtre = req.filtreParent;

    const enfant = await verifierAppartenanceEnfant(id_eleve, filtre, pool);
    if (!enfant || !enfant.id_classe) {
      return res.json({ ok: false, erreur: enfant ? "ℹ️ Classe non définie" : "⛔ Accès refusé" });
    }

    const r = await pool.query(`
      SELECT jour, heure_debut, heure_fin, libelle_matiere, salle
      FROM emploi
      WHERE id_classe = $1
      ORDER BY
        CASE jour
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6
        END,
        heure_debut
    `, [enfant.id_classe]);

    console.log(`✅ edt/${id_eleve} — ${r.rows.length} séance(s)`);
    res.json({ ok: true, seances: r.rows });

  } catch (e) {
    console.error("❌ ERREUR edt :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 💰 5. FRAIS & PAIEMENTS — GET /paiements/:id_eleve
// ==================================================
router.get('/paiements/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const filtre = req.filtreParent;

    const enfant = await verifierAppartenanceEnfant(id_eleve, filtre, pool);
    if (!enfant) {
      return res.json({ ok: false, erreur: "⛔ Accès refusé" });
    }

    const synthese = await pool.query(`
      SELECT
        COALESCE(SUM(montant_total), 0) AS totale,
        COALESCE(SUM(montant_paye), 0) AS paye,
        COALESCE(SUM(montant_total - montant_paye), 0) AS restant
      FROM frais_scolaires
      WHERE id_eleve = $1
    `, [id_eleve]);

    const detail = await pool.query(`
      SELECT libelle, montant_total, montant_paye, (montant_total - montant_paye) AS reste_a_payer
      FROM frais_scolaires
      WHERE id_eleve = $1
      ORDER BY annee_scolaire DESC
    `, [id_eleve]);

    console.log(`✅ paiements/${id_eleve} — Synthèse calculée`);
    res.json({
      ok: true,
      totale: synthese.rows[0].totale,
      paye: synthese.rows[0].paye,
      restant: synthese.rows[0].restant,
      frais: detail.rows
    });

  } catch (e) {
    console.error("❌ ERREUR paiements :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ℹ️ 6. INFOS COMPLÈTES ÉLÈVE — GET /eleve/:id_eleve
// ==================================================
router.get('/eleve/:id_eleve', protegerParent, async (req, res) => {
  try {
    const { id_eleve } = req.params;
    const filtre = req.filtreParent;

    const r = await pool.query(`
      SELECT u.id, u.nom, u.prenom, u.matricule, u.date_naissance, u.adresse,
             u.nom_parent, u.telephone_parent, u.email_parent,
             u.nom_pere, u.nom_mere, u.adresse_famille,
             u.moyenne_annee_precedente, u.mention, u.classement, u.conduite,
             u.id_classe, u.statut_compte,
             c.libelle_classe
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve' AND u.id = $1
        AND (
          (LOWER(u.email_parent) = LOWER($2) AND $2 <> '')
          OR (REPLACE(u.telephone_parent, ' ', '') = REPLACE($3, ' ', '') AND $3 <> '')
        )
      LIMIT 1
    `, [id_eleve, filtre.email_parent || '', filtre.telephone_parent || '']);

    if (!r.rows.length) {
      return res.json({ ok: false, erreur: "⛔ Élève introuvable ou accès refusé" });
    }

    console.log(`✅ eleve/${id_eleve} — Infos complètes renvoyées`);
    res.json({ ok: true, eleve: r.rows[0] });

  } catch (e) {
    console.error("❌ ERREUR eleve :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🏫 AJOUTER UN ÉLÈVE — Admin uniquement
// ==================================================
router.post('/ajouter-eleve', protegerAdmin, async (req, res) => {
  try {
    const {
      nom_famille, prenom, sexe, date_naissance, lieu_naissance,
      nationalite, adresse, telephone, email,
      nom_pere, profession_pere, telephone_pere, email_pere,
      nom_mere, profession_mere, telephone_mere, email_mere, adresse_famille,
      moyenne, rang, mention, conduite,
      id_classe, annee_scolaire,
      date_entree, observations
    } = req.body;

    // ✅ Vérifier la classe
    if (id_classe) {
      const verifClasse = await pool.query(
        'SELECT libelle_classe, capacite_max, places_occupees FROM classes WHERE id_classe = $1',
        [id_classe]
      );
      if (verifClasse.rows.length === 0) {
        return res.json({ ok: false, erreur: "❌ Classe introuvable" });
      }
      const placesOccupees = verifClasse.rows[0].places_occupees || 0;
      const capacite = verifClasse.rows[0].capacite_max || 0;
      if (placesOccupees >= capacite) {
        return res.json({ ok: false, erreur: "❌ Classe complète — Plus de place disponible" });
      }
    }

    // ✅ Générer le matricule via la fonction SQL
    const resultatMatricule = await pool.query(
      "SELECT generer_matricule($1::DATE, $2) AS matricule",
      [date_naissance, annee_scolaire || '2025-2026']
    );
    const matricule = resultatMatricule.rows[0].matricule;

    // ✅ Créer le compte utilisateur
    const motDePasseProvisoire = Math.random().toString(36).substring(2, 10).toUpperCase() + '@1A';
    const hashMdp = await bcrypt.hash(motDePasseProvisoire, 10);

    await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenom, email, telephone, mot_de_passe, role, matricule,
        date_naissance, lieu_naissance, nationalite, adresse,
        nom_pere, profession_pere, telephone_pere, email_pere,
        nom_mere, profession_mere, telephone_mere, email_mere, adresse_famille,
        moyenne_annee_precedente, classement, mention, note_conduite,
        id_classe, annee_scolaire, date_entree, observations,
        est_actif, statut_compte, date_creation
      ) VALUES ($1, $2, $3, $4, $5, 'eleve', $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19,
                $20, $21, $22, $23, $24, $25, $26, true, 'valide', CURRENT_TIMESTAMP)
    `, [
      nom_famille, prenom, email, telephone, hashMdp, matricule,
      date_naissance, lieu_naissance, nationalite, adresse,
      nom_pere, profession_pere, telephone_pere, email_pere,
      nom_mere, profession_mere, telephone_mere, email_mere, adresse_famille,
      moyenne || null, rang || null, mention || null, conduite || null,
      id_classe || null, annee_scolaire || '2025-2026', date_entree || null, observations || null
    ]);

    // ✅ Incrémenter les places occupées
    if (id_classe) {
      await pool.query('UPDATE classes SET places_occupees = places_occupees + 1 WHERE id_classe = $1', [id_classe]);
    }

    // ✅ Envoyer email de bienvenue
    const destEmail = email || email_pere || email_mere;
    if (destEmail) {
      await envoyerEmail(destEmail, '✅ Compte créé — MAMA-ZOUMANA', `
        <h3>Bienvenue ${prenom} ${nom_famille} !</h3>
        <p>Votre compte élève a été créé avec succès.</p>
        <p><strong>Matricule :</strong> ${matricule}</p>
        <p><strong>Identifiants :</strong><br>Email : ${destEmail}<br>Mot de passe provisoire : ${motDePasseProvisoire}</p>
        <p>⚠️ Connectez-vous et modifiez votre mot de passe.</p>
      `);
    }

    console.log(`✅ ÉLÈVE AJOUTÉ — ${matricule} | ${prenom} ${nom_famille}`);
    res.json({
      ok: true,
      message: `✅ Élève ajouté ! Matricule : ${matricule}`,
      matricule,
      mdp_provisoire: motDePasseProvisoire
    });

  } catch (e) {
    console.error("❌ ERREUR AJOUT ÉLÈVE :", e.message);
    res.json({ ok: false, erreur: e.message.includes('unique constraint') ? '❌ Cet email existe déjà !' : e.message });
  }
});

// ==================================================
// 👨‍🏫 AJOUTER UN PROFESSEUR — Admin uniquement
// ==================================================
router.post('/ajouter-prof', protegerAdmin, async (req, res) => {
  try {
    const {
      nom_famille, prenom, sexe, date_naissance, adresse, telephone, email,
      diplome, specialite, id_matieres, id_classes,
      date_embauche, volume_horaire, statut, observations
    } = req.body;

    // ✅ Générer matricule pour prof : format ENS-AAAA-XXXXX
    const annee = new Date().getFullYear();
    const compteur = String(Date.now() % 10000).padStart(5, '0');
    const matricule = `ENS-${annee}-${compteur}`;

    const motDePasseProvisoire = Math.random().toString(36).substring(2, 10).toUpperCase() + '@1A';
    const hashMdp = await bcrypt.hash(motDePasseProvisoire, 10);

    await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenom, email, telephone, mot_de_passe, role, matricule,
        sexe, date_naissance, adresse,
        diplome, specialite, id_matieres, id_classes,
        date_embauche, volume_horaire, statut, observations,
        est_actif, statut_compte, date_creation
      ) VALUES ($1, $2, $3, $4, $5, 'prof', $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, true, 'valide', CURRENT_TIMESTAMP)
    `, [
      nom_famille, prenom, email, telephone, hashMdp, matricule,
      sexe || null, date_naissance || null, adresse || null,
      diplome || null, specialite || null, id_matieres || null, id_classes || null,
      date_embauche || null, volume_horaire || null, statut || 'permanent', observations || null
    ]);

    // ✅ Envoyer identifiants par email
    if (email) {
      await envoyerEmail(email, '✅ Compte créé — MAMA-ZOUMANA', `
        <h3>Bienvenue ${prenom} ${nom_famille} !</h3>
        <p>Votre compte enseignant a été créé.</p>
        <p><strong>Matricule :</strong> ${matricule}</p>
        <p><strong>Identifiants :</strong><br>Email : ${email}<br>Mot de passe provisoire : ${motDePasseProvisoire}</p>
        <p>⚠️ Connectez-vous et modifiez votre mot de passe.</p>
      `);
    }

    console.log(`✅ PROF AJOUTÉ — ${matricule} | ${prenom} ${nom_famille}`);
    res.json({
      ok: true,
      message: `✅ Enseignant ajouté ! Matricule : ${matricule}`,
      matricule,
      mdp_provisoire: motDePasseProvisoire
    });

  } catch (e) {
    console.error("❌ ERREUR AJOUT PROF :", e.message);
    res.json({ ok: false, erreur: e.message.includes('unique constraint') ? '❌ Cet email existe déjà !' : e.message });
  }
});

// ==================================================
// 📋 LISTE DES ÉLÈVES — Admin uniquement
// ==================================================
router.get('/eleves/liste', protegerAdmin, async (req, res) => {
  try {
    const liste = await pool.query(`
      SELECT u.id, u.matricule, u.nom, u.prenom, u.sexe, u.date_naissance,
             u.email, u.telephone, u.id_classe, u.moyenne_annee_precedente,
             u.mention, u.statut_compte, u.est_actif,
             c.libelle_classe
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve' ORDER BY u.nom, u.prenom
    `);
    res.json({ ok: true, eleves: liste.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE ÉLÈVES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋   LISTE DES ENSEIGNANTS — Admin uniquement
// ==================================================
router.get('/profs/liste', protegerAdmin, async (req, res) => {
  try {
    const liste = await pool.query(`
      SELECT id, matricule, nom, prenom, email, telephone,
             specialite, statut, est_actif, date_creation
      FROM utilisateurs
      WHERE role = 'prof' ORDER BY nom, prenom
    `);
    res.json({ ok: true, profs: liste.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE PROFS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;

module.exports = router;