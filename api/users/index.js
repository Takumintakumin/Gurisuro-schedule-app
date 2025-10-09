// /api/users/index.js
import { pool } from "../_db";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const q = await pool.query("SELECT id, username, role FROM users ORDER BY id ASC");
      res.status(200).json(q.rows);
    } catch (e) {
      console.error("[GET /api/users] ", e);
      res.status(500).json({ error: "ユーザー一覧の取得に失敗しました" });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { username, password, role = "user" } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: "username と password は必須です" });
      }
      const sql = `
        INSERT INTO users (username, password, role)
        VALUES ($1, $2, $3)
        RETURNING id, username, role
      `;
      const r = await pool.query(sql, [username, password, role]);
      res.status(201).json(r.rows[0]);
    } catch (e) {
      console.error("[POST /api/users] ", e);
      // UNIQUE制約違反など
      const msg = e?.code === "23505" ? "このユーザー名は既に存在します" : "ユーザー登録に失敗しました";
      res.status(500).json({ error: msg });
    }
    return;
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end("Method Not Allowed");
}