// api/events/[id].js
import { query } from "../_db.js";

export default async function handler(req, res) {
  const { id } = req.query;

  // id バリデーション
  const num = Number(id);
  if (!num || Number.isNaN(num)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    if (req.method === "DELETE") {
      const sql = "DELETE FROM events WHERE id = $1 RETURNING id;";
      const r = await query(sql, [num]);
      if (r.rowCount === 0) {
        return res.status(404).json({ error: "not found" });
      }
      return res.status(200).json({ ok: true, id: num });
    }

    // ついでに単体取得も用意（必要なら）
    if (req.method === "GET") {
      const r = await query("SELECT * FROM events WHERE id = $1;", [num]);
      if (r.rowCount === 0) return res.status(404).json({ error: "not found" });
      return res.status(200).json(r.rows[0]);
    }

    // それ以外は 405
    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("events/[id] error:", e);
    return res.status(500).json({ error: "server error" });
  }
}