// api/db.js
const { Pool } = require("pg");

let pool;

function normalizeConnStr(raw) {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw.trim();
  // 先頭/末尾の余計な引用符を除去
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1);
  }
  // "postgresql://" → "postgres://"
  s = s.replace(/^postgresql:/i, "postgres:");
  return s;
}

function getPool() {
  if (!pool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error("Missing env: DATABASE_URL");
    const connectionString = normalizeConnStr(raw);
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // Neon は TLS 必須
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

module.exports = { getPool };