// /api/events/index.js
import { query } from "../_db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const r = await query(
        "SELECT id, date, label, icon, start_time, end_time FROM events ORDER BY date ASC"
      );
      return res.status(200).json(r.rows ?? []);
    }

    if (req.method === "POST") {
      const { date, label, icon, start_time, end_time } = req.body || {};
      if (!date || !label) {
        return res.status(400).json({ error: "date と label は必須です" });
      }
      const r = await query(
        `INSERT INTO events (date, label, icon, start_time, end_time)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, date, label, icon, start_time, end_time`,
        [date, label, icon || null, start_time || null, end_time || null]
      );
      return res.status(201).json(r.rows?.[0] ?? {});
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("events index error:", e);
    return res.status(500).json({ error: "Server Error" });
  }
}