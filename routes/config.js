const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');

// ==================================================
// 🎨 CONFIGURATION DU SITE
// ==================================================

// ✅ LIRE LA CONFIGURATION (TOUS PEUVENT LIRE)
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM configuration_site WHERE id_config = 1`);
    if (r.rows.length > 0) {
      res.json({ ok: true, config: r.rows[0] });
    } else {
      res.json({ ok: false, erreur: "Configuration introuvable" });
    }
  } catch (e) {
    console.log("❌ ERREUR CONFIG :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ✏️ MODIFIER LA CONFIGURATION (ADMIN SEUL)
router.post('/modifier', verifadmin, async (req, res) => {
  try {
    const id_admin = req.user.id_utilisateur;
    const {
      nom_site,
      couleur_primaire, couleur_secondaire, couleur_fond, couleur_texte,
      image_fond, video_fond, type_fond,
      police_titres, police_texte,
      texte_entete, texte_pied,
      lien_facebook, lien_whatsapp, lien_email,
      animation_active, vitesse_animation
    } = req.body;

    const r = await pool.query(`
      UPDATE configuration_site SET
        nom_site = $1,
        couleur_primaire = $2,
        couleur_secondaire = $3,
        couleur_fond = $4,
        couleur_texte = $5,
        image_fond = $6,
        video_fond = $7,
        type_fond = $8,
        police_titres = $9,
        police_texte = $10,
        texte_entete = $11,
        texte_pied = $12,
        lien_facebook = $13,
        lien_whatsapp = $14,
        lien_email = $15,
        animation_active = $16,
        vitesse_animation = $17,
        date_modif = NOW(),
        modifie_par = $18
      WHERE id_config = 1
      RETURNING *
    `, [
      nom_site,
      couleur_primaire, couleur_secondaire, couleur_fond, couleur_texte,
      image_fond, video_fond, type_fond,
      police_titres, police_texte,
      texte_entete, texte_pied,
      lien_facebook, lien_whatsapp, lien_email,
      animation_active, vitesse_animation,
      id_admin
    ]);

    res.json({ ok: true, config: r.rows[0], message: "✅ Configuration mise à jour !" });
  } catch (e) {
    console.log("❌ ERREUR MODIF CONFIG :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🖼️ GALERIE / ÉVÉNEMENTS
// ==================================================

// ✅ LIRE LA GALERIE
router.get('/galerie', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM galerie 
      WHERE affiche = true 
      ORDER BY ordre ASC, date_creation DESC
    `);
    res.json({ ok: true, medias: r.rows });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// ➕ AJOUTER UN MÉDIA (ADMIN)
router.post('/galerie/ajouter', verifadmin, async (req, res) => {
  try {
    const { titre, description, type_media, url_fichier, ordre } = req.body;
    const r = await pool.query(`
      INSERT INTO galerie(titre, description, type_media, url_fichier, ordre)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [titre, description, type_media, url_fichier, ordre || 1]);
    res.json({ ok: true, media: r.rows[0] });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// 🗑️ SUPPRIMER UN MÉDIA
router.delete('/galerie/:id', verifadmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM galerie WHERE id_media = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📢 ANNONCES AVEC COMPTEUR
// ==================================================

// ✅ LIRE LES ANNONCES ACTIVES (incrémente le compteur)
router.get('/annonces', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM annonces 
      WHERE publie = true 
        AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
      ORDER BY ordre ASC, date_creation DESC
    `);

    // ⬆️ INCROMENTE LE COMPTEUR POUR CHAQUE ANNONCE AFFICHÉE
    for (const a of r.rows) {
      await pool.query(`
        UPDATE annonces 
        SET compteur_affichage = compteur_affichage + 1 
        WHERE id_annonce = $1
      `, [a.id_annonce]);
      a.compteur_affichage += 1;
    }

    res.json({ ok: true, annonces: r.rows });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// ➕ AJOUTER UNE ANNONCE (ADMIN)
router.post('/annonces/ajouter', verifadmin, async (req, res) => {
  try {
    const { titre, contenu, type_annonce, date_debut, date_fin, ordre } = req.body;
    const r = await pool.query(`
      INSERT INTO annonces(titre, contenu, type_annonce, date_debut, date_fin, ordre)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [titre, contenu, type_annonce, date_debut || new Date(), date_fin, ordre || 1]);
    res.json({ ok: true, annonce: r.rows[0] });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// ✏️ MODIFIER UNE ANNONCE
router.put('/annonces/:id', verifadmin, async (req, res) => {
  try {
    const { titre, contenu, type_annonce, date_debut, date_fin, publie, ordre } = req.body;
    const r = await pool.query(`
      UPDATE annonces SET
        titre = $1, contenu = $2, type_annonce = $3,
        date_debut = $4, date_fin = $5, publie = $6, ordre = $7
      WHERE id_annonce = $8 RETURNING *
    `, [titre, contenu, type_annonce, date_debut, date_fin, publie, ordre, req.params.id]);
    res.json({ ok: true, annonce: r.rows[0] });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// 🗑️ SUPPRIMER UNE ANNONCE
router.delete('/annonces/:id', verifadmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM annonces WHERE id_annonce = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;