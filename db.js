const { Pool } = require('pg');
require('dotenv').config();

module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,

  // 🔐 Configuration pour NEON — IMPORTANT
  ssl: {
    rejectUnauthorized: false,  // ✅ FALSE pour Neon
    minVersion: 'TLSv1.2'
  },

  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  max: 20,
  keepAlive: true
});