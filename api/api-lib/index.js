// /api/api-lib/index.js
import { query, healthcheck } from "./_db.js";
import crypto from "crypto";

// ===== CORS 共通ヘッダ =====
function withCORS(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// ===== Cookie ユーティリティ =====
const SESSION_COOKIE_NAME = "gsession";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(data) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
}

function serializeCookie(name, value, { maxAge, path = "/", httpOnly = true, sameSite = "Lax", secure } = {}) {
  const parts = [`${name}=${value}`];
  if (typeof maxAge === "number") {
    parts.push(`Max-Age=${maxAge}`);
    const expires = new Date(Date.now() + maxAge * 1000);
    // Max-Age=0 のときも過去日付を設定して確実に消す
    if (maxAge === 0) {
      parts.push(`Expires=${new Date(0).toUTCString()}`);
    } else {
      parts.push(`Expires=${expires.toUTCString()}`);
    }
  }
  if (path) parts.push(`Path=${path}`);
  if (httpOnly) parts.push("HttpOnly");
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function setSessionCookie(res, payload, req) {
  const json = JSON.stringify(payload);
  const b64 = base64url(json);
  const sig = sign(b64);
  const value = `${b64}.${sig}`;
  const secure = (req.headers["x-forwarded-proto"] || "http") === "https";
  res.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, value, {
      maxAge: SESSION_MAX_AGE_SEC,
      httpOnly: true,
      sameSite: "Lax",
      secure,
      path: "/",
    })
  );
}

function clearSessionCookie(res, req) {
  // 強制的に全条件で削除/無効
  const secure = (req.headers["x-forwarded-proto"] || "http") === "https";
  res.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "Lax",
      secure,
      path: "/",
      // expiresも必ず明示的に追記
      expires: new Date(0).toUTCString(),
    })
  );
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(/;\s*/).reduce((acc, v) => {
    if (!v) return acc;
    const idx = v.indexOf("=");
    if (idx === -1) return acc;
    const k = decodeURIComponent(v.slice(0, idx).trim());
    const val = decodeURIComponent(v.slice(idx + 1).trim());
    acc[k] = val;
    return acc;
  }, {});
}

