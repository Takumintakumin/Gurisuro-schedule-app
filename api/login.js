// /api/login.js
import { pool } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let body = {};
  try {
    body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { username, password } = body;
  if (!username || !password) {
    return res.status(400).json({ error: "username と password は必須です" });
  }

  try {
    // users テーブル: id, username(unique), password, role
    const { rows } = await pool.query(
      "SELECT id, username, password, role FROM users WHERE username = $1 LIMIT 1",
      [username]
    );
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "ユーザーが見つかりません" });
    }

    // まずは平文比較（後で bcrypt 化可能）
    if (user.password !== password) {
      return res.status(401).json({ error: "パスワードが違います" });
    }

    return res.status(200).json({
      message: "ログイン成功",
      role: user.role || "user",
      userId: user.id,
      username: user.username,
    });
  } catch (e) {
    console.error("[/api/login] ERROR:", e);
    return res.status(500).json({ error: "サーバーエラー（/api/login）" });
  }
}