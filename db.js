const { Pool } = require('pg');
require('dotenv').config();

module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,

  // 🔐 Configuration OBLIGATOIRE pour NEON + RENDER
  ssl: {
    rejectUnauthorized: false  // ✅ OBLIGATOIRE — Ne touche pas
  },

  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,  // ✅ Passé à 10s (laisse le temps à Neon de démarrer)
  max: 5                           // ✅ Réduit pour éviter les surcharges
});