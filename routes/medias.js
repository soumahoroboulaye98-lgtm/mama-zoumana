const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée uniforme
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📋 LISTER LES MÉDIAS — Publiques ou complètes (Admin)
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout, categorie } = req.query;

    let conditions = [];
    let valeurs = [];

    if (tout !== '1') {
      conditions.push('est_publie = true');
    }

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

    console.log(`✅ Liste médias renvoyée : ${r.rows.length} élément(s)`);
    res.json({ ok: true, medias: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE MÉDIAS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ➕ AJOUTER UN MÉDIA — Administrateur seul
// ==================================================
router.post('/ajouter', protegerAdmin, async (req, res) => {
  try {
    // ✅ CORRIGÉ : id_utilisateur → id
    const id_utilisateur = req.user?.id;

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

    console.log(`✅ Média ajouté — ID: ${r.rows[0].id_media}`);
    res.json({ ok: true, media: r.rows[0] });
  } catch (e) {
    console.log("❌ ERREUR AJOUT MÉDIA :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UN MÉDIA — Administrateur seul
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
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

    if (r.rows.length) {
      console.log(`✅ Média modifié — ID: ${id}`);
      res.json({ ok: true, media: r.rows[0] });
    } else {
      res.json({ ok: false, erreur: "Média introuvable" });
    }
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION MÉDIA :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ❌ SUPPRIMER UN MÉDIA — Administrateur seul
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM medias WHERE id_media=$1 RETURNING *',
      [id]
    );

    if (r.rows.length) {
      console.log(`🗑️ Média supprimé — ID: ${id}`);
      res.json({ ok: true });
    } else {
      res.json({ ok: false, erreur: "Média introuvable" });
    }
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION MÉDIA :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;