// /api/applications.js
import { query } from "./_db.js";

// 残枠チェック用：イベント1件 + 現在応募数
async function fetchEventWithCounts(eventId) {
  const sql = `
    SELECT
      e.*,
      COALESCE(SUM(CASE WHEN a.kind='driver' THEN 1 ELSE 0 END),0) AS applied_driver,
      COALESCE(SUM(CASE WHEN a.kind='attendant' THEN 1 ELSE 0 END),0) AS applied_attendant
    FROM events e
    LEFT JOIN applications a ON a.event_id = e.id
    WHERE e.id = $1
    GROUP BY e.id
  `;
  const r = await query(sql, [eventId]);
  return r.rows?.[0];
}

export default async function handler(req, res) {
  // 応募作成
  if (req.method === "POST") {
    try {
      const { event_id, username, kind } = req.body || {};
      if (!event_id || !username || !kind) {
        return res.status(400).json({ error: "event_id, username, kind が必要です" });
      }
      if (!["driver", "attendant"].includes(kind)) {
        return res.status(400).json({ error: "kind は driver/attendant です" });
      }

      const ev = await fetchEventWithCounts(event_id);
      if (!ev) return res.status(404).json({ error: "イベントが見つかりません" });

      // 枠があればOK
      if (kind === "driver" && ev.capacity_driver != null) {
        if (Number(ev.applied_driver) >= Number(ev.capacity_driver)) {
          return res.status(409).json({ error: "運転手枠が満席です" });
        }
      }
      if (kind === "attendant" && ev.capacity_attendant != null) {
        if (Number(ev.applied_attendant) >= Number(ev.capacity_attendant)) {
          return res.status(409).json({ error: "添乗員枠が満席です" });
        }
      }

      // 応募（同一ユーザー/同一イベント/同一種別の重複はUNIQUEで防止）
      await query(
        `INSERT INTO applications (event_id, username, kind) VALUES ($1,$2,$3)
         ON CONFLICT (event_id, username, kind) DO NOTHING`,
        [event_id, username, kind]
      );

      return res.json({ ok: true });
    } catch (e) {
      console.error("POST /api/applications error", e);
      return res.status(500).json({ error: "応募に失敗しました" });
    }
  }

  // 自分の応募一覧（?username=）
  if (req.method === "GET") {
    try {
      const { username, event_id } = req.query || {};
      if (event_id) {
        // 指定イベントの応募一覧（ユーザー画面で重複制御する場合にも利用可）
        const r = await query(
          "SELECT * FROM applications WHERE event_id = $1 ORDER BY created_at ASC",
          [event_id]
        );
        return res.json(r.rows || []);
      }
      if (!username) return res.status(400).json({ error: "username または event_id を指定してください" });
      const r = await query(
        `SELECT * FROM applications WHERE username = $1 ORDER BY created_at DESC`,
        [username]
      );
      return res.json(r.rows || []);
    } catch (e) {
      console.error("GET /api/applications error", e);
      return res.status(500).json({ error: "取得に失敗しました" });
    }
  }

  // 応募取消（id指定）
  if (req.method === "DELETE") {
    try {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ error: "id が必要です" });

      const r = await query("DELETE FROM applications WHERE id = $1", [id]);
      if (!r.rowCount) return res.status(404).json({ error: "対象がありません" });
      return res.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/applications error", e);
      return res.status(500).json({ error: "取消に失敗しました" });
    }
  }

  return res.status(405).end();
}