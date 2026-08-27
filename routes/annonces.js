const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée uniforme
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 📋 LISTER LES ANNONCES — Publiques ou complètes (Admin)
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout, type_annonce, rentree, annee_scolaire } = req.query;
    const conditions = [];
    const valeurs = [];

    // Si tout=1 → renvoie toutes, sinon seulement publiées, actives et non expirées
    if (tout !== '1') {
      conditions.push('est_publie = true');
      conditions.push('est_actif = true');
      conditions.push('(date_expiration IS NULL OR date_expiration >= CURRENT_DATE)');
    }

    // Filtre par type d'annonce
    if (type_annonce) {
      valeurs.push(type_annonce);
      conditions.push(`type_annonce = $${valeurs.length}`);
    }

    // Filtre rentrée
    if (rentree === '1' || rentree === 'true') {
      conditions.push('rentree = true');
    }

    // Filtre année scolaire
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
        date_publication DESC NULLS LAST,
        date_creation DESC
    `, valeurs);

    console.log(`✅ Liste annonces consultée — ${r.rows.length} annonce(s)`);
    res.json({ ok: true, annonces: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE ANNONCES :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ✅ Route publique compatible avec le frontend (accueil)
router.get('/', async (req, res) => {
  req.query.tout = '0'; // Force annonces publiques seulement
  return router.handle(req, res);
});

// ==================================================
// ➕ AJOUTER UNE ANNONCE — Admin seul
// ==================================================
router.post('/ajouter', protegerAdmin, async (req, res) => {
  try {
    const id_utilisateur = req.user?.id_utilisateur || req.user?.id; // ✅ Compatible deux formats
    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      type_annonce, priorite, date_publication, date_expiration,
      cible, url_image, est_actif, est_publie,
      rentree, annee_scolaire
    } = req.body;

    // ✅ Validation renforcée
    if (!titre_fr || !titre_fr.trim()) {
      return res.json({ ok: false, erreur: "⚠️ Le titre en français est obligatoire" });
    }
    if (!contenu_fr || !contenu_fr.trim()) {
      return res.json({ ok: false, erreur: "⚠️ Le contenu en français est obligatoire" });
    }

    const r = await pool.query(`
      INSERT INTO annonces(
        titre_fr, titre_en, titre_ar,
        contenu_fr, contenu_en, contenu_ar,
        type_annonce, priorite, date_publication, date_expiration,
        cible, url_image, est_actif, est_publie,
        rentree, annee_scolaire, id_utilisateur, date_creation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      RETURNING *
    `, [
      titre_fr.trim(), titre_en?.trim() || null, titre_ar?.trim() || null,
      contenu_fr.trim(), contenu_en?.trim() || null, contenu_ar?.trim() || null,
      type_annonce || 'general', priorite || 'moyenne',
      date_publication || new Date(), date_expiration || null,
      cible || 'Tous', url_image || null,
      est_actif !== false, est_publie !== false,
      rentree === true, annee_scolaire || null, id_utilisateur
    ]);

    console.log(`✅ Annonce créée — "${titre_fr}"`);
    res.json({ ok: true, annonce: r.rows[0], message: "✅ Annonce ajoutée avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR ENREGISTREMENT ANNONCE :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UNE ANNONCE — Admin seul
// ==================================================
router.put('/:id_annonce', protegerAdmin, async (req, res) => {
  try {
    const id_annonce = parseInt(req.params.id_annonce, 10);
    if (isNaN(id_annonce)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const {
      titre_fr, titre_en, titre_ar,
      contenu_fr, contenu_en, contenu_ar,
      type_annonce, priorite, date_publication, date_expiration,
      cible, url_image, est_actif, est_publie,
      rentree, annee_scolaire
    } = req.body;

    if (!titre_fr || !titre_fr.trim()) {
      return res.json({ ok: false, erreur: "⚠️ Le titre en français est obligatoire" });
    }
    if (!contenu_fr || !contenu_fr.trim()) {
      return res.json({ ok: false, erreur: "⚠️ Le contenu en français est obligatoire" });
    }

    const r = await pool.query(`
      UPDATE annonces SET
        titre_fr = $2, titre_en = $3, titre_ar = $4,
        contenu_fr = $5, contenu_en = $6, contenu_ar = $7,
        type_annonce = $8, priorite = $9, date_publication = $10, date_expiration = $11,
        cible = $12, url_image = $13, est_actif = $14, est_publie = $15,
        rentree = $16, annee_scolaire = $17, date_mise_a_jour = NOW()
      WHERE id_annonce = $1
      RETURNING *
    `, [
      id_annonce,
      titre_fr.trim(), titre_en?.trim() || null, titre_ar?.trim() || null,
      contenu_fr.trim(), contenu_en?.trim() || null, contenu_ar?.trim() || null,
      type_annonce || 'general', priorite || 'moyenne',
      date_publication || new Date(), date_expiration || null,
      cible || 'Tous', url_image || null,
      est_actif !== false, est_publie !== false,
      rentree === true, annee_scolaire || null
    ]);

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Annonce introuvable" });
    }

    console.log(`✅ Annonce mise à jour — ID: ${id_annonce}, "${titre_fr}"`);
    res.json({ ok: true, annonce: r.rows[0], message: "✅ Annonce mise à jour !" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION ANNONCE :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER UNE ANNONCE — Admin seul
// ==================================================
router.delete('/:id_annonce', protegerAdmin, async (req, res) => {
  try {
    const id_annonce = parseInt(req.params.id_annonce, 10);
    if (isNaN(id_annonce)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM annonces WHERE id_annonce = $1 RETURNING titre_fr',
      [id_annonce]
    );

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Annonce introuvable" });
    }

    console.log(`✅ Annonce supprimée — ID: ${id_annonce}, "${r.rows[0].titre_fr}"`);
    res.json({ ok: true, message: "✅ Annonce supprimée avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION ANNONCE :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

module.exports = router;