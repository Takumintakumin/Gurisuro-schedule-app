// /api/fairness.js
import { query } from "../api-lib/_db.js";

export default async function handler(req, res) {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

    // パラメータ
    const url = new URL(req.url, `http://${req.headers.host}`);
    const eventId = url.searchParams.get("event_id");
    if (!eventId) return res.status(400).json({ error: "event_id が必要です" });

    // 応募者（該当イベント）の行に、過去参加回数・最終参加日時を結合
    // v_participation を使わず、applications 自身を集計して LEFT JOIN
    const sql = `
      WITH part AS (
        SELECT
          username,
          kind,
          COUNT(*) AS times,
          MAX(created_at) AS last_at
        FROM applications
        GROUP BY username, kind
      ),
      appl AS (
        SELECT a.id, a.event_id, a.username, a.kind, a.created_at,
               COALESCE(p.times, 0) AS times,
               p.last_at
        FROM applications a
        LEFT JOIN part p
          ON p.username = a.username
         AND p.kind     = a.kind
        WHERE a.event_id = $1
      ),
      ranked AS (
        SELECT *,
               ROW_NUMBER() OVER (
                 PARTITION BY kind
                 ORDER BY
                   times ASC,                         -- 参加回数が少ない人を優先
                   COALESCE(last_at, 'epoch') ASC,    -- 直近が古い人を優先
                   created_at ASC                     -- 応募が早い人を優先
               ) AS rnk
        FROM appl
      )
      SELECT *
      FROM ranked
      ORDER BY kind, rnk;
    `;
    const r = await query(sql, [eventId]);

    // driver / attendant に分割
    const driver = [];
    const attendant = [];
    for (const row of r.rows) {
      const item = {
        username: row.username,
        kind: row.kind,         // 'driver' | 'attendant'
        times: Number(row.times) || 0,
        last_at: row.last_at,
        applied_at: row.created_at,
        rank: Number(row.rnk),
      };
      if (row.kind === "driver") driver.push(item);
      else attendant.push(item);
    }

    return res.status(200).json({ event_id: Number(eventId), driver, attendant });
  } catch (err) {
    console.error("[/api/fairness] Error:", err);
    return res.status(500).json({ error: "Server Error: " + err.message });
  }
}