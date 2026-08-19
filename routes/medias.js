const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');

// ==================================================
// 📋 LISTER LES MÉDIAS — Publiques ou complètes (Admin)
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout, categorie } = req.query;

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

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT * FROM medias
      ${clauseWhere}
      ORDER BY ordre_affichage ASC, date_creation DESC
    `, valeurs);

    res.json({ ok: true, medias: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE MÉDIAS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ➕ AJOUTER UN MÉDIA — Admin seul
// ==================================================
router.post('/ajouter', verifadmin, async (req, res) => {
  try {
    const id_utilisateur = req.user?.id_utilisateur;
    const {
      titre_fr, titre_en, titre_ar,
      description_fr, description_en, description_ar,
      type_media, url_fichier, url_miniature, categorie,
      date_publication, ordre_affichage, est_publie
    } = req.body;

    // ✅ Validation
    if (!type_media || !url_fichier) {
      return res.json({ 
        ok: false, 
        erreur: "Le type de média et le fichier sont obligatoires" 
      });
    }

    const r = await pool.query(`
      INSERT INTO medias(
        titre_fr, titre_en, titre_ar,
        description_fr, description_en, description_ar,
        type_media, url_fichier, url_miniature, categorie,
        date_publication, ordre_affichage, est_publie,
        id_utilisateur, date_creation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
      RETURNING *
    `, [
      titre_fr || null, titre_en || null, titre_ar || null,
      description_fr || null, description_en || null, description_ar || null,
      type_media, url_fichier, url_miniature || null, categorie || 'galerie',
      date_publication || null, ordre_affichage || 0, est_publie !== false,
      id_utilisateur
    ]);

    res.json({ ok: true, media: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR AJOUT MÉDIA :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UN MÉDIA — Admin seul
// ==================================================
router.put('/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const {
      titre_fr, titre_en, titre_ar,
      description_fr, description_en, description_ar,
      type_media, url_fichier, url_miniature, categorie,
      date_publication, ordre_affichage, est_publie
    } = req.body;

    if (!type_media || !url_fichier) {
      return res.json({ 
        ok: false, 
        erreur: "Le type de média et le fichier sont obligatoires" 
      });
    }

    const r = await pool.query(`
      UPDATE medias SET
        titre_fr=$2, titre_en=$3, titre_ar=$4,
        description_fr=$5, description_en=$6, description_ar=$7,
        type_media=$8, url_fichier=$9, url_miniature=$10, categorie=$11,
        date_publication=$12, ordre_affichage=$13, est_publie=$14
      WHERE id_media=$1 RETURNING *
    `, [
      id, titre_fr || null, titre_en || null, titre_ar || null,
      description_fr || null, description_en || null, description_ar || null,
      type_media, url_fichier, url_miniature || null, categorie || 'galerie',
      date_publication || null, ordre_affichage || 0, est_publie !== false
    ]);

    res.json(
      r.rows.length 
        ? { ok: true, media: r.rows[0] } 
        : { ok: false, erreur: "Média introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION MÉDIA :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER UN MÉDIA — Admin seul
// ==================================================
router.delete('/:id', verifadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM medias WHERE id_media=$1 RETURNING *', 
      [id]
    );

    res.json(
      r.rows.length 
        ? { ok: true } 
        : { ok: false, erreur: "Média introuvable" }
    );
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION MÉDIA :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;