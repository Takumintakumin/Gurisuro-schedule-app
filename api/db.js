// api/db.js
const { Pool } = require("pg");

// VercelのServerlessでプロセス使い回しされてもOKなようにグローバル再利用
let pool;

function normalizeConnStr(raw) {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw.trim();

  // 先頭と末尾に誤って付いた引用符を除去
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1);
  }
  // pg が確実に読めるように "postgresql://" → "postgres://"
  s = s.replace(/^postgresql:/i, "postgres:");
  return s;
}

function getPool() {
  if (!pool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error("Missing DATABASE_URL env var");
    const connectionString = normalizeConnStr(raw);

    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // NeonはTLS必須
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

module.exports = { getPool };