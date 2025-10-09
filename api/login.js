// api/login.js
import { pool } from "./db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username/password必須" });

    const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    if (!rows.length) return res.status(404).json({ error: "ユーザーが見つかりません" });

    const user = rows[0];
    if (user.password !== password) return res.status(401).json({ error: "パスワードが違います" });

    res.json({ message: "ログイン成功", role: user.role });
  } catch (e) {
    console.error("login error:", e);
    res.status(500).json({ error: "サーバーエラー" });
  }
}