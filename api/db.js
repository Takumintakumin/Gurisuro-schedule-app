// api/db.js
const { Pool } = require("pg");

let pool;
function getPool() {
  if (!pool) {
    const conn = process.env.DATABASE_URL;
    if (!conn) throw new Error("Missing DATABASE_URL env var");
    pool = new Pool({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
      max: 3, // 無料枠でも安全に
    });
  }
  return pool;
}

module.exports = { getPool };