// /api/users/index.js
import { pool } from "../_db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { rows } = await pool.query("SELECT id, username, role FROM users ORDER BY id ASC");
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const { username, password, role = "user" } = body;
      if (!username || !password) return res.status(400).json({ error: "username と password は必須です" });

      await pool.query("INSERT INTO users (username, password, role) VALUES ($1,$2,$3)", [
        username,
        password,
        role,
      ]);
      return res.status(200).json({ message: "ユーザー登録完了" });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("USERS_INDEX_ERROR:", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}