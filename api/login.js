// /api/login.js
import { pool, ensureTables } from "./_db.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    await ensureTables();

    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch {
      body = {};
    }

    const { username, password } = body;
    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "お名前とパスワードは必須です。" });
    }

    const { rows } = await pool.query(
      "select id, username, password, role from users where username=$1",
      [username.trim()]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "ユーザーが見つかりません" });
    if (user.password !== password.trim()) {
      return res.status(401).json({ error: "パスワードが違います" });
    }

    return res.status(200).json({ message: "OK", role: user.role, username: user.username });
  } catch (e) {
    console.error("[login] error", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}