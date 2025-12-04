// /api/api-lib/index.js
import { query, healthcheck } from "./_db.js";
import crypto from "crypto";

// ===== CORS 共通ヘッダ =====
function withCORS(req, res) {
  // 本番URLを明示指定
  res.setHeader("Access-Control-Allow-Origin", "https://gurisuro-schedule-app.vercel.app");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS");
  // 認証付きfetchでcookie/認証情報を許可
  res.setHeader("Access-Control-Allow-Credentials", "true");
  // 必要なヘッダーは網羅
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, X-Requested-With");
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
  if (maxAge) parts.push(`Max-Age=${maxAge}`);
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
  const secure = (req.headers["x-forwarded-proto"] || "http") === "https";
  res.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "Lax",
      secure,
      path: "/",
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

      return res.status(200).json({ message: "OK", role: u.role, username: u.username });
    }

    // ---- /api/me ----
    if (sub === "me") {
      const sess = getSession(req);
      if (!sess) return res.status(401).json({ error: "Not authenticated" });
      return res.status(200).json({ ok: true, ...sess });
    }

    // ---- /api/logout ----
    if (sub === "logout") {
      clearSessionCookie(res, req);
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
        
        // 既存確認（重複チェック）
        const dup = await query("SELECT 1 FROM users WHERE username = $1", [username]);
        if (dup.rows.length > 0) {
          return res.status(409).json({ error: "このユーザー名は既に存在します" });
        }
        
        await query(
          "INSERT INTO users (username, password, role, familiar) VALUES ($1,$2,$3,$4)",
          [username, password, role, familiar]
        );
        return res.status(201).json({ ok: true });
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

      // W=60: 直近60日間の履歴を使用
      const W_DAYS = 60;

      // 1. イベントの日付を取得
      const eventResult = await query(
        `SELECT COALESCE(event_date, NULLIF(date, '')::date) AS event_date, date AS date_text
         FROM events WHERE id = $1`,
        [eventId]
      );
      if (!eventResult.rows || eventResult.rows.length === 0) {
        return res.status(404).json({ error: "イベントが見つかりません" });
      }
      const eventDate = eventResult.rows[0].event_date || eventResult.rows[0].date_text;
      if (!eventDate) {
        return res.status(400).json({ error: "イベントの日付が取得できません" });
      }

      // 日付をDateオブジェクトに変換（UTC基準で扱う）
      // eventDateが既にDateオブジェクトの場合はそのまま使用、文字列の場合は変換
      let eventDateStr = eventDate;
      if (eventDate instanceof Date) {
        eventDateStr = eventDate.toISOString().split('T')[0];
      } else if (typeof eventDate === 'string') {
        // 既にYYYY-MM-DD形式の場合はそのまま使用
        eventDateStr = eventDate.split('T')[0];
      } else {
        return res.status(400).json({ error: "イベントの日付の形式が不正です" });
      }
      
      const eventDateObj = new Date(eventDateStr + "T00:00:00Z");
      if (isNaN(eventDateObj.getTime())) {
        return res.status(400).json({ error: `イベントの日付が無効です: ${eventDateStr}` });
      }
      
      const windowStartDate = new Date(eventDateObj);
      windowStartDate.setUTCDate(windowStartDate.getUTCDate() - W_DAYS);
      
      if (isNaN(windowStartDate.getTime())) {
        return res.status(400).json({ error: "ウィンドウ開始日の計算に失敗しました" });
      }

      // 2. 応募者リストを取得
      const applicantsResult = await query(
        `SELECT a.id, a.username, a.kind, a.created_at
          FROM applications a
          WHERE a.event_id = $1
         ORDER BY a.kind, a.created_at ASC`,
        [eventId]
      );

      if (!applicantsResult.rows || applicantsResult.rows.length === 0) {
        return res.status(200).json({ event_id: Number(eventId), driver: [], attendant: [] });
      }

      // 3. 各応募者の直近60日間の確定履歴を取得（イベント日付より前のみ）
      // decided_atがNULLの場合はevent_dateを使用（後方互換性のため）
      // まず、decided_atがNULLの既存データを更新（一度だけ実行される想定）
      try {
        await query(
          `UPDATE selections s
           SET decided_at = COALESCE(s.decided_at, 
               (SELECT COALESCE(e.event_date, NULLIF(e.date, '')::date)::timestamp 
                FROM events e WHERE e.id = s.event_id))
           WHERE s.decided_at IS NULL`
        );
      } catch (e) {
        // 更新エラーは無視（既に更新済みの可能性がある）
        console.log('[fairness] decided_at update skipped:', e.message);
      }
      
      // デバッグ用：応募者リストをログ出力
      const applicantUsernames = applicantsResult.rows.map(r => r.username);
      console.log(`[fairness] event_id: ${eventId}, eventDate: ${eventDateStr}, windowStart: ${windowStartDate.toISOString().split('T')[0]}`);
      console.log(`[fairness] applicants:`, applicantUsernames);
      
      // まず、全応募者のselectionsデータを確認（デバッグ用）
      const allSelectionsCheck = await query(
        `SELECT s.username, s.kind, s.decided_at, e.event_date, e.date AS date_text,
                COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS effective_date
         FROM selections s
         JOIN events e ON e.id = s.event_id
         WHERE s.username = ANY($1::text[])
         ORDER BY s.username, COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) DESC`,
        [applicantUsernames]
      );
      console.log(`[fairness] all selections for applicants (before date filter):`, allSelectionsCheck.rows.length);
      if (allSelectionsCheck.rows.length > 0) {
        console.log(`[fairness] sample selection:`, JSON.stringify(allSelectionsCheck.rows[0], null, 2));
      }
      
      const historyResult = await query(
        `SELECT s.username, s.kind, e.event_date, e.date AS date_text, s.decided_at,
                COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS effective_date
         FROM selections s
         JOIN events e ON e.id = s.event_id
         WHERE s.username = ANY($1::text[])
           AND COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) < $2::date
           AND COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) >= $3::date
         ORDER BY s.username, COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) DESC`,
        [
          applicantUsernames,
          eventDateStr,
          windowStartDate.toISOString().split('T')[0]
        ]
      );
      
      // デバッグ用：取得した履歴数をログ出力
      console.log(`[fairness] historyCount (within 60 days): ${historyResult.rows.length}`);
      if (historyResult.rows.length > 0) {
        console.log(`[fairness] sample history row:`, JSON.stringify(historyResult.rows[0], null, 2));
      }

      // 4. 各応募者の最終確定日を取得（全期間、イベント日付より前のみ）
      // decided_atがNULLの場合はevent_dateを使用（後方互換性のため）
      const lastDecidedResult = await query(
        `SELECT s.username, MAX(COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date))) AS last_date
         FROM selections s
         JOIN events e ON e.id = s.event_id
         WHERE s.username = ANY($1::text[])
           AND COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) < $2::date
         GROUP BY s.username`,
        [
          applicantsResult.rows.map(r => r.username),
          eventDateStr
        ]
      );

      // 5. 特徴量を計算
      const historyByUser = {};
      for (const row of historyResult.rows) {
        const username = row.username;
        if (!historyByUser[username]) {
          historyByUser[username] = { driver: [], attendant: [] };
        }
        historyByUser[username][row.kind].push(row);
      }
      
      // デバッグ用：各ユーザーの履歴数をログ出力
      const debugHistory = {};
      for (const username in historyByUser) {
        debugHistory[username] = {
          driver: historyByUser[username].driver.length,
          attendant: historyByUser[username].attendant.length,
          total: historyByUser[username].driver.length + historyByUser[username].attendant.length
        };
      }
      console.log(`[fairness] historyByUser:`, JSON.stringify(debugHistory, null, 2));

      const lastDecidedByUser = {};
      for (const row of lastDecidedResult.rows) {
        if (row.last_date) {
          const lastDateStr = typeof row.last_date === 'string' ? row.last_date.split('T')[0] : row.last_date;
          const lastDateObj = new Date(lastDateStr + "T00:00:00Z");
          if (!isNaN(lastDateObj.getTime())) {
            lastDecidedByUser[row.username] = lastDateObj;
          }
        }
      }

      // 6. 各応募者に特徴量とスコアを付与
      const candidates = [];
      for (const app of applicantsResult.rows) {
        const username = app.username;
        const kind = app.kind;
        const history = historyByUser[username] || { driver: [], attendant: [] };
        
        // count60: 直近60日で確定した回数（driver+attendant合算）
        const count60 = (history.driver || []).length + (history.attendant || []).length;
        
        // roleCount60: 直近60日でその役割で確定した回数
        const roleCount60 = (history[kind] || []).length;
        
        // gapDays: 最後に確定した日からの経過日数（経験なしは9999）
        let gapDays = 9999;
        if (lastDecidedByUser[username]) {
          try {
            const daysDiff = Math.floor((eventDateObj - lastDecidedByUser[username]) / (1000 * 60 * 60 * 24));
            gapDays = Math.max(0, daysDiff);
          } catch (e) {
            console.error(`[fairness] Error calculating gapDays for ${username}:`, e);
            gapDays = 9999;
          }
        }
        
        // スコア計算
        const score = 10 * count60 + 3 * roleCount60 - gapDays;
        
        candidates.push({
          username,
          kind,
          applied_at: app.created_at,
          count60,
          roleCount60,
          gapDays,
          score,
        });
      }

      // 7. 役割ごとにソート（スコア最小、同点時は優先順位に従う）
      const compareCandidates = (a, b) => {
        // 1. スコアが小さい順
        if (a.score !== b.score) return a.score - b.score;
        // 2. roleCount60が少ない順
        if (a.roleCount60 !== b.roleCount60) return a.roleCount60 - b.roleCount60;
        // 3. count60が少ない順
        if (a.count60 !== b.count60) return a.count60 - b.count60;
        // 4. gapDaysが大きい順（最後に確定してから長い順）
        if (a.gapDays !== b.gapDays) return b.gapDays - a.gapDays;
        // 5. 五十音順（usernameで比較）
        return a.username.localeCompare(b.username, 'ja');
      };

      const driver = [];
      const attendant = [];
      let driverRank = 1;
      let attendantRank = 1;

      // 役割ごとにソート
      const driverCandidates = candidates.filter(c => c.kind === 'driver').sort(compareCandidates);
      const attendantCandidates = candidates.filter(c => c.kind === 'attendant').sort(compareCandidates);

      for (const cand of driverCandidates) {
        driver.push({
          username: cand.username,
          kind: 'driver',
          times: cand.count60, // 互換性のため
          last_at: lastDecidedByUser[cand.username] ? lastDecidedByUser[cand.username].toISOString() : null,
          applied_at: cand.applied_at,
          rank: driverRank++,
          // デバッグ用（必要に応じて）
          count60: cand.count60,
          roleCount60: cand.roleCount60,
          gapDays: cand.gapDays,
          score: cand.score,
        });
      }

      for (const cand of attendantCandidates) {
        attendant.push({
          username: cand.username,
          kind: 'attendant',
          times: cand.count60, // 互換性のため
          last_at: lastDecidedByUser[cand.username] ? lastDecidedByUser[cand.username].toISOString() : null,
          applied_at: cand.applied_at,
          rank: attendantRank++,
          // デバッグ用（必要に応じて）
          count60: cand.count60,
          roleCount60: cand.roleCount60,
          gapDays: cand.gapDays,
          score: cand.score,
        });
      }

      const response = { event_id: Number(eventId), driver, attendant };
      
      // デバッグ用：レスポンスの最初の要素をログ出力
      if (driver.length > 0) {
        console.log(`[fairness] first driver response:`, JSON.stringify(driver[0], null, 2));
      }
      if (attendant.length > 0) {
        console.log(`[fairness] first attendant response:`, JSON.stringify(attendant[0], null, 2));
      }
      
      return res.status(200).json(response);
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

        // 定員チェック（存在すれば）
        let capD = null, capA = null;
        try {
          const er = await query(
            `SELECT capacity_driver, capacity_attendant FROM events WHERE id = $1`,
            [eventId]
          );
          if (er.rows?.[0]) {
            capD = er.rows[0].capacity_driver != null ? Number(er.rows[0].capacity_driver) : null;
            capA = er.rows[0].capacity_attendant != null ? Number(er.rows[0].capacity_attendant) : null;
          }
        } catch {}

        if (capD != null && driver.length > capD) {
          return res.status(400).json({ error: `運転手の選出が定員(${capD})を超えています` });
        }
        if (capA != null && attendant.length > capA) {
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
          const tuples = values.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, now())`).join(",");
          await query(
            `INSERT INTO selections (event_id, username, kind, decided_at) VALUES ${tuples}
             ON CONFLICT (event_id, username, kind) DO UPDATE SET decided_at = now()`,
            params
          );
        }
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // ---- その他 404 ----
    return res.status(404).json({ error: "Not Found" });
  } catch (err) {
    console.error("[/api/api-lib/index] Error:", err);
    // 重複キーエラーの場合、適切なエラーメッセージを返す
    if (String(err?.message || "").includes("duplicate key") || String(err?.message || "").includes("users_username_key")) {
      return res.status(409).json({ error: "このユーザー名は既に存在します" });
    }
    return res
      .status(500)
      .json({ error: "Server Error: " + (err?.message || String(err)) });
  }
}