// /api/events/[id].js
import { pool } from "../_db.js";

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: "id が必要です" });

  try {
    if (req.method === "DELETE") {
      await pool.query("DELETE FROM events WHERE id = $1", [id]);
      return res.status(200).json({ message: "イベントを削除しました" });
    }
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("EVENTS_DELETE_ERROR:", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}