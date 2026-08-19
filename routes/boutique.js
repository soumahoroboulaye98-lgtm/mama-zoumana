const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
const upload = multer({ storage: stockage, limits: { fileSize: 5 * 1024 * 1024 } });

// 🔐 MIDDLEWARE ADMIN
const verifadmin = (req, res, next) => {
  const jwt = require('jsonwebtoken');
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erreur: "Token manquant" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin' && decoded.role !== 'super_admin') {
      return res.status(403).json({ erreur: "Accès réservé à l'administrateur" });
    }
    next();
  } catch {
    return res.status(401).json({ erreur: "Token invalide" });
  }
};

// 📋 LISTE TOUS PRODUITS (Admin — inclut inactifs)
router.get('/produits', verifadmin, async (req, res) => {
  try {
    const { categorie } = req.query;
    let requete = 'SELECT * FROM boutique_produits';
    let parametres = [];

    if (categorie) {
      requete += ' WHERE categorie = $1';
      parametres.push(categorie);
    } else {
      requete += ' ORDER BY categorie, nom_produit';
    }

    const resultats = await pool.query(requete, parametres);
    res.json({ ok: true, produits: resultats.rows });
  } catch (e) {
    console.error("❌ ERREUR LISTE PRODUITS :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// 🌐 LISTE PUBLIQUE (seulement actifs)
router.get('/produits-public', async (req, res) => {
  try {
    const { categorie } = req.query;
    let requete = 'SELECT * FROM boutique_produits WHERE actif = true';
    let parametres = [];
    if (categorie) { requete += ' AND categorie = $1'; parametres.push(categorie); }
    requete += ' ORDER BY categorie, nom_produit';
    const resultats = await pool.query(requete, parametres);
    res.json({ ok: true, produits: resultats.rows });
  } catch (e) {
    console.error("❌ ERREUR PRODUITS PUBLIC :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ➕ AJOUTER PRODUIT (Admin + upload image)
router.post('/produits', verifadmin, upload.single('image'), async (req, res) => {
  try {
    const { categorie, nom_produit, description, prix_unitaire, stock, actif } = req.body;
    const image_url = req.file ? `uploads/${req.file.filename}` : null;

    const resultat = await pool.query(`
      INSERT INTO boutique_produits 
      (categorie, nom_produit, description, prix_unitaire, stock, actif, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [categorie, nom_produit, description, prix_unitaire, stock, actif === 'true', image_url]);

    res.json({ ok: true, produit: resultat.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR AJOUT PRODUIT :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ✏️ MODIFIER PRODUIT COMPLET (Admin)
router.put('/produits/:id', verifadmin, upload.single('image'), async (req, res) => {
  try {
    const { categorie, nom_produit, description, prix_unitaire, stock, actif } = req.body;
    const id = req.params.id;

    // Récup ancien produit pour éventuellement supprimer l'ancienne image
    const ancien = await pool.query('SELECT image_url FROM boutique_produits WHERE id_produit = $1', [id]);
    if (ancien.rows.length === 0) return res.status(404).json({ ok: false, erreur: "Produit introuvable" });

    let image_url = ancien.rows[0].image_url;
    if (req.file) {
      // Supprimer ancienne image si existante
      if (image_url) {
        const ancienChemin = path.join(__dirname, '../public/', image_url);
        if (fs.existsSync(ancienChemin)) fs.unlinkSync(ancienChemin);
      }
      image_url = `uploads/${req.file.filename}`;
    }

    const resultat = await pool.query(`
      UPDATE boutique_produits 
      SET categorie=$1, nom_produit=$2, description=$3, prix_unitaire=$4, stock=$5, actif=$6, image_url=$7
      WHERE id_produit=$8 RETURNING *
    `, [categorie, nom_produit, description, prix_unitaire, stock, actif === 'true', image_url, id]);

    res.json({ ok: true, produit: resultat.rows[0] });
  } catch (e) {
    console.error("❌ ERREUR MODIF PRODUIT :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ❌ SUPPRIMER PRODUIT (Admin)
router.delete('/produits/:id', verifadmin, async (req, res) => {
  try {
    const ancien = await pool.query('SELECT image_url FROM boutique_produits WHERE id_produit = $1', [req.params.id]);
    if (ancien.rows.length === 0) return res.status(404).json({ ok: false, erreur: "Produit introuvable" });

    // Supprimer image associée
    if (ancien.rows[0].image_url) {
      const chemin = path.join(__dirname, '../public/', ancien.rows[0].image_url);
      if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
    }

    await pool.query('DELETE FROM boutique_produits WHERE id_produit = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ ERREUR SUPPR PRODUIT :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// 🛒 LISTE COMMANDES (Admin)
router.get('/commandes', verifadmin, async (req, res) => {
  try {
    const resultats = await pool.query(`SELECT * FROM boutique_commandes ORDER BY date_commande DESC`);
    res.json({ ok: true, commandes: resultats.rows });
  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT COMMANDES :", e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ✏️ MODIFIER STOCK SEUL (existante — conservée)
router.put('/produits/:id/stock', verifadmin, async (req, res) => {
  try {
    const { stock } = req.body;
    const resultat = await pool.query(`
      UPDATE boutique_produits SET stock = $1 WHERE id_produit = $2 RETURNING *
    `, [stock, req.params.id]);
    res.json({ ok: true, produit: resultat.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

module.exports = router;