const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée uniforme
const protegerAdmin = [veriftoken, verifadmin];

// ✅ Créer dossier uploads s'il n'existe pas
const dossierUpload = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(dossierUpload)) fs.mkdirSync(dossierUpload, { recursive: true });

// ✅ Configuration Multer pour images
const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dossierUpload),
  filename: (req, file, cb) => {
    const nomUnique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, nomUnique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: stockage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const typesAutorises = /jpeg|jpg|png|gif|webp/;
    const extValide = typesAutorises.test(path.extname(file.originalname).toLowerCase());
    const mimeValide = typesAutorises.test(file.mimetype);
    if (extValide && mimeValide) return cb(null, true);
    cb(new Error("⚠️ Seules les images sont autorisées (JPG, PNG, GIF, WEBP)"));
  }
});

// ==================================================
// 📋 LISTE TOUS PRODUITS (Admin — inclut inactifs)
// ==================================================
router.get('/produits', protegerAdmin, async (req, res) => {
  try {
    const { categorie } = req.query;
    let requete = 'SELECT * FROM boutique_produits';
    let parametres = [];
    if (categorie) {
      requete += ' WHERE categorie = $1';
      parametres.push(categorie);
    }
    requete += ' ORDER BY categorie, nom_produit_fr';
    const resultats = await pool.query(requete, parametres);
    console.log(`✅ Liste complète produits consultée — ${resultats.rows.length} produit(s)`);
    res.json({ ok: true, produits: resultats.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE PRODUITS :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 🌐 LISTE PUBLIQUE (seulement actifs)
// ==================================================
router.get('/produits-public', async (req, res) => {
  try {
    const { categorie } = req.query;
    let requete = 'SELECT * FROM boutique_produits WHERE est_actif = true';
    let parametres = [];
    if (categorie) { requete += ' AND categorie = $1'; parametres.push(categorie); }
    requete += ' ORDER BY categorie, nom_produit_fr';
    const resultats = await pool.query(requete, parametres);
    console.log(`✅ Liste publique produits consultée — ${resultats.rows.length} produit(s)`);
    res.json({ ok: true, produits: resultats.rows });
  } catch (e) {
    console.error("❌ ERREUR PRODUITS PUBLIC :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// ➕ AJOUTER PRODUIT (Admin + upload image)
// ==================================================
router.post('/produits', protegerAdmin, upload.single('single'), async (req, res) => {
  try {
    const { 
      categorie, id_categorie,
      nom_produit_fr, nom_produit_en, nom_produit_ar,
      description_fr, description_en, description_ar,
      prix_unitaire, devise, quantite_stock,
      est_disponible, est_actif
    } = req.body;

    // ✅ Validations
    if (!nom_produit_fr || nom_produit_fr.trim() === '') {
      return res.status(400).json({ ok: false, erreur: "⚠️ Indiquez le nom du produit (en français)" });
    }

    const prix = parseFloat(prix_unitaire);
    if (isNaN(prix) || prix < 0) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Prix unitaire invalide" });
    }

    const qte = parseInt(quantite_stock) || 0;
    if (qte < 0) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Stock ne peut pas être négatif" });
    }

    const image_url = req.file ? `uploads/${req.file.filename}` : null;
    const idUtilisateur = req.user?.id || null;
    const deviseValeur = devise || 'XOF';
    const estDispo = est_disponible === 'true' || est_disponible === true;
    const estActif = est_actif === 'true' || est_actif === true;

    const resultat = await pool.query(`
      INSERT INTO boutique_produits
      (categorie, id_categorie, nom_produit_fr, nom_produit_en, nom_produit_ar,
       description_fr, description_en, description_ar,
       prix_unitaire, devise, quantite_stock, image_url,
       est_disponible, est_actif, date_creation, id_utilisateur)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15)
      RETURNING *
    `, [
      categorie?.trim() || null, id_categorie || null,
      nom_produit_fr.trim(), nom_produit_en?.trim() || null, nom_produit_ar?.trim() || null,
      description_fr || null, description_en || null, description_ar || null,
      prix, deviseValeur, qte, image_url,
      estDispo, estActif, idUtilisateur
    ]);

    console.log(`✅ Produit créé — ${nom_produit_fr.trim()}`);
    res.json({ ok: true, produit: resultat.rows[0], message: "✅ Produit ajouté avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR AJOUT PRODUIT :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// ✏️ MODIFIER PRODUIT COMPLET (Admin)
// ==================================================
router.put('/produits/:id', protegerAdmin, upload.single('image'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const { 
      categorie, id_categorie,
      nom_produit_fr, nom_produit_en, nom_produit_ar,
      description_fr, description_en, description_ar,
      prix_unitaire, devise, quantite_stock,
      est_disponible, est_actif
    } = req.body;

    // ✅ Validations
    if (!nom_produit_fr || nom_produit_fr.trim() === '') {
      return res.status(400).json({ ok: false, erreur: "⚠️ Indiquez le nom du produit (en français)" });
    }

    const prix = parseFloat(prix_unitaire);
    if (isNaN(prix) || prix < 0) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Prix unitaire invalide" });
    }

    const qte = parseInt(quantite_stock) || 0;
    if (qte < 0) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Stock ne peut pas être négatif" });
    }

    // ✅ Récup ancien produit
    const ancien = await pool.query(
      'SELECT image_url FROM boutique_produits WHERE id_produit = $1',
      [id]
    );
    if (ancien.rows.length === 0) {
      return res.status(404).json({ ok: false, erreur: "⚠️ Produit introuvable" });
    }

    let image_url = ancien.rows[0].image_url; // ✅ CORRIGÉ : .rows[0]
    if (req.file) {
      if (image_url) {
        const ancienChemin = path.join(__dirname, '../public/', image_url);
        if (fs.existsSync(ancienChemin)) fs.unlinkSync(ancienChemin);
      }
      image_url = `uploads/${req.file.filename}`;
    }

    const deviseValeur = devise || 'XOF';
    const estDispo = est_disponible === 'true' || est_disponible === true;
    const estActif = est_actif === 'true' || est_actif === true;

    const resultat = await pool.query(`
      UPDATE boutique_produits
      SET 
        categorie = $1, id_categorie = $2,
        nom_produit_fr = $3, nom_produit_en = $4, nom_produit_ar = $5,
        description_fr = $6, description_en = $7, description_ar = $8,
        prix_unitaire = $9, devise = $10, quantite_stock = $11, image_url = $12,
        est_disponible = $13, est_actif = $14, date_mise_a_jour = NOW()
      WHERE id_produit = $15
      RETURNING *
    `, [
      categorie?.trim() || null, id_categorie || null,
      nom_produit_fr.trim(), nom_produit_en?.trim() || null, nom_produit_ar?.trim() || null,
      description_fr || null, description_en || null, description_ar || null,
      prix, deviseValeur, qte, image_url,
      estDispo, estActif, id
    ]);

    console.log(`✅ Produit mis à jour — ID: ${id}, ${nom_produit_fr.trim()}`);
    res.json({ ok: true, produit: resultat.rows[0], message: "✅ Produit mis à jour !" });
  } catch (e) {
    console.error("❌ ERREUR MODIF PRODUIT :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER PRODUIT (Admin)
// ==================================================
router.delete('/produits/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const ancien = await pool.query('SELECT nom_produit_fr, image_url FROM boutique_produits WHERE id_produit = $1', [id]);
    if (ancien.rows.length === 0) {
      return res.status(404).json({ ok: false, erreur: "⚠️ Produit introuvable" });
    }

    // ✅ Supprimer l'image associée
    if (ancien.rows[0].image_url) {
      const chemin = path.join(__dirname, '../public/', ancien.rows[0].image_url);
      if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
    }

    await pool.query('DELETE FROM boutique_produits WHERE id_produit = $1', [id]);
    console.log(`✅ Produit supprimé — ID: ${id}, ${ancien.rows[0].nom_produit_fr}`);
    res.json({ ok: true, message: "✅ Produit supprimé avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPR PRODUIT :", e.message);
    if (e.code === '23503') {
      return res.status(400).json({ ok: false, erreur: "⚠️ Impossible : ce produit est référencé dans des commandes" });
    }
    res.status(500).json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// 🛒 LISTE COMMANDES (Admin)
// ==================================================
router.get('/commandes', protegerAdmin, async (req, res) => {
  try {
    const resultats = await pool.query(`SELECT * FROM boutique_commandes ORDER BY date_commande DESC`);
    console.log(`✅ Liste commandes consultée — ${resultats.rows.length} commande(s)`);
    res.json({ ok: true, commandes: resultats.rows });
  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT COMMANDES :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// ==================================================
// ✏️ MODIFIER STOCK SEUL (Admin)
// ==================================================
router.put('/produits/:id/stock', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }
    const { quantite_stock } = req.body;
    const qte = parseInt(quantite_stock);
    if (isNaN(qte) || qte < 0) {
      return res.status(400).json({ ok: false, erreur: "⚠️ Valeur de stock invalide" });
    }
    const resultat = await pool.query(`
      UPDATE boutique_produits SET quantite_stock = $1, date_mise_a_jour = NOW() WHERE id_produit = $2 RETURNING *
    `, [qte, id]);
    if (resultat.rows.length === 0) {
      return res.status(404).json({ ok: false, erreur: "⚠️ Produit introuvable" });
    }
    console.log(`✅ Stock mis à jour — Produit ${id}, nouveau stock: ${qte}`);
    res.json({ ok: true, produit: resultat.rows[0], message: "✅ Stock mis à jour !" });
  } catch (e) {
    console.error("❌ ERREUR MISE À JOUR STOCK :", e.message);
    res.status(500).json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

module.exports = router;