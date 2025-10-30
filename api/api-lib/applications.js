// /api-lib/applications.js
import { query } from "./_db.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const eventId = url.searchParams.get("event_id");
      const date = url.searchParams.get("date");

      if (eventId) {
        const r = await query(
          `SELECT a.id, a.username, a.kind, a.created_at
           FROM applications a
           WHERE a.event_id = $1
           ORDER BY a.created_at ASC`,
          [eventId]
        );
        return res.status(200).json(r.rows);
      }

      if (date) {
        const r = await query(
          `SELECT e.id AS event_id, e.label, e.start_time, e.end_time,
                  a.id, a.username, a.kind, a.created_at
             FROM events e
             LEFT JOIN applications a ON a.event_id = e.id
            WHERE e.date = $1
            ORDER BY e.id, a.created_at`,
          [date]
        );
        // イベントごとにまとめる
        const map = {};
        for (const row of r.rows) {
          if (!map[row.event_id]) {
            map[row.event_id] = {
              event_id: row.event_id,
              label: row.label,
              start_time: row.start_time,
              end_time: row.end_time,
              applicants: [],
            };
          }
          if (row.id) {
            map[row.event_id].applicants.push({
              id: row.id,
              username: row.username,
              kind: row.kind,
              created_at: row.created_at,
            });
          }
        }
        return res.status(200).json(Object.values(map));
      }

      // パラメータ無しなら直近の応募（必要なら）
      const r = await query(
        `SELECT a.*, e.date, e.label FROM applications a
          JOIN events e ON e.id = a.event_id
         ORDER BY a.created_at DESC
         LIMIT 200`
      );
      return res.status(200).json(r.rows);
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      const { event_id, username, kind } = body || {};
      if (!event_id || !username || !kind) {
        return res.status(400).json({ error: "event_id, username, kind は必須です" });
      }
      // 同一ユーザーが同じ時間帯に重複応募できないようにサーバー側でブロック
      // 対象イベントの日時を取得
      const evRes = await query(
        `SELECT date, start_time, end_time FROM events WHERE id = $1`,
        [event_id]
      );
      const target = evRes.rows?.[0] || null;
      if (target && target.date && target.start_time) {
        // 同日の既存応募のうち、時間が重なるものを検出
        // 文字列の HH:MM 同士の比較で重なりを判定
        const overlapRes = await query(
          `SELECT 1
             FROM applications a
             JOIN events e ON e.id = a.event_id
            WHERE a.username = $1
              AND e.date = $2
              AND (
                    -- 開始時刻が同一
                    (e.start_time = $3)
                 OR (
                      -- 両方とも終了時刻が存在し、時間帯が重複
                      e.start_time IS NOT NULL AND e.end_time IS NOT NULL
                  AND $3 IS NOT NULL AND $4 IS NOT NULL
                  AND NOT (e.end_time <= $3 OR $4 <= e.start_time)
                 )
              )
            LIMIT 1`,
          [username, target.date, target.start_time, target.end_time || target.start_time]
        );
        if (overlapRes.rows && overlapRes.rows.length > 0) {
          return res.status(400).json({ error: "同じ時間帯に重複して応募することはできません" });
        }
      }
      await query(
        `INSERT INTO applications (event_id, username, kind)
         VALUES ($1,$2,$3)
         ON CONFLICT (event_id, username, kind) DO NOTHING`,
        [event_id, username, kind]
      );
      return res.status(201).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const id = url.searchParams.get("id");
      if (!id) return res.status(400).json({ error: "id が必要です" });
      await query(`DELETE FROM applications WHERE id = $1`, [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("[/api/applications] error:", e);
    return res.status(500).json({ error: "Server Error: " + e.message });
  }
}