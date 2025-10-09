// /api/events/[id].js
import { getPool } from "../_db.js";

export default async function handler(req, res) {
  const pool = getPool();

  // Vercel の動的 API では req.query.id に入る
  const { id } = req.query || {};
  const intId = Number.parseInt(id, 10);

  if (!Number.isInteger(intId)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    if (req.method === "DELETE") {
      const result = await pool.query(
        `DELETE FROM events WHERE id = $1::int`,
        [intId]
      );
      // 存在しない id のとき result.rowCount は 0
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "not found" });
      }
      return res.status(200).json({ ok: true, id: intId });
    }

    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("API /api/events/[id] error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}