
const { Pool } = require('pg');
require('dotenv').config();

module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // ✅ ESSENTIEL pour Render ← PROBLÈME FRÉQUENT !
  },
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  max: 10
});