function getSession(req) {
  const cookies = parseCookies(req);
  const raw = cookies[SESSION_COOKIE_NAME];
  if (!raw) return null;
  const [b64, sig] = raw.split(".");
  if (!b64 || !sig) return null;
  const expected = sign(b64);
  if (sig !== expected) return null;
  try {
    const json = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

// ===== JSONボディパーサ =====
async function parseJSONBody(req) {
  if (req.method === "GET" || req.method === "DELETE") return {};
  try {
    if (typeof req.body === "object" && req.body !== null) return req.body;
    const text = await new Promise((resolve) => {
      let s = "";
      req.on("data", (c) => (s += c));
      req.on("end", () => resolve(s || ""));
    });
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// ===== ルート解決 =====
function resolveRoute(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = url.searchParams;
  const trim = (s) => (s || "").replace(/^\/+|\/+$/g, "");

  // vercel.json の rewrite で ?path=xxx が付く想定
  let sub = trim(q.get("path"));

  // 保険: forwarded header / 実パスから推測
  if (!sub) {
    const forwarded = [
      req.headers["x-forwarded-uri"],
      req.headers["x-invoke-path"],
      req.headers["x-vercel-path"],
    ].find(Boolean);
    if (typeof forwarded === "string") {
      const p = trim(forwarded);
      sub = p.startsWith("api/") ? trim(p.slice(4)) : p;
    } else {
      const p = trim(url.pathname);
      sub = p.startsWith("api/") ? trim(p.slice(4)) : p;
    }
  }
  return { url, q, sub };
}

// ===== メインハンドラ =====
export default async function handler(req, res) {
  try {
    withCORS(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const { q, sub } = resolveRoute(req);
    const body = await parseJSONBody(req);

    // ---- /api/health ----
    if (sub === "health") {
      const dbOK = await healthcheck().catch(() => 0);
      return res.status(200).json({ ok: true, db: dbOK ? 1 : 0 });
    }

    // ---- /api/login ----
    if (sub === "login") {
      if (req.method !== "POST" && req.method !== "GET") {
        return res.status(405).json({ error: "Method Not Allowed" });
      }

      const username =
        (req.method === "GET" ? q.get("username") : (body || {}).username) || "";
      const password =
        (req.method === "GET" ? q.get("password") : (body || {}).password) || "";

      if (!username || !password) {
        return res.status(400).json({ error: "username と password が必要です" });
      }

      const r = await query(
        "SELECT id, username, password, role FROM users WHERE username = $1 LIMIT 1",
        [username]
      );
      const u = r.rows?.[0];
      if (!u) return res.status(404).json({ error: "ユーザーが見つかりません" });
      if (u.password !== password)
        return res.status(401).json({ error: "パスワードが違います" });

      // セッション cookie 設定
      setSessionCookie(res, { id: u.id, username: u.username, role: u.role || "user" }, req);

      // 認証系はキャッシュさせない
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Vary", "Cookie");
      return res.status(200).json({ message: "OK", role: u.role, username: u.username });
    }

    // ---- /api/me ----
    if (sub === "me") {
      const sess = getSession(req);
      if (!sess) return res.status(401).json({ error: "Not authenticated" });
      // 認証系はキャッシュさせない
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Vary", "Cookie");
      return res.status(200).json({ ok: true, ...sess });
    }

    // ---- /api/logout ----
    if (sub === "logout") {
      clearSessionCookie(res, req);
      // 認証系はキャッシュさせない
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Vary", "Cookie");
      return res.status(200).json({ ok: true });
    }

    // ---- /api/register ----
    if (sub === "register") {
      if (req.method !== "POST")
        return res.status(405).json({ error: "Method Not Allowed" });

      const { username, password, role = "user" } = body || {};
      if (!username || !password)
        return res.status(400).json({ error: "username と password が必要です" });

      try {
        await query(
          "INSERT INTO users (username, password, role) VALUES ($1,$2,$3)",
          [username, password, role]
        );
        return res.status(201).json({ ok: true });
      } catch (e) {
        if (String(e?.message || "").includes("duplicate key"))
          return res
            .status(409)
            .json({ error: "このユーザー名は既に存在します" });
        throw e;
      }
    }

    // ---- /api/users ----
    if (sub === "users") {
      if (req.method === "GET") {
        const r = await query(
          "SELECT id, username, role, familiar FROM users ORDER BY id ASC"
        );
        return res.status(200).json(r.rows);
      }
      if (req.method === "POST") {
        const { username, password, role = "user", familiar = null } = body || {};
        if (!username || !password)
          return res.status(400).json({ error: "必須項目不足" });
        await query(
          "INSERT INTO users (username, password, role, familiar) VALUES ($1,$2,$3,$4)",
          [username, password, role, familiar]
        );
        return res.status(201).json({ ok: true });
      }
      if (req.method === "PATCH") {
        const { username, familiar } = body || {};
        if (!username) return res.status(400).json({ error: "username が必要です" });
        const famValue = familiar === null || familiar === undefined || familiar === "unknown" ? null : familiar;
        await query("UPDATE users SET familiar = $2 WHERE username = $1", [username, famValue]);
        return res.status(200).json({ ok: true });
      }
      if (req.method === "DELETE") {
        const id = q.get("id");
        if (!id) return res.status(400).json({ error: "id が必要です" });
        await query("DELETE FROM users WHERE id = $1", [id]);
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // ---- /api/events ----
    if (sub === "events") {
      if (req.method === "GET") {
        const r = await query(
          "SELECT id, date, label, icon, start_time, end_time, capacity_driver, capacity_attendant FROM events ORDER BY date ASC"
        );
        return res.status(200).json(r.rows);
      }
      if (req.method === "POST") {
        const {
          date,
          label,
          icon = "",
          start_time = null,
          end_time = null,
          capacity_driver = null,
          capacity_attendant = null,
        } = body || {};
        if (!date || !label)
          return res.status(400).json({ error: "date と label は必須です" });
        await query(
          `INSERT INTO events (date, label, icon, start_time, end_time, capacity_driver, capacity_attendant)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [date, label, icon, start_time, end_time, capacity_driver, capacity_attendant]
        );
        return res.status(201).json({ ok: true });
      }
      if (req.method === "PATCH") {
        const { id, date, label, icon, start_time, end_time, capacity_driver, capacity_attendant } = body || {};
        if (!id) return res.status(400).json({ error: "id が必要です" });
        
        // 更新するフィールドを構築
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (date !== undefined) {
          updates.push(`date = $${paramIndex++}`);
          values.push(date);
        }
        if (label !== undefined) {
          updates.push(`label = $${paramIndex++}`);
          values.push(label);
        }
        if (icon !== undefined) {
          updates.push(`icon = $${paramIndex++}`);
          values.push(icon);
        }
        if (start_time !== undefined) {
          updates.push(`start_time = $${paramIndex++}`);
          values.push(start_time);
        }
        if (end_time !== undefined) {
          updates.push(`end_time = $${paramIndex++}`);
          values.push(end_time);
        }
        if (capacity_driver !== undefined) {
          updates.push(`capacity_driver = $${paramIndex++}`);
          values.push(capacity_driver);
        }
        if (capacity_attendant !== undefined) {
          updates.push(`capacity_attendant = $${paramIndex++}`);
          values.push(capacity_attendant);
        }
        
        if (updates.length === 0) {
          return res.status(400).json({ error: "更新するフィールドがありません" });
        }
        
        values.push(id);
        await query(
          `UPDATE events SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
          values
        );
        return res.status(200).json({ ok: true });
      }
      if (req.method === "DELETE") {
        const id = q.get("id");
        if (!id) return res.status(400).json({ error: "id が必要です" });
        await query("DELETE FROM events WHERE id = $1", [id]);
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // ---- /api/applications ----
    if (sub === "applications") {
      if (req.method === "GET") {
        const eventId = q.get("event_id");
        const username = q.get("username");
        if (eventId) {
          const r = await query(
            "SELECT id, event_id, username, kind, created_at FROM applications WHERE event_id = $1 ORDER BY created_at ASC",
            [eventId]
          );
          return res.status(200).json(r.rows);
        }
        if (username) {
          const r = await query(
            "SELECT id, event_id, username, kind, created_at FROM applications WHERE username = $1 ORDER BY created_at DESC",
            [username]
          );
          return res.status(200).json(r.rows);
        }
        return res
          .status(400)
          .json({ error: "event_id または username を指定してください" });
      }

      if (req.method === "POST") {
        const { event_id, username, kind } = body || {};
        if (!event_id || !username || !kind)
          return res
            .status(400)
            .json({ error: "event_id, username, kind が必要です" });


        // 確定済みメンバーがいる場合、新規応募を制限
        try {
          await query(
            `CREATE TABLE IF NOT EXISTS selections (
               event_id BIGINT NOT NULL,
               username TEXT NOT NULL,
               kind TEXT NOT NULL CHECK (kind IN ('driver','attendant')),
               decided_at TIMESTAMPTZ DEFAULT now(),
               PRIMARY KEY (event_id, username, kind)
             )`
          );
          const decCheck = await query(
            `SELECT username FROM selections WHERE event_id = $1 AND kind = $2`,
            [event_id, kind]
          );
          
          // 定員チェック
          const evCheck = await query(
            `SELECT capacity_driver, capacity_attendant FROM events WHERE id = $1`,
            [event_id]
          );
          let cap = null;
          if (evCheck.rows?.[0]) {
            cap = kind === "driver" ? evCheck.rows[0].capacity_driver : evCheck.rows[0].capacity_attendant;
          }
          
          // 同じイベントで既に別の役割に応募しているかチェック
          const existingApp = await query(
            `SELECT kind FROM applications WHERE event_id = $1 AND username = $2`,
            [event_id, username]
          );
          if (existingApp.rows && existingApp.rows.length > 0) {
            const existingKind = existingApp.rows[0].kind;
            if (existingKind !== kind) {
              const existingKindLabel = existingKind === "driver" ? "運転手" : "添乗員";
              return res.status(403).json({ 
                error: `このイベントには既に${existingKindLabel}として応募しています。同じイベントで運転手と添乗員の両方に応募することはできません。` 
              });
            }
            // 既に同じ役割で応募している場合は重複として処理（ON CONFLICTで処理される）
          }
          
          // 定員チェックを削除（何人でも応募できるようにする。管理者が後から選ぶため）
          // 以前の定員制限と自動切り替えロジックは削除

        } catch (e) {
          // selectionsテーブルがない場合などは続行
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
        // 応募取消（id または event_id + username + kind）
        const id = q.get("id");
        const eventId = q.get("event_id");
        const username = q.get("username");
        const kind = q.get("kind");

        if (id) {
          await query("DELETE FROM applications WHERE id = $1", [id]);
          return res.status(200).json({ ok: true });
        }
        if (eventId && username && kind) {
          await query(
            "DELETE FROM applications WHERE event_id = $1 AND username = $2 AND kind = $3",
            [eventId, username, kind]
          );
          return res.status(200).json({ ok: true });
        }
        return res
          .status(400)
          .json({ error: "id または (event_id, username, kind) が必要です" });
      }

      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // ---- /api/fairness ----
    if (sub === "fairness") {
      if (req.method !== "GET")
        return res.status(405).json({ error: "Method Not Allowed" });

      const eventId = q.get("event_id");
      if (!eventId)
        return res.status(400).json({ error: "event_id が必要です" });

      const sql = `
        WITH decided_count AS (
          SELECT
            username,
            kind,
            COUNT(*) AS times,
            MAX(decided_at) AS last_at
          FROM selections
          GROUP BY username, kind
        ),
        appl AS (
          SELECT a.id, a.event_id, a.username, a.kind, a.created_at,
                 COALESCE(dc.times, 0) AS times,
                 dc.last_at
          FROM applications a
          LEFT JOIN decided_count dc
            ON dc.username = a.username AND dc.kind = a.kind
          WHERE a.event_id = $1
        ),
        ranked AS (
          SELECT *,
                 ROW_NUMBER() OVER (
                   PARTITION BY kind
                   ORDER BY times ASC,
                            COALESCE(last_at, 'epoch') ASC,
                            created_at ASC
                 ) AS rnk
          FROM appl
        )
        SELECT * FROM ranked ORDER BY kind, rnk;
      `;
      const r = await query(sql, [eventId]);

      const driver = [], attendant = [];
      for (const row of r.rows) {
        const item = {
          username: row.username,
          kind: row.kind,
          times: Number(row.times) || 0,
          last_at: row.last_at,
          applied_at: row.created_at,
          rank: Number(row.rnk),
        };
        (row.kind === "driver" ? driver : attendant).push(item);
      }

      return res.status(200).json({ event_id: Number(eventId), driver, attendant });
    }

    // ---- /api/decide ---- 選出の保存/取得/取消
    if (sub === "decide") {
      // テーブルを保証
      await query(
        `CREATE TABLE IF NOT EXISTS selections (
           event_id BIGINT NOT NULL,
           username TEXT NOT NULL,
           kind TEXT NOT NULL CHECK (kind IN ('driver','attendant')),
           decided_at TIMESTAMPTZ DEFAULT now(),
           PRIMARY KEY (event_id, username, kind)
         )`
      );

      if (req.method === "GET") {
        const eventId = Number(q.get("event_id"));
        if (!eventId) return res.status(400).json({ error: "event_id が必要です" });
        const r = await query(
          `SELECT username, kind FROM selections WHERE event_id = $1 ORDER BY decided_at ASC`,
          [eventId]
        );
        const driver = r.rows.filter((x) => x.kind === "driver").map((x) => x.username);
        const attendant = r.rows.filter((x) => x.kind === "attendant").map((x) => x.username);
        return res.status(200).json({ event_id: eventId, driver, attendant });
      }

      if (req.method === "DELETE") {
        const eventId = Number(q.get("event_id"));
        if (!eventId) return res.status(400).json({ error: "event_id が必要です" });
        await query(`DELETE FROM selections WHERE event_id = $1`, [eventId]);
        return res.status(200).json({ ok: true });
      }

      if (req.method === "POST") {
        const { event_id, driver = [], attendant = [] } = body || {};
        const eventId = Number(event_id);
        if (!eventId) return res.status(400).json({ error: "event_id が必要です" });

        // 定員チェック（null の場合はデフォルト1人として扱う）
        let capD = 1, capA = 1;
        try {
          const er = await query(
            `SELECT capacity_driver, capacity_attendant FROM events WHERE id = $1`,
            [eventId]
          );
          if (er.rows?.[0]) {
            capD = er.rows[0].capacity_driver != null ? Number(er.rows[0].capacity_driver) : 1;
            capA = er.rows[0].capacity_attendant != null ? Number(er.rows[0].capacity_attendant) : 1;
          }
        } catch {}

        if (driver.length > capD) {
          return res.status(400).json({ error: `運転手の選出が定員(${capD})を超えています` });
        }
        if (attendant.length > capA) {
          return res.status(400).json({ error: `添乗員の選出が定員(${capA})を超えています` });
        }

        await query(`DELETE FROM selections WHERE event_id = $1`, [eventId]);
        const values = [];
        for (const u of Array.from(new Set(driver))) {
          values.push([eventId, u, "driver"]);
        }
        for (const u of Array.from(new Set(attendant))) {
          values.push([eventId, u, "attendant"]);
        }
        if (values.length) {
          const params = values.flatMap((v) => v);
          const tuples = values.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(",");
          await query(
            `INSERT INTO selections (event_id, username, kind) VALUES ${tuples}
             ON CONFLICT (event_id, username, kind) DO NOTHING`,
            params
          );
          
          // 通知を作成
          await query(`
            CREATE TABLE IF NOT EXISTS notifications (
              id BIGSERIAL PRIMARY KEY,
              username TEXT NOT NULL,
              event_id BIGINT NOT NULL,
              kind TEXT NOT NULL,
              message TEXT NOT NULL,
              created_at TIMESTAMPTZ DEFAULT now(),
              read_at TIMESTAMPTZ
            )
          `);
          
          // イベント情報を取得
          const eventInfo = await query(`SELECT date, label, start_time FROM events WHERE id = $1`, [eventId]);
          if (eventInfo.rows?.[0]) {
            const ev = eventInfo.rows[0];
            const kindLabels = { driver: "運転手", attendant: "添乗員" };
            for (const u of Array.from(new Set([...driver, ...attendant]))) {
              const userKinds = [];
              if (driver.includes(u)) userKinds.push("driver");
              if (attendant.includes(u)) userKinds.push("attendant");
              
              const message = `${ev.label}（${ev.date} ${ev.start_time}〜）の${userKinds.map(k => kindLabels[k]).join("・")}として確定しました。`;
              await query(
                `INSERT INTO notifications (username, event_id, kind, message) VALUES ($1, $2, $3, $4)`,
                [u, eventId, userKinds.join(","), message]
              );
            }
          }
        }
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // ---- /api/decide_auto ---- 定員に合わせて自動選出し保存
    if (sub === "decide_auto") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
      const { event_id } = body || {};
      const eventId = Number(event_id);
      if (!eventId) return res.status(400).json({ error: "event_id が必要です" });

      // capacity 取得（定員がnullの場合は1人として扱う）
      const er = await query(
        `SELECT capacity_driver, capacity_attendant FROM events WHERE id = $1`,
        [eventId]
      );
      if (!er.rows?.[0]) return res.status(404).json({ error: "イベントが見つかりません" });
      // 定員がnullの場合は1人（デフォルト）として扱う
      const capD = er.rows[0].capacity_driver != null ? Number(er.rows[0].capacity_driver) : 1;
      const capA = er.rows[0].capacity_attendant != null ? Number(er.rows[0].capacity_attendant) : 1;

      // 公平ランキングを取得（確定回数（selections）で計算）
      let r;
      try {
        const sql = `
          WITH decided_count AS (
            SELECT
              username,
              kind,
              COUNT(*) AS times,
              MAX(decided_at) AS last_at
            FROM selections
            GROUP BY username, kind
          ),
          appl AS (
            SELECT a.id, a.event_id, a.username, a.kind, a.created_at,
                   COALESCE(dc.times, 0) AS times,
                   dc.last_at
            FROM applications a
            LEFT JOIN decided_count dc
              ON dc.username = a.username AND dc.kind = a.kind
            WHERE a.event_id = $1
          ),
          ranked AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                     PARTITION BY kind
                     ORDER BY times ASC,
                              COALESCE(last_at, 'epoch') ASC,
                              created_at ASC
                   ) AS rnk
            FROM appl
          )
          SELECT * FROM ranked ORDER BY kind, rnk;
        `;
        r = await query(sql, [eventId]);
      } catch (e) {
        // フォールバック：応募順
        r = await query(
          `SELECT id, event_id, username, kind, created_at,
                 0 AS times, NULL AS last_at
           FROM applications
           WHERE event_id = $1
           ORDER BY kind, created_at ASC`,
          [eventId]
        );
        // ランクを付与
        const driverRows = r.rows.filter((x) => x.kind === "driver");
        const attendantRows = r.rows.filter((x) => x.kind === "attendant");
        driverRows.forEach((row, idx) => { row.rnk = idx + 1; });
        attendantRows.forEach((row, idx) => { row.rnk = idx + 1; });
        r.rows = [...driverRows, ...attendantRows];
      }
      
      const driverRank = r.rows.filter((x) => x.kind === "driver").sort((a,b)=>(a.rnk||999)-(b.rnk||999));
      const attendantRank = r.rows.filter((x) => x.kind === "attendant").sort((a,b)=>(a.rnk||999)-(b.rnk||999));

      // 定員がnullの場合は全員選出、0の場合は0人、正の数の場合はその数まで
      const pickedDriver = capD == null ? driverRank.map((x) => x.username) : driverRank.slice(0, Math.max(0, capD)).map((x) => x.username);
      const pickedAttendant = capA == null ? attendantRank.map((x) => x.username) : attendantRank.slice(0, Math.max(0, capA)).map((x) => x.username);
      
      // デバッグ情報（開発時に確認用）
      console.log(`[decide_auto] event_id: ${eventId}, capD: ${capD}, capA: ${capA}, driver応募者: ${driverRank.length}, attendant応募者: ${attendantRank.length}, 選出: driver=${pickedDriver.length}, attendant=${pickedAttendant.length}`);

      // 自動選出は保存しない（手動確定のみ）。選出結果だけを返す

      return res.status(200).json({ ok: true, event_id: eventId, driver: pickedDriver, attendant: pickedAttendant });
    }

    // ---- /api/notifications ---- 通知の取得・既読
    if (sub === "notifications") {
      const session = await getSession(req);
      if (!session?.username) return res.status(401).json({ error: "認証が必要です" });

      // テーブルを保証
      await query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          event_id BIGINT NOT NULL,
          kind TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now(),
          read_at TIMESTAMPTZ
        )
      `);

      if (req.method === "GET") {
        const r = await query(
          `SELECT id, event_id, kind, message, created_at, read_at 
           FROM notifications 
           WHERE username = $1 
           ORDER BY created_at DESC 
           LIMIT 50`,
          [session.username]
        );
        return res.status(200).json(r.rows);
      }

      if (req.method === "POST") {
        // 既読にする
        const { id } = body || {};
        if (!id) return res.status(400).json({ error: "id が必要です" });
        await query(
          `UPDATE notifications SET read_at = now() WHERE id = $1 AND username = $2`,
          [Number(id), session.username]
        );
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // ---- /api/cancel ---- 確定後のキャンセル機能
    if (sub === "cancel") {
      const session = await getSession(req);
      if (!session?.username) return res.status(401).json({ error: "認証が必要です" });

      if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

      const { event_id, kind } = body || {};
      const eventId = Number(event_id);
      if (!eventId || !kind || !["driver", "attendant"].includes(kind)) {
        return res.status(400).json({ error: "event_id と kind (driver/attendant) が必要です" });
      }

      // 確定されているか確認
      const checkDecided = await query(
        `SELECT username FROM selections WHERE event_id = $1 AND username = $2 AND kind = $3`,
        [eventId, session.username, kind]
      );
      if (checkDecided.rows.length === 0) {
        return res.status(400).json({ error: "この役割は確定されていません" });
      }

      // イベント情報を取得
      const eventInfo = await query(
        `SELECT date, label, start_time, capacity_driver, capacity_attendant FROM events WHERE id = $1`,
        [eventId]
      );
      if (!eventInfo.rows?.[0]) {
        return res.status(404).json({ error: "イベントが見つかりません" });
      }
      const ev = eventInfo.rows[0];

      // キャンセル実行（確定から削除のみ。応募は残すため再投票可能）
      await query(
        `DELETE FROM selections WHERE event_id = $1 AND username = $2 AND kind = $3`,
        [eventId, session.username, kind]
      );
      // 応募は削除しない（確定後のキャンセルでも再投票できるようにする）

      // 管理者への通知を作成
      await query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          event_id BIGINT NOT NULL,
          kind TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now(),
          read_at TIMESTAMPTZ
        )
      `);

      // 管理者ユーザーを取得
      const adminUsers = await query(`SELECT username FROM users WHERE role = 'admin'`);
      const kindLabels = { driver: "運転手", attendant: "添乗員" };
      
      for (const adminRow of adminUsers.rows) {
        const adminUsername = adminRow.username;
        const message = `${session.username}さんが${ev.label}（${ev.date} ${ev.start_time}〜）の${kindLabels[kind]}をキャンセルしました。`;
        await query(
          `INSERT INTO notifications (username, event_id, kind, message) VALUES ($1, $2, $3, $4)`,
          [adminUsername, eventId, `cancel_${kind}`, message]
        );
      }

      // 繰り上げ確定: キャンセル待ちから次の人を自動選出
      try {
        // 現在の確定済み人数を確認
        const currentDecided = await query(
          `SELECT username FROM selections WHERE event_id = $1 AND kind = $2`,
          [eventId, kind]
        );
        const currentCount = currentDecided.rows.length;

        // 定員を確認
        const capacity = kind === "driver" ? (ev.capacity_driver ?? 1) : (ev.capacity_attendant ?? 1);
        
        // 定員に満たない場合は通常の応募者から自動繰り上げ選出
        if (currentCount < capacity) {
          // 通常の応募者（確定されていない）を取得（確定回数で公平ランキング順）
          let applicantQuery;
          try {
            applicantQuery = await query(`
              WITH decided_count AS (
                SELECT
                  username,
                  kind,
                  COUNT(*) AS times,
                  MAX(decided_at) AS last_at
                FROM selections
                GROUP BY username, kind
              ),
              appl AS (
                SELECT a.id, a.event_id, a.username, a.kind, a.created_at,
                       COALESCE(dc.times, 0) AS times,
                       dc.last_at
                FROM applications a
                LEFT JOIN decided_count dc
                  ON dc.username = a.username AND dc.kind = a.kind
                WHERE a.event_id = $1 AND a.kind = $2
                  AND NOT EXISTS (
                    SELECT 1 FROM selections s 
                    WHERE s.event_id = a.event_id 
                      AND s.username = a.username 
                      AND s.kind = a.kind
                  )
              ),
              ranked AS (
                SELECT *,
                       ROW_NUMBER() OVER (
                         ORDER BY times ASC,
                                  COALESCE(last_at, 'epoch') ASC,
                                  created_at ASC
                       ) AS rnk
                FROM appl
              )
              SELECT username, rnk AS rank, times
              FROM ranked
              LIMIT $3
            `, [eventId, kind, capacity - currentCount]);
          } catch {
            // フォールバック：応募順
            applicantQuery = await query(
              `SELECT a.username, a.created_at, 
                      ROW_NUMBER() OVER (ORDER BY a.created_at ASC) AS rank, 
                      0 AS times
               FROM applications a
               WHERE a.event_id = $1 AND a.kind = $2
                 AND NOT EXISTS (
                   SELECT 1 FROM selections s 
                   WHERE s.event_id = a.event_id 
                     AND s.username = a.username 
                     AND s.kind = a.kind
                 )
               LIMIT $3`,
              [eventId, kind, capacity - currentCount]
            );
          }

          // 選出された人を確定
          const selectedUsernames = applicantQuery.rows.map(r => r.username);
          
          if (selectedUsernames.length > 0) {
            for (const username of selectedUsernames) {
              await query(
                `INSERT INTO selections (event_id, username, kind) VALUES ($1, $2, $3)
                 ON CONFLICT (event_id, username, kind) DO NOTHING`,
                [eventId, username, kind]
              );

              // 選出された人に通知
              const confirmMessage = `${ev.label}（${ev.date} ${ev.start_time}〜）の${kindLabels[kind]}がキャンセルされたため、あなたが繰り上げで確定しました。`;
              await query(
                `INSERT INTO notifications (username, event_id, kind, message) VALUES ($1, $2, $3, $4)`,
                [username, eventId, kind, confirmMessage]
              );
            }

            // 管理者に繰り上げ確定の通知
            for (const adminRow of adminUsers.rows) {
              const adminUsername = adminRow.username;
              const promoteMessage = `${selectedUsernames.join(", ")}さんが${ev.label}（${ev.date} ${ev.start_time}〜）の${kindLabels[kind]}として繰り上げ確定しました。`;
              await query(
                `INSERT INTO notifications (username, event_id, kind, message) VALUES ($1, $2, $3, $4)`,
                [adminUsername, eventId, `promote_${kind}`, promoteMessage]
              );
            }
          } else {
            // 添乗員が不足している場合、運転手として応募している人を添乗員として登録
            if (kind === "attendant") {
              try {
                const driverAppsQuery = await query(`
                  SELECT DISTINCT a.username
                  FROM applications a
                  WHERE a.event_id = $1 AND a.kind = 'driver'
                    AND NOT EXISTS (
                      SELECT 1 FROM selections s 
                      WHERE s.event_id = $1 
                        AND s.username = a.username 
                        AND s.kind = 'attendant'
                    )
                    AND NOT EXISTS (
                      SELECT 1 FROM selections s 
                      WHERE s.event_id = $1 
                        AND s.username = a.username 
                        AND s.kind = 'driver'
                    )
                  LIMIT $2
                `, [eventId, capacity - currentCount]);
                
                const driverUsernames = driverAppsQuery.rows.map(r => r.username);
                if (driverUsernames.length > 0) {
                  for (const username of driverUsernames) {
                    // 添乗員として確定
                    await query(
                      `INSERT INTO selections (event_id, username, kind) VALUES ($1, $2, 'attendant')
                       ON CONFLICT (event_id, username, kind) DO NOTHING`,
                      [eventId, username]
                    );
                    
                    // 運転手としての応募を削除し、添乗員として応募を追加（既にあれば何もしない）
                    await query(
                      `DELETE FROM applications WHERE event_id = $1 AND username = $2 AND kind = 'driver'`,
                      [eventId, username]
                    );
                    await query(
                      `INSERT INTO applications (event_id, username, kind)
                       VALUES ($1, $2, 'attendant')
                       ON CONFLICT (event_id, username, kind) DO NOTHING`,
                      [eventId, username]
                    );
                    
                    // 通知
                    const changeMessage = `${ev.label}（${ev.date} ${ev.start_time}〜）について、運転手で応募されましたが添乗員が不足しているため、添乗員として登録されました。`;
                    await query(
                      `INSERT INTO notifications (username, event_id, kind, message) VALUES ($1, $2, $3, $4)`,
                      [username, eventId, 'attendant', changeMessage]
                    );
                  }
                  
                  // 管理者に通知
                  for (const adminRow of adminUsers.rows) {
                    const adminUsername = adminRow.username;
                    const promoteMessage = `${driverUsernames.join(", ")}さんが${ev.label}（${ev.date} ${ev.start_time}〜）について、運転手から添乗員として自動登録されました。`;
                    await query(
                      `INSERT INTO notifications (username, event_id, kind, message) VALUES ($1, $2, $3, $4)`,
                      [adminUsername, eventId, `promote_attendant`, promoteMessage]
                    );
                  }
                  return; // 運転手から添乗員に切り替えできたので処理終了
                }
              } catch (err) {
                console.error("運転手→添乗員の自動切り替えエラー:", err);
              }
            }
            
            // 自動選出できない場合（応募者がいない場合）、管理者に通知
            for (const adminRow of adminUsers.rows) {
              const adminUsername = adminRow.username;
                const insufficientMessage = `⚠️【定員不足】${ev.label}（${ev.date} ${ev.start_time}〜）の${kindLabels[kind]}が定員不足です。キャンセルにより空きができましたが、繰り上げ可能な応募者がいません。`;
              await query(
                `INSERT INTO notifications (username, event_id, kind, message) VALUES ($1, $2, $3, $4)`,
                [adminUsername, eventId, `insufficient_${kind}`, insufficientMessage]
              );
            }
          }
        }
      } catch (err) {
        console.error("繰り上げ確定エラー:", err);
        // 繰り上げ確定のエラーはキャンセル処理自体を失敗させない
      }

      return res.status(200).json({ ok: true, message: "キャンセルが完了しました" });
    }

    // ---- /api/user-settings ---- ユーザー設定（通知ON/OFF、Googleカレンダー同期）
    if (sub === "user-settings") {
      const session = await getSession(req);
      if (!session?.username) return res.status(401).json({ error: "認証が必要です" });

      // テーブルを保証
      await query(`
        CREATE TABLE IF NOT EXISTS user_settings (
          username TEXT PRIMARY KEY,
          notifications_enabled BOOLEAN DEFAULT true,
          google_calendar_enabled BOOLEAN DEFAULT false,
          google_calendar_id TEXT,
          updated_at TIMESTAMPTZ DEFAULT now()
        )
      `);

      if (req.method === "GET") {
        const r = await query(
          `SELECT notifications_enabled, google_calendar_enabled, google_calendar_id 
           FROM user_settings 
           WHERE username = $1`,
          [session.username]
        );
        const settings = r.rows[0] || {
          notifications_enabled: true,
          google_calendar_enabled: false,
          google_calendar_id: null,
        };
        return res.status(200).json(settings);
      }

      if (req.method === "POST") {
        const { notifications_enabled, google_calendar_enabled, google_calendar_id } = body || {};
        await query(
          `INSERT INTO user_settings (username, notifications_enabled, google_calendar_enabled, google_calendar_id, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (username) DO UPDATE SET
             notifications_enabled = $2,
             google_calendar_enabled = $3,
             google_calendar_id = $4,
             updated_at = now()`,
          [
            session.username,
            notifications_enabled !== false,
            google_calendar_enabled === true,
            google_calendar_id || null,
          ]
        );
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // ---- その他 404 ----
    return res.status(404).json({ error: "Not Found" });
  } catch (err) {
    console.error("[/api/api-lib/index] Error:", err);
    return res
      .status(500)
      .json({ error: "Server Error: " + (err?.message || String(err)) });
  }
}
