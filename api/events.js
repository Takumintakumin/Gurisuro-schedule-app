import { sql, ensureSchema } from "./_db.js";

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === "GET") {
      const rows = await sql/* sql */`
        select id, date, label, icon, start_time, end_time
        from events
        order by date asc, start_time asc
      `;
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "object" && req.body
        ? req.body
        : JSON.parse(req.body || "{}");

      const { date, label, icon, start_time, end_time } = body;
      if (!date || !label) return res.status(400).json({ error: "date と label は必須です" });

      await sql/* sql */`
        insert into events (date, label, icon, start_time, end_time)
        values (${date}, ${label}, ${icon || null}, ${start_time || null}, ${end_time || null})
      `;
      return res.status(200).json({ message: "イベント登録完了" });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("events error:", e);
    res.status(500).json({ error: "サーバーエラー" });
  }
}