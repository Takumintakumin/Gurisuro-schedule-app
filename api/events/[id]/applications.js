// /api/events/[id]/applications.js
import { query } from "../../_db.js";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "GET") {
    try {
      const r = await query(
        `SELECT id, username, kind, created_at
           FROM applications
          WHERE event_id = $1
          ORDER BY created_at ASC`,
        [id]
      );
      return res.json(r.rows || []);
    } catch (e) {
      console.error("GET /api/events/:id/applications error", e);
      return res.status(500).json({ error: "取得に失敗しました" });
    }
  }

  return res.status(405).end();
}