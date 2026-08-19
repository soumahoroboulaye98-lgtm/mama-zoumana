const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();
const path = require('path');
const multer = require('multer');


// 📁 CONFIG MULTER
const stockage = multer.diskStorage({
  destination: (req,file,cb)=>cb(null,'./public/uploads/'),
  filename: (req,file,cb)=>cb(null,Date.now()+'-'+file.originalname)
});
const upload = multer({storage:stockage});


// ✅ CRÉE L'APPLICATION
const app = express();
const PORT = process.env.PORT || 5000;
const boutiqueRoutes = require('./routes/boutique');


// 📦 MIDDLEWARES
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ✅ CHEMIN CORRIGÉ : ENLÈVE LE ../
app.use(express.static(path.join(__dirname, 'public')));


// 🔐 ROUTES
app.use('/api/utilisateurs', require('./routes/utilisateurs'));
app.use('/api/preinscription', require('./routes/preinscription'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/emploi', require('./routes/emploi'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/finances', require('./routes/finances'));
app.use('/api/affectations', require('./routes/affectations'));
app.use('/api/matieres', require('./routes/matieres'));
app.use('/api/presences', require('./routes/presences'));
app.use('/api/bulletins', require('./routes/bulletins'));
app.use('/api/devoirs', require('./routes/devoirs'));
app.use('/api/paiements', require('./routes/paiements'));
app.use('/api/comptabilite', require('./routes/comptabilite'));
app.use('/api/boutique', boutiqueRoutes);
app.use('/api/annonces', require('./routes/annonces'));
app.use('/api/evenements', require('./routes/evenements'));
app.use('/api/actualites', require('./routes/actualites'));
app.use('/api/medias', require('./routes/medias'));
app.use('/api/config', require('./routes/config'));


// 🧑‍🎓 FONCTIONS ÉLÈVE / PARENT
app.use('/api/eleve', require('./routes/eleve'));
app.use('/api/parent', require('./routes/parent'));


// 🔄 REDIRECTIONS
app.get('/inscription.html', (req,res) => res.redirect('/preinscription.html'));
app.use('/api/inscription', (req,res) => res.json({ok:false, message:'Utilisez la préinscription'}));
const calendrierRoutes = require('./routes/calendrier');
const reglementRoutes = require('./routes/reglement');
const equipeRoutes = require('./routes/equipe');


app.use('/api/calendrier', calendrierRoutes);
app.use('/api/reglement', reglementRoutes);
app.use('/api/equipe', equipeRoutes);

// 🏠 PAGE ACCUEIL — ✅ CHEMIN CORRIGÉ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// 🧪 TEST CONNEXION BASE
app.get('/api/test', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW()');
    res.json({ok:true, heure: r.rows[0].now});
  } catch (e) {
    res.json({ok:false, erreur: e.message});
  }
});


// 🚀 DÉMARRAGE
app.listen(PORT, () => {
  console.log(`✅ Serveur opérationnel sur port ${PORT}`);
});