// /api/health.js
import { pool } from "./_db.js";

export default async function handler(req, res) {
  try {
    const { rows } = await pool.query("SELECT NOW() AS now");
    res.status(200).json({ ok: true, now: rows[0].now });
  } catch (e) {
    console.error("HEALTH_ERROR:", e);
    res.status(500).json({ ok: false, error: "DB connection failed" });
  }
}