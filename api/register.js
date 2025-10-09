// /api/register.js
import { pool } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Vercelではbodyが文字列のことがあるので安全にパース
  let body = {};
  try {
    body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { username, password, role = "user" } = body;
  if (!username || !password) {
    return res.status(400).json({ error: "username と password は必須です" });
  }

  try {
    const sql =
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role";
    const { rows } = await pool.query(sql, [username, password, role]);
    return res.status(201).json({ message: "登録成功", user: rows[0] });
  } catch (e) {
    // 一意制約（既存ユーザー名）: PostgreSQLは 23505
    if (e.code === "23505") {
      return res.status(409).json({ error: "このユーザー名は既に存在します" });
    }
    console.error("[/api/register] ERROR:", e);
    return res.status(500).json({ error: "サーバーエラー（/api/register）" });
  }
}