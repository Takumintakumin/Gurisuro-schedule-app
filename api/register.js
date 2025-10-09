// api/register.js
import { pool } from "./db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { username, password, role = "user" } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username/password必須" });

    const { rows } = await pool.query("SELECT id FROM users WHERE username=$1", [username]);
    if (rows.length) return res.status(400).json({ error: "このユーザー名は既に存在します" });

    await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1,$2,$3)",
      [username, password, role]
    );

    res.json({ message: "登録成功" });
  } catch (e) {
    console.error("register error:", e);
    res.status(500).json({ error: "サーバーエラー" });
  }
}