const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');


// ==================================================
// 📋 LISTER LES ANNONCES — Publiques ou complètes (Admin)
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout, type_annonce, rentree, annee_scolaire } = req.query;

    let conditions = [];
    let valeurs = [];

    // Si tout=1 → renvoie toutes, sinon seulement publiées, actives et non expirées
    if (tout !== '1') {
      conditions.push('est_publie = true');
      conditions.push('est_actif = true');
      conditions.push('(date_expiration IS NULL OR date_expiration >= CURRENT_DATE)');
    }

    // Filtre par type d'annonce si précisé
    if (type_annonce) {
      valeurs.push(type_annonce);
      conditions.push(`type_annonce = $${valeurs.length}`);
    }

    // ✅ Filtre rentrée
    if (rentree === '1' || rentree === 'true') {
      conditions.push('rentree = true');
    }

    // ✅ Filtre année scolaire
    if (annee_scolaire) {
      valeurs.push(annee_scolaire);
      conditions.push(`annee_scolaire = $${valeurs.length}`);
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT * FROM annonces
      ${clauseWhere}
      ORDER BY 
        CASE priorite 
          WHEN 'haute' THEN 1 
          WHEN 'moyenne' THEN 2 
          WHEN 'basse' THEN 3 
          ELSE 4 
        END ASC,
        date_publication DESC, date_creation DESC
    `, valeurs);

    res.json({ ok: true, annonces: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE ANNONCES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UNE ANNONCE — Admin seul
// ==================================================
router.post('/ajouter', verifadmin, async (req, res) => {
  try {
    const id_utilisateur = req.user?.id_utilisateur;
    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      type_annonce, priorite, date_publication, date_expiration,
      cible, url_image, est_actif, est_publie,
      rentree, annee_scolaire
    } = req.body;

    // ✅ Validation
    if (!titre_fr || !contenu_fr) {
      return res.json({ 
        ok: false, 
        erreur: "Le titre et le contenu en français sont obligatoires" 
      });
    }

    const r = await pool.query(`
      INSERT INTO annonces(
        titre_fr, titre_en, titre_ar,
        contenu_fr, contenu_en, contenu_ar,
        type_annonce, priorite, date_publication, date_expiration,
        cible, url_image, est_actif, est_publie,
        rentree, annee_scolaire, id_utilisateur, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
      RETURNING *
    `, [
      titre_fr, titre_en || null, titre_ar || null,
      contenu_fr, contenu_en || null, contenu_ar || null,
      type_annonce || 'general', priorite || 'moyenne',
      date_publication || new Date(), date_expiration || null,
      cible || 'Tous', url_image || null,
      est_actif !== false, est_publie !== false,
      rentree === true, annee_scolaire || null, id_utilisateur
    ]);

    res.json({ ok: true, annonce: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR ENREGISTREMENT ANNONCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UNE ANNONCE — Admin seul
// ==================================================
router.put('/:id_annonce', verifadmin, async (req, res) => {
  try {
    const id_annonce = parseInt(req.params.id_annonce);
    if (isNaN(id_annonce)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      type_annonce, priorite, date_publication, date_expiration,
      cible, url_image, est_actif, est_publie,
      rentree, annee_scolaire
    } = req.body;

    if (!titre_fr || !contenu_fr) {
      return res.json({ 
        ok: false, 
        erreur: "Le titre et le contenu en français sont obligatoires" 
      });
    }

    const r = await pool.query(`
      UPDATE annonces SET
        titre_fr=$2, titre_en=$3, titre_ar=$4,
        contenu_fr=$5, contenu_en=$6, contenu_ar=$7,
        type_annonce=$8, priorite=$9, date_publication=$10, date_expiration=$11,
        cible=$12, url_image=$13, est_actif=$14, est_publie=$15,
        rentree=$16, annee_scolaire=$17, date_mise_a_jour=NOW()
      WHERE id_annonce=$1 RETURNING *
    `, [
      id_annonce,
      titre_fr, titre_en || null, titre_ar || null,
      contenu_fr, contenu_en || null, contenu_ar || null,
      type_annonce || 'general', priorite || 'moyenne',
      date_publication || new Date(), date_expiration || null,
      cible || 'Tous', url_image || null,
      est_actif !== false, est_publie !== false,
      rentree === true, annee_scolaire || null
    ]);

    res.json(
      r.rows.length 
        ? { ok: true, annonce: r.rows[0] } 
        : { ok: false, erreur: "Annonce introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION ANNONCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UNE ANNONCE — Admin seul
// ==================================================
router.delete('/:id_annonce', verifadmin, async (req, res) => {
  try {
    const id_annonce = parseInt(req.params.id_annonce);
    if (isNaN(id_annonce)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM annonces WHERE id_annonce=$1 RETURNING *', 
      [id_annonce]
    );

    res.json(
      r.rows.length 
        ? { ok: true } 
        : { ok: false, erreur: "Annonce introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION ANNONCE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;