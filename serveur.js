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
// 📦 MIDDLEWARES GLOBAUX — CORS & Parsing
// ==============================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false,
  preflightContinue: false
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));



// ==============================================
// 📁 DOSSIER PUBLIC — Fichiers statiques
// ==============================================
const dossierPublic = path.join(__dirname, 'public');
console.log("📁 Dossier public :", dossierPublic);
console.log("📂 Existe ?", fs.existsSync(dossierPublic) ? "✅ OUI" : "⚠️ NON");

app.use(express.static(dossierPublic, {
  setHeaders: (res, chemin) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));



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

app.use((req, res, next) => {
  res.locals.configSite = configSite;
  next();
});



// ==============================================
// 🔐 MIDDLEWARES D'AUTHENTIFICATION — ✅ CORRIGÉ
// ==============================================
const veriftoken = require('./middleware/veriftoken');
const verifadmin = require('./middleware/verifadmin');

const protegerAdmin = [veriftoken, verifadmin];



// ==============================================
// 📄 ROUTES DOCUMENTS (intégrées directement)
// ✅ CORRIGÉ : prenom au lieu de prenoms
// ==============================================
const routerDocuments = express.Router();

// ✅ Lister TOUS les documents délivrés
routerDocuments.get('/tous', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT d.*,
        json_build_object(
          'id_utilisateur', e.id, 'nom', e.nom, 'prenom', e.prenom,
          'classe', e.id_classe, 'matricule', e.matricule
        ) AS eleve,
        json_build_object(
          'id_utilisateur', p.id, 'nom', p.nom, 'prenom', p.prenom, 'role', p.role
        ) AS personnel
      FROM documents_delivres d
      LEFT JOIN utilisateurs e ON d.id_eleve = e.id
      LEFT JOIN utilisateurs p ON d.id_personnel = p.id
      ORDER BY d.date_delivrance DESC
    `);
    res.json({ ok: true, documents: r.rows });
  } catch (e) {
    console.error("❌ Erreur liste documents :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ✅ Enregistrer un document délivré
routerDocuments.post('/delivrer', protegerAdmin, async (req, res) => {
  try {
    const { id_eleve, id_personnel, type_doc, annee_scolaire, numero_unique } = req.body;
    await pool.query(`
      INSERT INTO documents_delivres(id_eleve, id_personnel, type_document, annee_scolaire, numero_unique, id_admin)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id_eleve || null, id_personnel || null, type_doc, annee_scolaire || '2026-2027', numero_unique, req.user?.id]);
    res.json({ ok: true, message: "✅ Document enregistré" });
  } catch (e) {
    console.error("❌ Erreur enregistrement document :", e.code, e.message);
    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Ce numéro de document existe déjà" });
    res.json({ ok: false, erreur: e.message });
  }
});

