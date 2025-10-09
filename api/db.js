// api/db.js
import { Pool } from "pg";

let pool;

// Vercel関数はコールドスタートするので、グローバルに再利用
export function getPool() {
  if (!pool) {
    const conn = process.env.DATABASE_URL; // ← Neon の接続文字列を入れておく
    if (!conn) throw new Error("Missing env: DATABASE_URL");
    pool = new Pool({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}