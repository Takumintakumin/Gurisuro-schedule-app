// /api/health.js
import { Pool } from "pg";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Neon向け
    })
  : null;

export default async function handler(req, res) {
  try {
    let db = 0;
    if (pool) {
      const r = await pool.query("SELECT 1 AS x");
      db = r?.rows?.[0]?.x ? 1 : 0;
    }
    res.status(200).json({ ok: true, db });
  } catch (e) {
    console.error("[/api/health] DB check failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
}