// ✅ Supprimer un document
routerDocuments.post('/supprimer', protegerAdmin, async (req, res) => {
  try {
    const { numero_unique } = req.body;
    const { rowCount } = await pool.query(
      'DELETE FROM documents_delivres WHERE numero_unique = $1 RETURNING id',
      [numero_unique]
    );
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Document introuvable" });
    res.json({ ok: true, message: "✅ Document supprimé" });
  } catch (e) {
    console.error("❌ Erreur suppression document :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ✅ Statistiques documents
routerDocuments.get('/statistiques', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN id_eleve IS NOT NULL THEN 1 END) AS eleves,
        COUNT(CASE WHEN id_personnel IS NOT NULL THEN 1 END) AS professeurs,
        COUNT(CASE WHEN EXTRACT(MONTH FROM date_delivrance) = EXTRACT(MONTH FROM CURRENT_DATE)
              AND EXTRACT(YEAR FROM date_delivrance) = EXTRACT(YEAR FROM CURRENT_DATE) THEN 1 END) AS ce_mois
      FROM documents_delivres
    `);
    res.json({ ok: true, stats: r.rows[0] });
  } catch (e) {
    console.error("❌ Erreur statistiques documents :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});



// ==============================================
// 📊 ROUTES COMPLÉMENTAIRES
// ==============================================
const routerEleves = express.Router();
routerEleves.get('/liste', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, nom, prenom, email, matricule, id_classe, photo_profil FROM utilisateurs WHERE role='eleve' ORDER BY nom, prenom"
    );
    res.json({ ok: true, eleves: rows });
  } catch (e) {
    console.error("❌ Erreur liste élèves :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

const routerPersonnel = express.Router();
routerPersonnel.get('/liste', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, nom, prenom, email, role, matricule, photo_profil FROM utilisateurs WHERE role!='eleve' ORDER BY nom, prenom"
    );
    res.json({ ok: true, personnel: rows });
  } catch (e) {
    console.error("❌ Erreur liste personnel :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

const routerPaiements = express.Router();
routerPaiements.get('/tous', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM paiements ORDER BY date_paiement DESC");
    res.json({ ok: true, paiements: rows });
  } catch (e) {
    console.error("❌ Erreur liste paiements :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});



// ==============================================
// 🔗 DÉCLARATION DES ROUTES — PRÉFIXES API
// ✅ CORRIGÉ : Tous les require() pointent vers router
// ==============================================
// — Administration & Utilisateurs
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/utilisateurs', require('./routes/utilisateurs'));
app.use('/api/preinscription', require('./routes/preinscription'));

// — Scolaire
app.use('/api/classes', require('./routes/classes'));
app.use('/api/matieres', require('./routes/matieres'));
app.use('/api/affectations', require('./routes/affectations'));
app.use('/api/emploi', require('./routes/emploi'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/presences', require('./routes/presences'));
app.use('/api/devoirs', require('./routes/devoirs'));
app.use('/api/bulletins', require('./routes/bulletins'));
app.use('/api/classe-emploi', require('./routes/classe_emploi'));

// — Finances & Comptabilité
app.use('/api/finances', require('./routes/finances'));
app.use('/api/paiements', routerPaiements);
app.use('/api/comptabilite', require('./routes/comptabilite'));

// — Communication & Contenu
app.use('/api/annonces', require('./routes/annonces'));
app.use('/api/evenements', require('./routes/evenements'));
app.use('/api/actualites', require('./routes/actualites'));
app.use('/api/medias', require('./routes/medias'));
app.use('/api/config', require('./routes/config'));
app.use('/api/boutique', require('./routes/boutique'));

// — Espace Élève / Parent
app.use('/api/eleve', routerEleves);
app.use('/api/parent', require('./routes/parent'));

// — Documents
app.use('/api/documents', routerDocuments);

// — Pages Informations
app.use('/api/calendrier', require('./routes/calendrier'));
app.use('/api/reglement', require('./routes/reglement'));
app.use('/api/equipe', require('./routes/equipe'));
app.use('/api/personnel', routerPersonnel);



// ==============================================
// 🔄 ROUTE DE TEST API
// ==============================================
app.get('/api', (req, res) => {
  res.json({
    ok: true,
    message: "✅ API MAMA-ZOUMANA opérationnelle",
    origine: req.headers.origin || "inconnue",
    routes_disponibles: [
      "/api/admin", "/api/auth", "/api/classes", "/api/matieres", "/api/affectations",
      "/api/emploi", "/api/notes", "/api/presences", "/api/annonces", "/api/config",
      "/api/eleve", "/api/parent", "/api/documents", "/api/test"
    ]
  });
});

// Redirection pour uniformiser
app.get('/inscription.html', (req, res) => res.redirect('/preinscription.html'));
app.use('/api/inscription', (req, res) =>
  res.json({ ok: false, message: "⚠️ Utilisez /api/preinscription à la place" })
);



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
    res.json({
      ok: true,
      heureServeur: r.rows[0].now,
      message: "✅ Connexion base OK",
      origine: req.headers.origin || "inconnue"
    });
  } catch (e) {
    console.error("❌ ERREUR TEST BASE :", e.code, e.message);
    res.json({ ok: false, erreur: e.message, message: "❌ Connexion base échouée" });
  }
});



// ==============================================
// 🚀 DÉMARRAGE DU SERVEUR
// ==============================================
chargerConfig()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`🌍 API racine     : https://mama-zoumana.onrender.com/api`);
      console.log(`📚 Classes        : https://mama-zoumana.onrender.com/api/classes`);
      console.log(`📖 Matières       : https://mama-zoumana.onrender.com/api/matieres`);
      console.log(`🧑‍🏫 Affectations    : https://mama-zoumana.onrender.com/api/affectations`);
      console.log(`📅 Emploi du temps : https://mama-zoumana.onrender.com/api/emploi`);
      console.log(`📝 Notes           : https://mama-zoumana.onrender.com/api/notes`);
      console.log(`✅ Présences       : https://mama-zoumana.onrender.com/api/presences`);
      console.log(`📄 Documents       : https://mama-zoumana.onrender.com/api/documents`);
      console.log(`🧪 Test base       : https://mama-zoumana.onrender.com/api/test\n`);
    });
  })
  .catch(err => {
    console.error("❌ Erreur critique au démarrage :", err.message);
    process.exit(1);
  });