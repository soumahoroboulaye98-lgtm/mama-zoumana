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
// 📁 DOSSIER PUBLIC
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
// ⚙️ CHARGEMENT CONFIGURATION
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
// 🔐 MIDDLEWARES D'AUTHENTIFICATION
// ==============================================
let veriftoken, verifadmin, protegerAdmin;
try {
  veriftoken = require('./middleware/veriftoken');
  verifadmin = require('./middleware/verifadmin');
  protegerAdmin = [veriftoken, verifadmin];
  console.log("✅ Middlewares auth chargés");
} catch(e) {
  console.log("⚠️ Erreur chargement middlewares auth :", e.message);
  protegerAdmin = [];
}

// ==============================================
// 📄 ROUTES DOCUMENTS (intégrées directement)
// ==============================================
const routerDocuments = express.Router();
if (protegerAdmin.length > 0) {
  routerDocuments.get('/tous', protegerAdmin, async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT d.*,
          json_build_object('id', e.id, 'nom', e.nom, 'prenom', e.prenom, 'classe', e.id_classe, 'matricule', e.matricule) AS eleve,
          json_build_object('id', p.id, 'nom', p.nom, 'prenom', p.prenom, 'role', p.role) AS personnel
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
  routerDocuments.post('/supprimer', protegerAdmin, async (req, res) => {
    try {
      const { numero_unique } = req.body;
      const { rowCount } = await pool.query(
        'DELETE FROM documents_delivres WHERE numero_unique = $1 RETURNING id',
        [numero_unique]
      );
      if (rowCount === 0) return res.json({ ok: false, erreur: "⚠️ Document introuvable" });
      res.json({ ok: true, message: "✅ Document supprimé" });
    } catch (e) {
      console.error("❌ Erreur suppression document :", e.code, e.message);
      res.json({ ok: false, erreur: e.message });
    }
  });
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
}

// ==============================================
// 📊 ROUTES COMPLÉMENTAIRES
// ==============================================
const routerEleves = express.Router();
if (protegerAdmin.length > 0) {
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
}

const routerPersonnel = express.Router();
if (protegerAdmin.length > 0) {
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
}

const routerPaiements = express.Router();
if (protegerAdmin.length > 0) {
  routerPaiements.get('/tous', protegerAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM paiements ORDER BY date_paiement DESC");
      res.json({ ok: true, paiements: rows });
    } catch (e) {
      console.error("❌ Erreur liste paiements :", e.code, e.message);
      res.json({ ok: false, erreur: e.message });
    }
  });
}

// ==============================================
// 🔗 CHARGEMENT SÉCURISÉ DES ROUTES
// ==============================================
function chargerRoute(chemin) {
  try {
    const route = require(chemin);
    console.log("✅", chemin, "chargée");
    return route;
  } catch (e) {
    console.log("❌ ERREUR", chemin, ":", e.message);
    return null;
  }
}

// Charger une par une
const rAuth = chargerRoute('./routes/auth');
const rAdmin = chargerRoute('./routes/admin');
const rUtilisateurs = chargerRoute('./routes/utilisateurs');
const rPreinscription = chargerRoute('./routes/preinscription');
const rReferences = chargerRoute('./routes/references');
const rClasses = chargerRoute('./routes/classes');
const rMatieres = chargerRoute('./routes/matieres');
const rAffectations = chargerRoute('./routes/affectations');
const rEmploi = chargerRoute('./routes/emploi');
const rNotes = chargerRoute('./routes/notes');
const rPresences = chargerRoute('./routes/presences');
const rDevoirs = chargerRoute('./routes/devoirs');
const rBulletins = chargerRoute('./routes/bulletins');
const rClasseEmploi = chargerRoute('./routes/classe_emploi');
const rFinances = chargerRoute('./routes/finances');
const rComptabilite = chargerRoute('./routes/comptabilite');
const rAnnonces = chargerRoute('./routes/annonces');
const rEvenements = chargerRoute('./routes/evenements');
const rActualites = chargerRoute('./routes/actualites');
const rMedias = chargerRoute('./routes/medias');
const rConfig = chargerRoute('./routes/config');
const rBoutique = chargerRoute('./routes/boutique');
const rParent = chargerRoute('./routes/parent');
const rCalendrier = chargerRoute('./routes/calendrier');
const rReglement = chargerRoute('./routes/reglement');
const rEquipe = chargerRoute('./routes/equipe');

