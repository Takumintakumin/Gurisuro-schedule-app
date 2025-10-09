// /api/users/[id].js
import { query } from "../_db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "DELETE") return res.status(405).json({ error: "Method Not Allowed" });

    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: "id が必要です" });

    await query("DELETE FROM users WHERE id = $1", [id]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[/api/users/[id]] error:", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}