// /api/events/[id].js
import { query } from "../_db.js";

export default async function handler(req, res) {
  const {
    query: { id },
    method,
  } = req;

  if (!id) {
    res.status(400).json({ error: "id が必要です" });
    return;
  }

  try {
    if (method === "DELETE") {
      // 文字列でも数値でもOKにする
      await query("DELETE FROM events WHERE id = $1", [id]);
      res.status(200).json({ ok: true });
    } else if (method === "GET") {
      const r = await query("SELECT * FROM events WHERE id = $1", [id]);
      res.status(200).json(r.rows?.[0] || null);
    } else {
      res.setHeader("Allow", "GET, DELETE");
      res.status(405).json({ error: "Method Not Allowed" });
    }
  } catch (e) {
    console.error("events/[id] error:", e);
    res.status(500).json({ error: "サーバーエラー" });
  }
}