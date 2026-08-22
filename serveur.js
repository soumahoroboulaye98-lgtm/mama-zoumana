const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const multer = require('multer');


// ==============================================
// 📁 CONFIGURATION — Téléversement de fichiers
// ==============================================

const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: stockage });


// ==============================================
// ✅ CRÉATION DE L'APPLICATION
// ==============================================

const app = express();
const PORT = process.env.PORT || 10000;


// ==============================================
// 📦 MIDDLEWARES GLOBAUX
// ==============================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ==============================================
// 📁 DOSSIER PUBLIC — Fichiers statiques
// ==============================================

const dossierPublic = path.join(__dirname, 'public');
console.log("📁 Dossier public :", dossierPublic);
console.log("📂 Existe ?", fs.existsSync(dossierPublic) ? "✅ OUI" : "⚠️ NON");

app.use(express.static(dossierPublic));


// ==============================================
// ⚙️ CONFIGURATION DU SITE
// ==============================================

let configSite = {};

async function chargerConfig() {
  try {
    const r = await pool.query('SELECT cle, valeur FROM configuration_site');
    configSite = {};
    r.rows.forEach(row => { configSite[row.cle] = row.valeur; });
    console.log("✅ Configuration chargée depuis la base !");
  } catch (e) {
    console.log("ℹ️ Table configuration_site absente ou vide — normal la première fois");
    configSite = {};
  }
}

// Rendre la config accessible dans toutes les réponses
app.use((req, res, next) => {
  res.locals.configSite = configSite;
  next();
});


// ==============================================
// 🔐 DÉCLARATION DES ROUTES
// ==============================================

// — Administration & Utilisateurs
app.use('/api/admin', require('./routes/admin'));
app.use('/api/utilisateurs', require('./routes/utilisateurs'));
app.use('/api/preinscription', require('./routes/preinscription'));
app.use('/api/auth', require('./routes/auth'));

// — Scolaire
app.use('/api/classes', require('./routes/classes'));
app.use('/api/matieres', require('./routes/matieres'));
app.use('/api/emploi', require('./routes/emploi'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/devoirs', require('./routes/devoirs'));
app.use('/api/presences', require('./routes/presences'));
app.use('/api/bulletins', require('./routes/bulletins'));
app.use('/api/affectations', require('./routes/affectations'));
app.use('/api/classe-emploi', require('./routes/classe_emploi'));

// — Finances & Comptabilité
app.use('/api/finances', require('./routes/finances'));
app.use('/api/paiements', require('./routes/paiements'));
app.use('/api/comptabilite', require('./routes/comptabilite'));

// — Communication & Contenu
app.use('/api/annonces', require('./routes/annonces'));
app.use('/api/evenements', require('./routes/evenements'));
app.use('/api/actualites', require('./routes/actualites'));
app.use('/api/medias', require('./routes/medias'));
app.use('/api/config', require('./routes/config'));
app.use('/api/boutique', require('./routes/boutique'));

// — Espace Élève / Parent
app.use('/api/eleve', require('./routes/eleve'));
app.use('/api/parent', require('./routes/parent'));

// — Pages Informations
app.use('/api/calendrier', require('./routes/calendrier'));
app.use('/api/reglement', require('./routes/reglement'));
app.use('/api/equipe', require('./routes/equipe'));


// ==============================================
// 🔄 ROUTE DE TEST API + COMPATIBILITÉ
// ==============================================

// ✅ Ajoutée pour éviter l'erreur 404 sur /api
app.get('/api', (req, res) => {
  res.json({
    ok: true,
    message: "✅ API MAMA-ZOUMANA opérationnelle",
    routes_disponibles: [
      "/api/admin", "/api/auth", "/api/classes", "/api/matieres",
      "/api/emploi", "/api/notes", "/api/annonces", "/api/config",
      "/api/eleve", "/api/parent", "/api/test"
    ]
  });
});

// Redirections
app.get('/inscription.html', (req, res) => res.redirect('/preinscription.html'));
app.use('/api/inscription', (req, res) => res.json({ ok: false, message: "⚠️ Utilisez /api/preinscription à la place" }));


// ==============================================
// 🏠 PAGE D'ACCUEIL
// ==============================================

app.get('/', (req, res) => {
  const indexChemin = path.join(__dirname, 'public', 'index.html');
  console.log("🔍 Recherche page d'accueil :", indexChemin);

  if (fs.existsSync(indexChemin)) {
    res.sendFile(indexChemin);
  } else {
    console.log("❌ index.html introuvable");
    res.send(`
      <!DOCTYPE html>
      <html>
        <body style="font-family:sans-serif;padding:2rem;text-align:center;">
          <h1>⚠️ Serveur opérationnel</h1>
          <p>Page index.html introuvable dans le dossier <code>public/</code></p>
          <p>✅ API prête sur le préfixe /api/</p>
        </body>
      </html>
    `);
  }
});


// ==============================================
// 🧪 TEST DE CONNEXION BASE DE DONNÉES
// ==============================================

app.get('/api/test', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW()');
    res.json({ ok: true, heureServeur: r.rows[0].now, message: "✅ Connexion base OK" });
  } catch (e) {
    res.json({ ok: false, erreur: e.message, message: "❌ Connexion base échouée" });
  }
});


// ==============================================
// 🚀 DÉMARRAGE DU SERVEUR
// ==============================================

chargerConfig()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`🌍 API racine : http://localhost:${PORT}/api`);
      console.log(`🧪 Test base  : http://localhost:${PORT}/api/test`);
      console.log(`🏠 Accueil    : http://localhost:${PORT}/\n`);
    });
  })
  .catch(err => {
    console.error("❌ Erreur critique au démarrage :", err.message);
    process.exit(1);
  });