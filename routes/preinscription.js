const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();


// 🔐 MIDDLEWARE VÉRIFICATION ADMIN
const verifadmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({erreur:"Token manquant"});
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if(decoded.role !== 'admin' && decoded.role !== 'super_admin'){
      return res.status(403).json({erreur:"Accès réservé à l'administrateur"});
    }
    next();
  } catch {
    return res.status(401).json({erreur:"Token invalide ou expiré"});
  }
};


// ==================================================
// 📁 CONFIGURATION MULTER — Upload des fichiers
// ==================================================
const stockage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads/'));
  },
  filename: (req, file, cb) => {
    const nomNettoye = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, Date.now() + '-' + nomNettoye);
  }
});
const upload = multer({ storage: stockage });


// ==================================================
// 📧 FONCTION ENVOI D'EMAIL
// ==================================================
async function envoyerEmail(destinataire, sujet, messageHtml) {
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
// ✅ ENREGISTRER UNE PRÉINSCRIPTION — AVEC RÉSERVATION PLACES
// ==================================================
router.post('/', upload.fields([
  { name: 'photo_identite', maxCount: 1 },
  { name: 'extrait_naissance', maxCount: 1 },
  { name: 'bulletin', maxCount: 1 },
  { name: 'cv', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      type_inscription, profil, nom, prenoms, sexe,
      email, telephone, id_classe, mot_de_passe,
      langue, date_naissance
    } = req.body;

    const id_classe_nombre = (id_classe && id_classe !== '' && !isNaN(Number(id_classe))) 
      ? Number(id_classe) 
      : null;

    // ══════════════════════════════════════════════════
    // ✅ ÉTAPE 1 : VÉRIFICATION DES PLACES DISPONIBLES
    // ══════════════════════════════════════════════════
    let libelleClasse = null;
    let placesRestantes = null;
    let capaciteMax = null;
    let placesOccupeesActuelles = null;

    if (profil === 'eleve' && id_classe_nombre) {
      // ✅ HARMONISÉ : On NE sélectionne PAS places_restantes (non stockée)
      const verifclasse = await pool.query(
        'SELECT id_classe, libelle_classe, capacite_max, places_occupees FROM classes WHERE id_classe = $1',
        [id_classe_nombre]
      );
      if (verifclasse.rows.length === 0) {
        return res.json({ 
          ok: false, 
          erreur: "❌ Cette classe n'existe pas ! Choisis dans la liste." 
        });
      }

      libelleClasse = verifclasse.rows[0].libelle_classe;
      capaciteMax = verifclasse.rows[0].capacite_max;
      placesOccupeesActuelles = verifclasse.rows[0].places_occupees || 0;
      placesRestantes = capaciteMax - placesOccupeesActuelles; // ✅ Calcul dynamique

      // ⛔ BLOQUER SI LA CLASSE EST COMPLÈTE
      if (placesRestantes <= 0) {
        return res.json({ 
          ok: false, 
          erreur: `❌ La classe ${libelleClasse} est complète ! Aucune place disponible.` 
        });
      }
    }

    // ══════════════════════════════════════════════════
    // ✅ TRAITEMENT DES FICHIERS
    // ══════════════════════════════════════════════════
    const photoUrl = x.photo_identite ? `https://mama-zoumana-api.onrender.com/api/${x.photo_identite}` : null;
    const extrait_naissance = req.files?.extrait_naissance ? 'uploads/' + req.files.extrait_naissance[0].filename : null;
    const bulletin = req.files?.bulletin ? 'uploads/' + req.files.bulletin[0].filename : null;
    const cv = req.files?.cv ? 'uploads/' + req.files.cv[0].filename : null;

    const docsListe = [];
    if (extrait_naissance) docsListe.push(extrait_naissance);
    if (bulletin) docsListe.push(bulletin);
    if (cv) docsListe.push(cv);
    const documents = docsListe.join('|');

    const hashMotDePasse = await bcrypt.hash(mot_de_passe, 10);

    // ══════════════════════════════════════════════════
    // ✅ ENREGISTRER LA PRÉINSCRIPTION
    // ══════════════════════════════════════════════════
    const resultat = await pool.query(`
      INSERT INTO preinscriptions(
        type_inscription, profil, nom, prenoms, sexe,
        email, telephone, id_classe, mot_de_passe,
        photo_identite, extrait_naissance, bulletin, cv, documents,
        langue, date_naissance, statut_preinscription, date_preinscription
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'en_attente', CURRENT_TIMESTAMP)
      RETURNING id_preinscription
    `, [
      type_inscription || 'nouveau', profil, nom, prenoms, sexe,
      email, telephone, id_classe_nombre, hashMotDePasse,
      photo_identite, extrait_naissance, bulletin, cv, documents,
      langue || 'fr', date_naissance || null
    ]);

    const idDemande = resultat.rows[0].id_preinscription;

    // ══════════════════════════════════════════════════
    // ✅ RÉSERVER LA PLACE : DÉDUIRE 1 PLACE IMMÉDIATEMENT
    // ══════════════════════════════════════════════════
    if (profil === 'eleve' && id_classe_nombre && placesRestantes !== null) {
      const nouveauOccupees = placesOccupeesActuelles + 1;
      // ✅ HARMONISÉ : On met à jour SEULEMENT places_occupees
      await pool.query(`
        UPDATE classes 
        SET places_occupees = $1
        WHERE id_classe = $2
      `, [nouveauOccupees, id_classe_nombre]);

      placesRestantes = capaciteMax - nouveauOccupees; // ✅ Calcul dynamique
    }

    // ══════════════════════════════════════════════════
    // ✅ EMAIL DE CONFIRMATION AVEC PLACES RESTANTES
    // ══════════════════════════════════════════════════
    const infoClasse = libelleClasse 
      ? `🏫 Classe : ${libelleClasse}<br>📊 Places restantes dans la classe : <strong>${placesRestantes}</strong> place(s)` 
      : '';

    await envoyerEmail(email, 'Préinscription enregistrée — MAMA-ZOUMANA', `
      <h3>✅ Demande enregistrée</h3>
      <p>Bonjour <strong>${prenoms} ${nom}</strong>,</p>
      <p>Nous accusons réception de votre demande de préinscription.</p>
      <p><strong>${infoClasse}</strong></p>
      <p>Nous vous répondrons dans un délai de <strong>24 HEURES</strong> maximum.</p>
      <p>À la validation définitive, vous recevrez votre <strong>matricule</strong>, un <strong>mot de passe provisoire</strong> et votre <strong>Code QR</strong>.</p>
      <hr><p>Établissement MAMA-ZOUMANA</p>
    `);

    // ✅ RÉPONSE AVEC LES INFOS
    const messageClasse = libelleClasse 
      ? `\n🏫 Classe : ${libelleClasse}\n📊 Places restantes : ${placesRestantes} place(s)` 
      : '';

    res.json({ 
      ok: true, 
      message: `✅ Préinscription enregistrée !${messageClasse}\n⏳ En attente de validation par l'administration.`, 
      id: idDemande,
      libelle_classe: libelleClasse,
      places_restantes: placesRestantes
    });

  } catch (e) {
    console.error("❌ ERREUR INSERTION :", e.message);
    res.json({
      ok: false,
      erreur: e.message.includes('unique constraint') 
        ? '❌ Cet email est déjà utilisé !' 
        : e.message
    });
  }
});


// ==================================================
// 📋 ROUTE EN ATTENTE — appelée par ton HTML
// ==================================================
router.get('/en-attente', verifadmin, async (req, res) => {
  try {
    const liste = await pool.query(`
      SELECT 
        id_preinscription, nom, prenoms, email, telephone, 
        profil, id_classe, matricule, date_preinscription, statut_preinscription
      FROM preinscriptions 
      WHERE statut_preinscription = 'en_attente'
      ORDER BY date_preinscription DESC
    `);
    res.json({ ok: true, lignes: liste.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 LISTE — avec libellé de la classe
// ==================================================
router.get('/liste', verifadmin, async (req, res) => {
  try {
    const liste = await pool.query(`
      SELECT 
        id_preinscription, nom, prenoms, email, telephone, 
        profil, id_classe, matricule, date_preinscription, 
        photo_identite, documents, statut_preinscription
      FROM preinscriptions 
      ORDER BY date_preinscription DESC
    `);

    const resultat = await Promise.all(liste.rows.map(async (dem) => {
      let libelleClasse = null;
      if (dem.id_classe) {
        try {
          const c = await pool.query('SELECT libelle_classe FROM classes WHERE id_classe = $1', [dem.id_classe]);
          if (c.rows.length > 0) libelleClasse = c.rows[0].libelle_classe;
        } catch {
          libelleClasse = `Classe #${dem.id_classe}`;
        }
      }
      return { ...dem, classe: libelleClasse };
    }));

    res.json({ ok: true, liste: resultat });
  } catch (e) {
    console.error("❌ ERREUR LISTE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✅ VALIDER UNE DEMANDE — SANS redéduire la place (déjà fait !)
// ==================================================
router.put('/valider/:id', verifadmin, async (req, res) => {
  try {
    const { id } = req.params;

    const demande = await pool.query("SELECT * FROM preinscriptions WHERE id_preinscription = $1", [id]);
    if (demande.rows.length === 0) {
      return res.json({ ok: false, erreur: "❌ Demande introuvable !" });
    }
    const d = demande.rows[0];

    const prefixe = d.profil === 'eleve' ? 'ELV' 
                  : d.profil === 'prof' ? 'ENS' 
                  : d.profil === 'parent' ? 'PAR' : 'VIS';
    const annee = new Date().getFullYear();
    const compteur = String(d.id_preinscription).padStart(5, '0');
    const matricule = `${prefixe}-${annee}-${compteur}`;

    const motDePasseProvisoire = Math.random().toString(36).substring(2, 10).toUpperCase() + '@1A';
    const hashMdp = await bcrypt.hash(motDePasseProvisoire, 10);
    const contenuQR = `MATRICULE:${matricule}|NOM:${d.nom} ${d.prenoms}|PROFIL:${d.profil}|EMAIL:${d.email}`;

    await pool.query(`
      UPDATE preinscriptions
      SET statut_preinscription = 'valide', matricule = $1
      WHERE id_preinscription = $2
    `, [matricule, id]);

    await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenoms, email, telephone, mot_de_passe,
        role, matricule, id_classe, langue_defaut,
        statut_compte, cle_validation, qr_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'valide', $10, $11)
    `, [
      d.nom, d.prenoms, d.email, d.telephone, hashMdp,
      d.profil, matricule, d.id_classe || null, d.langue || 'fr',
      motDePasseProvisoire, contenuQR
    ]);

    // 📧 Email de validation
    const htmlMail = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; background: #f0f9ff; padding: 20px; }
        .boite { background: white; padding: 25px; border-radius: 12px; border: 3px solid #f59e0b; max-width: 500px; }
        h2 { color: #0c4a6e; text-align: center; }
        .info { background: #f8fafc; padding: 12px; margin: 8px 0; border-radius: 8px; border-left: 4px solid #0369a1; }
        .important { background: #fffbeb; border-left: 4px solid #f59e0b; font-weight: bold; }
        .succes { background: #f0fdf4; border-left: 4px solid #10b981; }
        code { background: #e2e8f0; padding: 4px 10px; border-radius: 4px; font-size: 16px; color: #0c4a6e; }
      </style>
    </head>
    <body>
      <div class="boite">
        <h2>✅ INSCRIPTION VALIDÉE</h2>
        <p>Bonjour <strong>${d.nom} ${d.prenoms}</strong>,</p>
        <p>Votre demande de préinscription a été validée avec succès !</p>
        <div class="info">📋 <strong>Matricule :</strong><br><code>${matricule}</code></div>
        <div class="info important">🔑 <strong>Mot de passe provisoire :</strong><br><code>${motDePasseProvisoire}</code></div>
        <div class="info">👤 <strong>Profil :</strong> ${d.profil.toUpperCase()}<br>📧 <strong>Email de connexion :</strong> ${d.email}</div>
        <p style="color:#ef4444; font-weight:bold; margin-top:20px;">
          ⚠️ Connectez-vous puis modifiez votre mot de passe. Votre QR Code est dans votre espace.
        </p>
        <hr><p style="text-align:center; color:#64748b;">Établissement MAMA-ZOUMANA — ${new Date().getFullYear()}</p>
      </div>
    </body>
    </html>
    `;

    await envoyerEmail(d.email, '✅ INSCRIPTION VALIDÉE — MAMA-ZOUMANA', htmlMail);
    res.json({ ok: true, message: "✅ Inscription validée ! Compte créé et email envoyé." });

  } catch (e) {
    console.error("❌ ERREUR VALIDATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ REFUSER UNE DEMANDE — REND LA PLACE DISPONIBLE !
// ==================================================
router.put('/refuser/:id', verifadmin, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Récupérer la classe de la demande refusée
    const demande = await pool.query("SELECT id_classe FROM preinscriptions WHERE id_preinscription = $1", [id]);
    if (demande.rows.length === 0) {
      return res.json({ ok: false, erreur: "❌ Demande introuvable !" });
    }

    const idClasse = demande.rows[0].id_classe;

    // ✅ HARMONISÉ : Ne décrémenter QUE places_occupees
    if (idClasse) {
      await pool.query(`
        UPDATE classes 
        SET places_occupees = GREATEST(0, places_occupees - 1)
        WHERE id_classe = $1
      `, [idClasse]);
    }

    // ✅ Marquer comme refusée
    await pool.query(`UPDATE preinscriptions SET statut_preinscription = 'refusee' WHERE id_preinscription = $1`, [id]);

    res.json({ ok: true, message: "✅ Demande refusée. Place rendue disponible dans la classe." });
  } catch (e) {
    console.error("❌ ERREUR REFUS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🔍 DÉTAILS D'UNE PRÉINSCRIPTION
// ==================================================
router.get('/detail/:id', verifadmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_preinscription, nom, prenoms, email, telephone, profil, id_classe,
             matricule, photo_identite, documents, date_preinscription, statut_preinscription
      FROM preinscriptions WHERE id_preinscription = $1
    `, [req.params.id]);

    if (r.rows.length === 0) return res.json({ ok: false, erreur: "Préinscription introuvable" });

    const d = r.rows[0];
    let nomClasse = null;
    if (d.id_classe) {
      const c = await pool.query('SELECT libelle_classe FROM classes WHERE id_classe = $1', [d.id_classe]);
      if (c.rows.length > 0) nomClasse = c.rows[0].libelle_classe;
    }
    res.json({ ok: true, demande: { ...d, classe: nomClasse } });
  } catch (e) {
    console.error("❌ ERREUR DÉTAIL :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;