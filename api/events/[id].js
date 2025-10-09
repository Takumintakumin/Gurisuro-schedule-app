// /api/events/[id].js
import { query } from "../_db.js";

export default async function handler(req, res) {
  const {
    query: { id },
    method,
  } = req;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ error: "id が不正です" });
  }

  try {
    if (method === "DELETE") {
      const r = await query(
        "DELETE FROM events WHERE id = $1 RETURNING id",
        [Number(id)]
      );
      if (r.rowCount === 0) {
        return res.status(404).json({ error: "対象が見つかりません" });
      }
      return res.status(200).json({ ok: true, id: r.rows[0].id });
    }

    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("events [id] error:", e);
    return res.status(500).json({ error: "Server Error" });
  }
}