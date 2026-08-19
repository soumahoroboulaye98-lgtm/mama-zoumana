const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT
});

async function creerComptes() {
  try {
    const mdp = 'Mama2026!';
    const hash = await bcrypt.hash(mdp, 10);

    await pool.query(`
      INSERT INTO utilisateurs(nom,prenoms,email,telephone,role,mot_de_passe,statut_compte)
      VALUES 
      ('Soumahoro','Boulaye','directeur@mama-zoumana.ci','0700000000','directeur',$1,'valide'),
      ('Koné','Moussa','prof@mama-zoumana.ci','0700000001','prof',$1,'valide'),
      ('Traoré','Aminata','eleve@mama-zoumana.ci','0700000002','eleve',$1,'valide'),
      ('Soumahoro','Bakary','parent@mama-zoumana.ci','0700000003','parent',$1,'valide')
      ON CONFLICT (email) DO UPDATE SET mot_de_passe=$1
    `, [hash]);

    console.log('✅ TOUS LES COMPTES SONT CRÉÉS !');
    console.log('🔑 Mot de passe : Mama2026!');
    process.exit();
  } catch (e) {
    console.error('❌ ERREUR :', e.message);
    process.exit(1);
  }
}

creerComptes();