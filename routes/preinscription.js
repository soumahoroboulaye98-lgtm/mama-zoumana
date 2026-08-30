const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

// ==================================================
// 🔑 CONFIGURATION GLOBALE
// ==================================================
const CLE_JWT = process.env.JWT_SECRET || 'ma_cle_secrete_pour_le_site_2026';
const ANNEE_SCOLAIRE_DEFAUT = '2026-2027';
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

// ✅ Vérification appartenance enfant
async function verifierAppartenanceEnfant(id_eleve, filtre) {
  const telNettoye = (filtre.telephone_parent || '').replace(/\s/g, '');
  const { rows } = await pool.query(`
    SELECT u.id_utilisateur AS id, u.nom, u.prenoms, u.matricule, u.id_classe, u.statut_compte AS statut,
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
      secure: process.env.MAIL_SECURE !== 'false',
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
function determinerProfil(d) {
  if (d.profil) return d.profil;
  if (d.id_classe || d.classe_francais) return 'eleve';
  if (d.specialite || d.niveau_etudes) return 'professeur';
  if (d.matricule_enfant || d.lien_parente) return 'parent';
  if (d.motif_visite || d.date_rdv) return 'visiteur';
  return 'visiteur';
}

async function genererMatricule(dateNaissance, anneeScolaire) {
  const anneeDebut = String(anneeScolaire || ANNEE_SCOLAIRE_DEFAUT).slice(0, 4);
  const anneeFin = String(anneeScolaire || ANNEE_SCOLAIRE_DEFAUT).slice(-4);
  const dateRef = new Date(`${anneeDebut}-10-01`);
  const naissance = new Date(dateNaissance);
  let age = dateRef.getFullYear() - naissance.getFullYear();
  const mois = dateRef.getMonth() - naissance.getMonth();
  if (mois < 0 || (mois === 0 && dateRef.getDate() < naissance.getDate())) age--;
  age = Math.max(5, Math.min(99, age));
  const prefixe = `MZ${anneeFin}${String(age).padStart(2, '0')}`;
  const { rows } = await pool.query(
    `SELECT matricule FROM preinscriptions WHERE matricule LIKE $1 UNION SELECT matricule FROM utilisateurs WHERE matricule LIKE $1`,
    [`${prefixe}%`]
  );
  const numero = rows.length
    ? parseInt(rows.map(r => r.matricule.slice(-3)).sort().pop(), 10) + 1
    : 1;
  return `${prefixe}${String(numero).padStart(3, '0')}`;
}

function validerEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function genererMotDePasse(longueur = 10) {
  return crypto.randomBytes(longueur).toString('base64').slice(0, longueur).replace(/[+/]/g, '@') + 'aA1';
}

function normaliserCase(v) {
  return v === 'on' || v === true || v === 'true' ? true : false;
}

// ==================================================
// 📋 SOUMETTRE UNE PRÉINSCRIPTION — PUBLIC
// ==================================================
router.post('/', upload.none(), async (req, res) => {
  try {
    const {
      profil, nom, prenoms, prenom, sexe, date_naissance, lieu_naissance, nationalite, adresse,
      telephone, email,
      nom_pere, profession_pere, activite_pere, telephone_pere, email_pere, date_naissance_pere,
      nom_mere, profession_mere, activite_mere, telephone_mere, email_mere, date_naissance_mere,
      telephone_parent, email_parent, responsable, adresse_famille,
      moyenne_annee_precedente, rang_annee_precedente, mention_annee_precedente, conduite, matricule_precedent,
      classe_francais, classe_arabe, libelle_classe_fr, libelle_classe_ar, id_classe,
      cantine, transport, circuit_transport, cours_renforcement, informatique, club_langues,
      pris_en_charge_etat, mode_paiement,
      specialite, specialites, matieres_enseignees, experience, annees_experience, niveau_etudes,
      motivations, disponibilites, organisme, objet,
      matricule_enfant, nom_enfant, classe_enfant, matricules_enfants, lien_parente,
      motif_visite, date_rdv, heure_rdv, personne_a_rencontrer,
      annee_scolaire, observations
    } = req.body;

    // ✅ VALIDATION
    const erreurs = [];
    const nomComplet = nom?.trim() || prenoms?.trim() || prenom?.trim();
    if (!nomComplet) erreurs.push("• Nom et Prénoms sont OBLIGATOIRES");
    if (!profil?.trim()) erreurs.push("• Profil est OBLIGATOIRE");

    const telNettoye = telephone?.replace(/\s/g, '') || '';
    const emailNettoye = email?.trim() || '';

    if (!telNettoye && !emailNettoye) {
      erreurs.push("• Au moins un moyen de contact : Téléphone OU Email (OBLIGATOIRE)");
    }
    if (emailNettoye && !validerEmail(emailNettoye)) {
      erreurs.push("• Format email invalide");
    }

    const profilNettoye = profil?.trim();

    // ✅ Règles par profil
    if (profilNettoye === 'eleve') {
      if (!classe_francais && !libelle_classe_fr && !id_classe) {
        erreurs.push("• Classe demandée est OBLIGATOIRE");
      }
      if (!date_naissance) erreurs.push("• Date de naissance est OBLIGATOIRE");
    }
    if (profilNettoye === 'professeur') {
      if (!specialite && !specialites) erreurs.push("• Spécialité est OBLIGATOIRE");
    }
    if (profilNettoye === 'parent') {
      if (!matricule_enfant && !matricules_enfants) erreurs.push("• Matricule de l'enfant est OBLIGATOIRE");
    }
    if (profilNettoye === 'visiteur') {
      if (!motif_visite) erreurs.push("• Motif de la visite est OBLIGATOIRE");
    }

    const anneeScolaire = annee_scolaire?.trim() || ANNEE_SCOLAIRE_DEFAUT;

    if (erreurs.length > 0) {
      return res.json({
        ok: false,
        erreur: `⚠️ Veuillez compléter les champs suivants :\n${erreurs.join('\n')}`
      });
    }

    // ✅ Vérification doublon email/téléphone
    if (emailNettoye) {
      const { rows: existe } = await pool.query(
        `SELECT 1 FROM preinscriptions WHERE LOWER(email) = LOWER($1) AND statut NOT IN ('refusée','annulée') LIMIT 1`,
        [emailNettoye]
      );
      if (existe.length) return res.json({ ok: false, erreur: "⚠️ Cet email est déjà utilisé" });
    }
    if (telNettoye) {
      const { rows: existe } = await pool.query(
        `SELECT 1 FROM preinscriptions WHERE REPLACE(telephone,' ','') = $1 AND statut NOT IN ('refusée','annulée') LIMIT 1`,
        [telNettoye]
      );
      if (existe.length) return res.json({ ok: false, erreur: "⚠️ Ce téléphone est déjà utilisé" });
    }

    // ✅ Résolution classe
    let idClasseReel = null;
    let libelleClasse = classe_francais || libelle_classe_fr || '';
    if (id_classe && !isNaN(Number(id_classe))) {
      const { rows: [c] } = await pool.query(
        `SELECT id_classe, libelle_classe FROM classes WHERE id_classe = $1`, [id_classe]
      );
      if (c) { idClasseReel = c.id_classe; libelleClasse = c.libelle_classe; }
    } else if (libelleClasse) {
      const { rows: [c] } = await pool.query(
        `SELECT id_classe, libelle_classe FROM classes WHERE TRIM(libelle_classe) = TRIM($1)`, [libelleClasse]
      );
      if (c) { idClasseReel = c.id_classe; libelleClasse = c.libelle_classe; }
    }

    // ✅ Détermination mode paiement selon prise en charge État
    const prisEnCharge = String(pris_en_charge_etat).trim() === 'true' || String(pris_en_charge_etat).trim() === '1';
    let modePaiementFinal = mode_paiement?.trim() || null;
    if (profilNettoye === 'eleve' && prisEnCharge) {
      modePaiementFinal = 'subvention_etat';
    }

    // ✅ Génération matricule (si élève)
    let matriculeGenere = null;
    if (profilNettoye === 'eleve' && date_naissance) {
      matriculeGenere = await genererMatricule(date_naissance, anneeScolaire);
    }

    // ✅ Normalisation cases à cocher
    const vCantine = normaliserCase(cantine);
    const vTransport = normaliserCase(transport);
    const vCircuit = normaliserCase(circuit_transport);
    const vRenforcement = normaliserCase(cours_renforcement);
    const vInfo = normaliserCase(informatique);
    const vClub = normaliserCase(club_langues);

    // ✅ INSERTION — COLONNES EXACTES DE LA TABLE
    const { rows: [nouvellePreinscription] } = await pool.query(`
      INSERT INTO preinscriptions (
        profil, nom, prenoms, prenom, sexe, date_naissance, lieu_naissance, nationalite, adresse,
        telephone, email,
        nom_pere, profession_pere, activite_pere, telephone_pere, email_pere, date_naissance_pere,
        nom_mere, profession_mere, activite_mere, telephone_mere, email_mere, date_naissance_mere,
        telephone_parent, email_parent, responsable, adresse_famille,
        moyenne_annee_precedente, rang_annee_precedente, mention_annee_precedente, conduite, matricule_precedent,
        classe_francais, classe_arabe, libelle_classe_fr, libelle_classe_ar, id_classe,
        cantine, transport, circuit_transport, cours_renforcement, informatique, club_langues,
        pris_en_charge_etat, mode_paiement,
        specialite, specialites, matieres_enseignees, experience, annees_experience, niveau_etudes,
        motivations, disponibilites, organisme, objet,
        matricule_enfant, nom_enfant, classe_enfant, matricules_enfants, lien_parente,
        motif_visite, date_rdv, heure_rdv, personne_a_rencontrer,
        annee_scolaire, observations, matricule, statut, date_preinscription, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,NOW(),NOW())
      RETURNING id_preinscription
    `, [
      profilNettoye,
      nom?.trim() || null, prenoms?.trim() || null, prenom?.trim() || null, sexe || null,
      date_naissance || null, lieu_naissance || null, nationalite || null, adresse || null,
      telNettoye || null, emailNettoye || null,
      nom_pere?.trim() || null, profession_pere?.trim() || null, activite_pere?.trim() || null,
      telephone_pere?.replace(/\s/g, '') || null, email_pere?.trim() || null, date_naissance_pere || null,
      nom_mere?.trim() || null, profession_mere?.trim() || null, activite_mere?.trim() || null,
      telephone_mere?.replace(/\s/g, '') || null, email_mere?.trim() || null, date_naissance_mere || null,
      telephone_parent?.replace(/\s/g, '') || null, email_parent?.trim() || null,
      responsable?.trim() || null, adresse_famille?.trim() || null,
      moyenne_annee_precedente || null, rang_annee_precedente?.trim() || null,
      mention_annee_precedente?.trim() || null, conduite?.trim() || null, matricule_precedent?.trim() || null,
      classe_francais?.trim() || null, classe_arabe?.trim() || null,
      libelle_classe_fr?.trim() || null, libelle_classe_ar?.trim() || null, idClasseReel,
      vCantine, vTransport, vCircuit, vRenforcement, vInfo, vClub,
      prisEnCharge, modePaiementFinal,
      specialite?.trim() || null, specialites?.trim() || null, matieres_enseignees?.trim() || null,
      experience?.trim() || null, annees_experience || null, niveau_etudes?.trim() || null,
      motivations?.trim() || null, disponibilites?.trim() || null, organisme?.trim() || null, objet?.trim() || null,
      matricule_enfant?.trim() || null, nom_enfant?.trim() || null, classe_enfant?.trim() || null,
      matricules_enfants?.trim() || null, lien_parente?.trim() || null,
      motif_visite?.trim() || null, date_rdv || null, heure_rdv?.trim() || null, personne_a_rencontrer?.trim() || null,
      anneeScolaire, observations?.trim() || null, matriculeGenere, 'en attente'
    ]);

    // ✅ Email de confirmation
    const destEmail = emailNettoye || email_parent?.trim();
    if (destEmail) {
      await envoyerEmail(destEmail, '✅ Préinscription enregistrée — MAMA-ZOUMANA', `
        <h3>Demande enregistrée</h3>
        <p>Bonjour <strong>${prenoms || ''} ${nom || ''}</strong>,</p>
        <p>Nous accusons réception de votre demande de préinscription.</p>
        ${libelleClasse ? `<p>🏫 Classe : ${libelleClasse}</p>` : ''}
        ${matriculeGenere ? `<p>📋 Matricule provisoire : <strong>${matriculeGenere}</strong></p>` : ''}
        ${prisEnCharge ? '<p>🏛️ Demande de prise en charge par l\'État enregistrée.</p>' : ''}
        <p>⏳ En attente de validation (~24h).</p>
      `);
    }

    console.log(`✅ Préinscription ID: ${nouvellePreinscription.id_preinscription} | Profil: ${profilNettoye}`);
    res.json({
      ok: true,
      message: `✅ Demande enregistrée !${libelleClasse ? ` Classe: ${libelleClasse}` : ''}`,
      id: nouvellePreinscription.id_preinscription,
      matricule: matriculeGenere
    });

  } catch (e) {
    console.error("❌ ERREUR soumission :", e.code, e.message);
    res.json({
      ok: false,
      erreur: e.code === '23505' ? '❌ Doublon détecté (email/téléphone déjà utilisé)' : `❌ Erreur : ${e.message}`
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
      SELECT id_utilisateur, nom, prenoms, matricule, id_classe, email_parent, telephone_parent, statut_compte AS statut
      FROM utilisateurs WHERE TRIM(matricule) = $1 AND role = 'eleve' LIMIT 1
    `, [matricule.trim()]);

    if (!eleve)
      return res.json({ ok: false, erreur: "❌ Élève introuvable" });

    const okEmail = email_parent && eleve.email_parent?.toLowerCase().trim() === email_parent.toLowerCase().trim();
    const okTel = telNettoye && eleve.telephone_parent?.replace(/\s/g, '') === telNettoye;

    if (!okEmail && !okTel)
      return res.json({ ok: false, erreur: "⚠️ Email ou téléphone non concordant" });

    const { rows: enfants } = await pool.query(`
      SELECT id_utilisateur AS id, nom, prenoms, matricule, id_classe, statut_compte AS statut
      FROM utilisateurs WHERE role = 'eleve'
        AND ((LOWER(email_parent)=LOWER($1) AND $1<>'') OR (REPLACE(telephone_parent,' ','')=$2 AND $2<>''))
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
// 🔐 ADMINISTRATION
// ==================================================
if (protegerAdmin.length) {
  router.get('/en-attente', protegerAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT *, CASE 
          WHEN profil='eleve' THEN 'Élève'
          WHEN profil='professeur' THEN 'Enseignant'
          WHEN profil='parent' THEN 'Parent'
          WHEN profil='visiteur' THEN 'Visiteur'
          ELSE profil END AS profil_libelle
        FROM preinscriptions WHERE statut = 'en attente' ORDER BY date_preinscription DESC
      `);
      res.json({ ok: true, lignes: rows });
    } catch (e) {
      res.json({ ok: false, erreur: e.message });
    }
  });

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

  router.post('/valider/:id', protegerAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id_preinscription = parseInt(req.params.id);
      if (isNaN(id_preinscription))
        return res.json({ ok: false, erreur: "⚠️ ID invalide" });

      const { rows: [demande] } = await client.query(
        `SELECT * FROM preinscriptions WHERE id_preinscription = $1`, [id_preinscription]
      );
      if (!demande) return res.json({ ok: false, erreur: "❌ Demande introuvable" });
      if (demande.statut !== 'en attente') return res.json({ ok: false, erreur: "⚠️ Déjà traitée" });

      const profil = determinerProfil(demande);
      let id_classe_final = demande.id_classe;

      // ✅ Recherche classe si libellé fourni
      if (!id_classe_final && (demande.classe_francais || demande.libelle_classe_fr)) {
        const { rows: [c] } = await client.query(
          `SELECT id_classe FROM classes WHERE TRIM(libelle_classe) = TRIM($1)`,
          [demande.classe_francais || demande.libelle_classe_fr]
        );
        if (c) id_classe_final = c.id_classe;
      }

      // ✅ Générer matricule si manquant
      let matricule = demande.matricule;
      if (!matricule && profil === 'eleve' && demande.date_naissance) {
        matricule = await genererMatricule(demande.date_naissance, demande.annee_scolaire);
      } else if (!matricule) {
        const prefixes = { professeur: 'ENS', parent: 'PAR', visiteur: 'VIS' };
        matricule = `${prefixes[profil] || 'VIS'}-${String(id_preinscription).padStart(5, '0')}`;
      }

      // ✅ Créer compte utilisateur
      const mdpProvisoire = genererMotDePasse();
      const hashMdp = await bcrypt.hash(mdpProvisoire, 10);
      const { rows: [nouvelUtilisateur] } = await client.query(`
        INSERT INTO utilisateurs (
          nom, prenoms, email, telephone, date_naissance, lieu_naissance, nationalite, sexe, adresse,
          nom_pere, profession_pere, telephone_pere, email_pere,
          nom_mere, profession_mere, telephone_mere, email_mere,
          telephone_parent, email_parent,
          id_classe, matricule, role, mot_de_passe, statut_compte, date_creation
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
        RETURNING id_utilisateur, matricule
      `, [
        demande.nom, demande.prenoms || demande.nom,
        demande.email || demande.email_parent,
        demande.telephone || demande.telephone_parent?.replace(/\s/g, ''),
        demande.date_naissance, demande.lieu_naissance, demande.nationalite, demande.sexe, demande.adresse,
        demande.nom_pere, demande.profession_pere, demande.telephone_pere?.replace(/\s/g, ''), demande.email_pere,
        demande.nom_mere, demande.profession_mere, demande.telephone_mere?.replace(/\s/g, ''), demande.email_mere,
        demande.telephone_parent?.replace(/\s/g, ''), demande.email_parent,
        id_classe_final, matricule, profil, hashMdp, 'actif'
      ]);

      // ✅ Mise à jour préinscription
      await client.query(`
        UPDATE preinscriptions
        SET statut = 'validée', statut_validation = 'validée', date_traitement = NOW(),
            id_utilisateur_valideur = $1, date_mise_a_jour = NOW(), matricule = $2
        WHERE id_preinscription = $3
      `, [req.user.id, matricule, id_preinscription]);

      await client.query('COMMIT');

      // ✅ Email de confirmation
      const destEmail = demande.email || demande.email_parent;
      if (destEmail) {
        await envoyerEmail(destEmail, '✅ INSCRIPTION VALIDÉE — MAMA-ZOUMANA', `
          <div style="background:#f0f9ff;padding:20px;font-family:Arial">
            <div style="background:white;padding:25px;border-radius:12px;border:3px solid #f59e0b;max-width:500px;margin:0 auto">
              <h2 style="color:#0c4a6e;text-align:center">✅ INSCRIPTION VALIDÉE</h2>
              <p>Bonjour <strong>${demande.prenoms || demande.nom}</strong>,</p>
              <p>Votre demande a été validée !</p>
              <p><strong>Matricule (NE JAMAIS MODIFIER) :</strong><br>
              <code style="background:#e2e8f0;padding:4px 10px;border-radius:4px">${matricule}</code></p>
              <p><strong>Identifiants :</strong><br>
              Email : ${destEmail}<br>
              Mot de passe : <code>${mdpProvisoire}</code></p>
              <p style="color:#ef4444">⚠️ Connectez-vous et modifiez votre mot de passe immédiatement.</p>
            </div>
          </div>
        `);
      }

      res.json({ ok: true, matricule, message: "✅ Demande validée et compte créé" });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("❌ ERREUR validation :", e.message);
      res.json({ ok: false, erreur: "⚠️ Échec : " + e.message });
    } finally {
      client.release();
    }
  });

  router.patch('/:id/refuser', protegerAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query(`
        UPDATE preinscriptions SET statut = 'refusée', statut_validation = 'refusée', date_traitement = NOW(), date_mise_a_jour = NOW()
        WHERE id_preinscription = $1
      `, [id]);
      res.json({ ok: true, message: "✅ Demande refusée" });
    } catch (e) {
      res.json({ ok: false, erreur: e.message });
    }
  });

  router.patch('/:id/statut', protegerAdmin, async (req, res) => {
    try {
      const { statut } = req.body;
      if (!['en attente', 'validée', 'refusée', 'annulée'].includes(statut))
        return res.json({ ok: false, erreur: "⚠️ Statut invalide" });

      const { rowCount } = await pool.query(`
        UPDATE preinscriptions SET statut = $1, statut_validation = $1, date_traitement = NOW(), id_utilisateur_valideur = $2, date_mise_a_jour = NOW()
        WHERE id_preinscription = $3
      `, [statut, req.user.id, req.params.id]);

      res.json(rowCount ? { ok: true, message: `✅ Statut : ${statut}` } : { ok: false, erreur: "❌ Introuvable" });
    } catch (e) {
      res.json({ ok: false, erreur: e.message });
    }
  });
}

