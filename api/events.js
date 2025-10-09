// /api/events.js
import { query } from "./_db.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method === "GET") {
      const result = await query(
        "SELECT id, date, label, icon, start_time, end_time FROM events ORDER BY date ASC"
      );
      return res.status(200).json(result.rows);
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body || "{}"); } catch { body = {}; }
      }
      const { date, label, icon, start_time, end_time } = body || {};
      if (!date || !label) {
        return res.status(400).json({ error: "date と label は必須です。" });
      }

      // 一意制約に合わせて UPSERT（重複時は何もしない）
      await query(
        `INSERT INTO events (date, label, icon, start_time, end_time)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (date, label, start_time, end_time) DO NOTHING`,
        [date, label, icon || "", start_time || null, end_time || null]
      );

      return res.status(201).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = req.query?.id || new URL(req.url, `http://${req.headers.host}`).searchParams.get("id");
      if (!id) return res.status(400).json({ error: "id が必要です" });

      await query("DELETE FROM events WHERE id = $1", [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("[/api/events] Error:", err);
    return res.status(500).json({ error: "Server Error: " + err.message });
  }
}