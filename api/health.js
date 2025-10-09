// /api/health.js
import { pool } from "./_db.js";

export default async function handler(req, res) {
  try {
    const { rows } = await pool.query("SELECT 1 as ok");
    return res.status(200).json({ ok: rows?.[0]?.ok === 1 });
  } catch (e) {
    console.error("[/api/health] DB ERROR:", e);
    return res.status(500).json({ error: "DB接続に失敗しました" });
  }
}