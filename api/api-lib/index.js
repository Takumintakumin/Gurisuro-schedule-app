// /api/api-lib/index.js
import { query, healthcheck } from "./_db.js";

/** ---- CORS ---- */
function withCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/** ---- JSON body（非JSONでも落ちない） ---- */
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

/** ---- ルーティング判定（/api/index.js?path=xxx に対応） ---- */
function resolveRoute(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = url.searchParams;
  const trim = (s) => (s || "").replace(/^\/+|\/+$/g, "");

  let sub = trim(q.get("path"));

  if (!sub) {
    const forwarded =
      req.headers["x-forwarded-uri"] ||
      req.headers["x-invoke-path"] ||
      req.headers["x-vercel-path"] ||
      "";
    if (typeof forwarded === "string" && forwarded) {
      const p = trim(forwarded);
      sub = p.startsWith("api/") ? trim(p.slice(4)) : p;
    } else {
      const p = trim(url.pathname);
      sub = p.startsWith("api/") ? trim(p.slice(4)) : p;
      if (sub.includes("index.js")) sub = trim(q.get("path"));
    }
  }
  return { url, q, sub };
}

export default async function handler(req, res) {
  try {
    withCORS(res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const { q, sub } = resolveRoute(req);
    const body = await parseJSONBody(req);

    /* ------------------------- /api/health ------------------------- */
    if (sub === "health") {
      const dbOK = await healthcheck().catch(() => 0);
      return res.status(200).json({ ok: true, db: dbOK ? 1 : 0 });
    }

    /* ------------------------- /api/login -------------------------- */
    if (sub === "login") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
      const { username, password } = body || {};
      if (!username || !password)
        return res.status(400).json({ error: "username と password が必要です" });

      const r = await query(
        "SELECT id, username, password, role FROM users WHERE username = $1 LIMIT 1",
        [username]
      );
      const u = r.rows?.[0];
      if (!u) return res.status(404).json({ error: "ユーザーが見つかりません" });
      if (u.password !== password) return res.status(401).json({ error: "パスワードが違います" });
      return res.status(200).json({ message: "OK", role: u.role, username: u.username });
    }

    /* ------------------------- /api/register ----------------------- */
    if (sub === "register") {
      if (req.method !== "POST")
        return res.status(405).json({ error: "Method Not Allowed" });

      const { username, password, role = "user", familiarity, familiar } = body || {};
      if (!username || !password)
        return res.status(400).json({ error: "username と password が必要です" });

      // 双方どちらでも受け取れるようにする
      const raw = String(familiar ?? familiarity ?? "unfamiliar").toLowerCase();
      const fam =
        raw === "familiar"
          ? "familiar"
          : raw === "unfamiliar"
          ? "unfamiliar"
          : null;

      try {
        await query(
          "INSERT INTO users (username, password, role, familiar) VALUES ($1,$2,$3,$4)",
          [username, password, role, fam]
        );
        return res.status(201).json({ ok: true });
      } catch (e) {
        if (String(e?.message || "").includes("duplicate key"))
          return res.status(409).json({ error: "このユーザー名は既に存在します" });
        throw e;
      }
    }

    /* -------------------------- /api/users ------------------------- */
    if (sub === "users") {
      // GET
      if (req.method === "GET") {
        const r = await query(
          "SELECT id, username, role, familiar FROM users ORDER BY id ASC"
        );
        return res.status(200).json(r.rows);
      }

      // POST（管理者追加）
      if (req.method === "POST") {
        const { username, password, role = "user", familiarity, familiar } = body || {};
        if (!username || !password)
          return res.status(400).json({ error: "必須項目不足" });

        const raw = String(familiar ?? familiarity ?? "unfamiliar").toLowerCase();
        const fam =
          raw === "familiar"
            ? "familiar"
            : raw === "unfamiliar"
            ? "unfamiliar"
            : null;

        await query(
          "INSERT INTO users (username, password, role, familiar) VALUES ($1,$2,$3,$4)",
          [username, password, role, fam]
        );
        return res.status(201).json({ ok: true });
      }

      // PATCH（既存ユーザーのfamiliar更新）
      if (req.method === "PATCH") {
        const { username, familiarity, familiar } = body || {};
        if (!username) return res.status(400).json({ error: "username が必要です" });

        const raw = String(familiar ?? familiarity ?? "").toLowerCase();
        const fam =
          raw === "familiar"
            ? "familiar"
            : raw === "unfamiliar"
            ? "unfamiliar"
            : null;

        await query("UPDATE users SET familiar = $2 WHERE username = $1", [
          username,
          fam,
        ]);
        return res.status(200).json({ ok: true });
      }

      // DELETE
      if (req.method === "DELETE") {
        const id = q.get("id");
        if (!id) return res.status(400).json({ error: "id が必要です" });
        await query("DELETE FROM users WHERE id = $1", [id]);
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: "Method Not Allowed" });
    }

    /* -------------------------- /api/events ------------------------ */
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

    /* ---------------------- /api/applications ---------------------- */
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
        return res.status(400).json({ error: "event_id または username を指定してください" });
      }

      if (req.method === "POST") {
        const { event_id, username, kind } = body || {};
        if (!event_id || !username || !kind)
          return res.status(400).json({ error: "event_id, username, kind が必要です" });

        await query(
          `INSERT INTO applications (event_id, username, kind)
           VALUES ($1,$2,$3)
           ON CONFLICT (event_id, username, kind) DO NOTHING`,
          [event_id, username, kind]
        );
        return res.status(201).json({ ok: true });
      }

      if (req.method === "DELETE") {
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

        return res.status(400).json({
          error: "id または (event_id, username, kind) を指定してください",
        });
      }

      return res.status(405).json({ error: "Method Not Allowed" });
    }

    /* ----------------------------- 404 ----------------------------- */
    return res.status(404).json({ error: "Not Found" });
  } catch (err) {
    console.error("[/api/api-lib/index] Error:", err);
    return res.status(500).json({ error: "Server Error: " + (err?.message || String(err)) });
  }
}