// /api/login.js
import { query } from "../api-lib/_db.js";

function safeBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { username, password } = safeBody(req);
    if (!username || !password) {
      return res.status(400).json({ error: "username と password は必須です" });
    }

    const r = await query("SELECT id, username, password, role FROM users WHERE username = $1", [username]);
    if (!r.rows.length) return res.status(404).json({ error: "ユーザーが見つかりません" });

    const user = r.rows[0];
    if (user.password !== password) {
      return res.status(401).json({ error: "パスワードが違います" });
    }

    return res.status(200).json({ ok: true, role: user.role, id: user.id, username: user.username });
  } catch (err) {
    console.error("[/api/login] error:", err);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}