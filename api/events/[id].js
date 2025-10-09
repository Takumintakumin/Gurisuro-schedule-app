// /api/events/[id].js
import { query } from "../_db.js";

export default async function handler(req, res) {
  // 例: /api/events/123 → id = "123"
  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      // 数値化（安全のため）
      const eventId = Number(id);
      if (!Number.isFinite(eventId)) {
        return res.status(400).json({ error: "invalid id" });
      }

      const sql = "DELETE FROM events WHERE id = $1";
      const r = await query(sql, [eventId]);

      // rowCount が 0 なら対象なし
      if (r.rowCount === 0) {
        return res.status(404).json({ error: "not found" });
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/events/:id error:", e);
      return res.status(500).json({ error: "server error" });
    }
  }

  // 未対応メソッド
  res.setHeader("Allow", ["DELETE"]);
  return res.status(405).json({ error: "Method Not Allowed" });
}