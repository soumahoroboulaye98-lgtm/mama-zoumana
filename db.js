const { Pool } = require('pg');
require('dotenv').config();

module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  max: 20,
  keepAlive: true
});