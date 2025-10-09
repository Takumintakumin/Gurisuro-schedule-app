// api/events.js
import { pool } from "./db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { rows } = await pool.query("SELECT * FROM events ORDER BY date ASC, start_time ASC NULLS FIRST");
      return res.json(rows);
    }

    if (req.method === "POST") {
      const { date, label, icon, start_time, end_time } = req.body || {};
      if (!date || !label) return res.status(400).json({ error: "date と label は必須です" });

      await pool.query(
        `INSERT INTO events (date, label, icon, start_time, end_time)
         VALUES ($1,$2,$3,$4,$5)`,
        [date, label, icon || null, start_time || null, end_time || null]
      );
      return res.json({ message: "イベント登録完了" });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("events error:", e);
    res.status(500).json({ error: "サーバーエラー" });
  }
}