// ==================================================
// 👨‍👩‍👧 ESPACE PARENT
// ==================================================
if (protegerParent.length) {
  router.get('/mes-enfants', protegerParent, async (req, res) => {
    try {
      const { email_parent, telephone_parent } = req.filtreParent;
      const telNettoye = (telephone_parent || '').replace(/\s/g, '');
      const { rows } = await pool.query(`
        SELECT u.id_utilisateur AS id, u.nom, u.prenoms, u.matricule, u.id_classe, u.statut_compte AS statut, c.libelle_classe
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

// ==================================================
// 📊 RÉSULTATS PAR MATRICULE (PUBLIC)
// ==================================================
router.get('/eleves/:matricule/resultats', async (req, res) => {
  try {
    const { matricule } = req.params;
    if (!matricule?.trim())
      return res.json({ ok: false, erreur: "⚠️ Matricule requis" });

    const { rows: [eleve] } = await pool.query(`
      SELECT u.id_utilisateur, u.nom, u.prenoms, u.matricule, u.date_naissance,
             u.moyenne_annee_precedente AS moyenne, u.rang_annee_precedente AS rang,
             u.mention_annee_precedente AS mention, u.conduite AS note_conduite,
             c.libelle_classe
      FROM utilisateurs u LEFT JOIN classes c ON u.id_classe = c.id_classe
      WHERE UPPER(TRIM(u.matricule)) = UPPER(TRIM($1)) AND u.role = 'eleve' LIMIT 1
    `, [matricule.trim()]);

    if (!eleve)
      return res.json({ ok: false, erreur: "❌ Élève introuvable" });

    res.json({
      ok: true, ...eleve,
      moyenne: eleve.moyenne || '—',
      rang: eleve.rang || '—',
      mention: eleve.mention || '—'
    });
  } catch (e) {
    res.json({ ok: false, erreur: "❌ Erreur serveur" });
  }
});

module.exports = router;