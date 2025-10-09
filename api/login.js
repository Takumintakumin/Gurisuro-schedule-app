// /api/login.js
import { pool } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { username, password } = body;
    if (!username || !password) return res.status(400).json({ error: "username と password は必須です" });

    const { rows } = await pool.query(
      "SELECT id, username, password, role FROM users WHERE username = $1 LIMIT 1",
      [username]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "ユーザーが見つかりません" });
    if (user.password !== password) return res.status(401).json({ error: "パスワードが違います" });

    res.status(200).json({ message: "ログイン成功", role: user.role, id: user.id, username: user.username });
  } catch (e) {
    console.error("LOGIN_ERROR:", e);
    res.status(500).json({ error: "サーバーエラー" });
  }
}