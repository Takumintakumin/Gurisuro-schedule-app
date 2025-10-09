// /api/events/index.js
import { pool } from "../db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { rows } = await pool.query(
        "SELECT id, date, label, icon, start_time, end_time FROM events ORDER BY date ASC"
      );
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const { date, label, icon, start_time, end_time } = body;
      if (!date || !label) return res.status(400).json({ error: "date と label は必須です" });

      await pool.query(
        "INSERT INTO events (date, label, icon, start_time, end_time) VALUES ($1,$2,$3,$4,$5)",
        [date, label, icon ?? null, start_time ?? null, end_time ?? null]
      );
      return res.status(200).json({ message: "イベント登録完了" });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("EVENTS_INDEX_ERROR:", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}