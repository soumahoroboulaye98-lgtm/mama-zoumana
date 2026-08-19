const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');


// ==================================================
// 📋 LISTER LES ACTUALITÉS — Publiques ou complètes (Admin)
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout, categorie, rentree, annee_scolaire } = req.query;

    let conditions = [];
    let valeurs = [];

    // Si tout=1 → renvoie toutes, sinon seulement celles publiées
    if (tout !== '1') {
      conditions.push('est_publie = true');
    }

    // Filtre par catégorie si précisé
    if (categorie) {
      valeurs.push(categorie);
      conditions.push(`categorie = $${valeurs.length}`);
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
      SELECT * FROM actualites
      ${clauseWhere}
      ORDER BY epingle DESC, date_publication DESC
    `, valeurs);

    res.json({ ok: true, actualites: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE ACTUALITÉS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UNE ACTUALITÉ — Admin seul
// ==================================================
router.post('/ajouter', verifadmin, async (req, res) => {
  try {
    const id_utilisateur = req.user?.id_utilisateur;
    const {
      titre_fr, titre_en, titre_ar,
      resume_fr, resume_en, resume_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_principale, categorie,
      est_publie, epingle, date_publication,
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
      INSERT INTO actualites(
        titre_fr, titre_en, titre_ar,
        resume_fr, resume_en, resume_ar,
        contenu_fr, contenu_en, contenu_ar,
        image_principale, categorie, est_publie, epingle,
        date_publication, id_utilisateur, date_creation,
        rentree, annee_scolaire
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16,$17)
      RETURNING *
    `, [
      titre_fr, titre_en || null, titre_ar || null,
      resume_fr || null, resume_en || null, resume_ar || null,
      contenu_fr, contenu_en || null, contenu_ar || null,
      image_principale || null, categorie || 'general',
      est_publie !== false, epingle === true,
      date_publication || new Date(), id_utilisateur,
      rentree === true, annee_scolaire || null
    ]);

    res.json({ ok: true, actualite: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR ENREGISTREMENT ACTUALITÉ :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UNE ACTUALITÉ — Admin seul
// ==================================================
router.put('/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const {
      titre_fr, titre_en, titre_ar,
      resume_fr, resume_en, resume_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_principale, categorie,
      est_publie, epingle, date_publication,
      rentree, annee_scolaire
    } = req.body;

    if (!titre_fr || !contenu_fr) {
      return res.json({ 
        ok: false, 
        erreur: "Le titre et le contenu en français sont obligatoires" 
      });
    }

    const r = await pool.query(`
      UPDATE actualites SET
        titre_fr=$2, titre_en=$3, titre_ar=$4,
        resume_fr=$5, resume_en=$6, resume_ar=$7,
        contenu_fr=$8, contenu_en=$9, contenu_ar=$10,
        image_principale=$11, categorie=$12,
        est_publie=$13, epingle=$14,
        date_publication=$15, date_modification=NOW(),
        rentree=$16, annee_scolaire=$17
      WHERE id=$1 RETURNING *
    `, [
      id, titre_fr, titre_en || null, titre_ar || null,
      resume_fr || null, resume_en || null, resume_ar || null,
      contenu_fr, contenu_en || null, contenu_ar || null,
      image_principale || null, categorie || 'general',
      est_publie !== false, epingle === true, date_publication,
      rentree === true, annee_scolaire || null
    ]);

    res.json(
      r.rows.length 
        ? { ok: true, actualite: r.rows[0] } 
        : { ok: false, erreur: "Actualité introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION ACTUALITÉ :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UNE ACTUALITÉ — Admin seul
// ==================================================
router.delete('/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM actualites WHERE id=$1 RETURNING *', 
      [id]
    );

    res.json(
      r.rows.length 
        ? { ok: true } 
        : { ok: false, erreur: "Actualité introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION ACTUALITÉ :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;