// ==============================================
// 🔗 DÉCLARATION DES ROUTES
// ==============================================
if (rAuth) app.use('/api/auth', rAuth);
if (rAdmin) app.use('/api/admin', rAdmin);
if (rUtilisateurs) app.use('/api/utilisateurs', rUtilisateurs);
if (rPreinscription) app.use('/api/preinscription', rPreinscription);
if (rReferences) app.use('/api/references', rReferences);
if (rClasses) app.use('/api/classes', rClasses);
if (rMatieres) app.use('/api/matieres', rMatieres);
if (rAffectations) app.use('/api/affectations', rAffectations);
if (rEmploi) app.use('/api/emploi', rEmploi);
if (rNotes) app.use('/api/notes', rNotes);
if (rPresences) app.use('/api/presences', rPresences);
if (rDevoirs) app.use('/api/devoirs', rDevoirs);
if (rBulletins) app.use('/api/bulletins', rBulletins);
if (rClasseEmploi) app.use('/api/classe-emploi', rClasseEmploi);
if (rFinances) app.use('/api/finances', rFinances);
app.use('/api/paiements', routerPaiements);
if (rComptabilite) app.use('/api/comptabilite', rComptabilite);
if (rAnnonces) app.use('/api/annonces', rAnnonces);
if (rEvenements) app.use('/api/evenements', rEvenements);
if (rActualites) app.use('/api/actualites', rActualites);
if (rMedias) app.use('/api/medias', rMedias);
if (rConfig) app.use('/api/config', rConfig);
if (rBoutique) app.use('/api/boutique', rBoutique);
app.use('/api/eleve', routerEleves);
if (rParent) app.use('/api/parent', rParent);
app.use('/api/documents', routerDocuments);
if (rCalendrier) app.use('/api/calendrier', rCalendrier);
if (rReglement) app.use('/api/reglement', rReglement);
if (rEquipe) app.use('/api/equipe', rEquipe);
app.use('/api/personnel', routerPersonnel);

// ==============================================
// 🔄 ROUTE DE TEST API — LISTE COMPLÈTE
// ==============================================
app.get('/api', (req, res) => {
  const liste = [];
  if (rAuth) liste.push("/api/auth");
  if (rAdmin) liste.push("/api/admin");
  if (rUtilisateurs) liste.push("/api/utilisateurs");
  if (rPreinscription) liste.push("/api/preinscription");
  if (rReferences) liste.push("/api/references");
  if (rClasses) liste.push("/api/classes");
  if (rMatieres) liste.push("/api/matieres");
  if (rAffectations) liste.push("/api/affectations");
  if (rEmploi) liste.push("/api/emploi");
  if (rNotes) liste.push("/api/notes");
  if (rPresences) liste.push("/api/presences");
  if (rDevoirs) liste.push("/api/devoirs");
  if (rBulletins) liste.push("/api/bulletins");
  if (rClasseEmploi) liste.push("/api/classe-emploi");
  if (rFinances) liste.push("/api/finances");
  liste.push("/api/paiements");
  if (rComptabilite) liste.push("/api/comptabilite");
  if (rAnnonces) liste.push("/api/annonces");
  if (rEvenements) liste.push("/api/evenements");
  if (rActualites) liste.push("/api/actualites");
  if (rMedias) liste.push("/api/medias");
  if (rConfig) liste.push("/api/config");
  if (rBoutique) liste.push("/api/boutique");
  liste.push("/api/eleve");
  if (rParent) liste.push("/api/parent");
  liste.push("/api/documents");
  if (rCalendrier) liste.push("/api/calendrier");
  if (rReglement) liste.push("/api/reglement");
  if (rEquipe) liste.push("/api/equipe");
  liste.push("/api/personnel");
  liste.push("/api/test");

  res.json({
    ok: true,
    message: "✅ API MAMA-ZOUMANA opérationnelle",
    origine: req.headers.origin || "inconnue",
    routes_disponibles: liste
  });
});

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
      <!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;text-align:center;">
        <h1>⚠️ Serveur opérationnel</h1>
        <p>Page index.html introuvable dans le dossier <code>public/</code></p>
        <p>✅ API prête sur le préfixe /api/</p>
      </body></html>
    `);
  }
});

// ==============================================
// 🧪 TEST DE CONNEXION BASE
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
// 🚀 DÉMARRAGE SÉCURE
// ==============================================
chargerConfig()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`🌍 API racine     : https://mama-zoumana.onrender.com/api`);
      console.log(`🧪 Test base       : https://mama-zoumana.onrender.com/api/test\n`);
    });
  })
  .catch(err => {
    console.error("❌ Erreur critique au démarrage :", err.message);
    process.exit(1);
  });