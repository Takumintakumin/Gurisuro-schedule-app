// /api/login.js
import { pool, ensureSchema } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    await ensureSchema();

    // 500 で HTML が返ってもフロントが落ちないよう JSON 返却を徹底
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: "username と password は必須です" });
      return;
    }

    const { rows } = await pool.query(
      "select id, username, password, role from users where username = $1 limit 1",
      [username]
    );

    const user = rows[0];
    if (!user) {
      res.status(404).json({ error: "ユーザーが見つかりません" });
      return;
    }
    if (user.password !== password) {
      res.status(401).json({ error: "パスワードが違います" });
      return;
    }

    res.status(200).json({ message: "ok", role: user.role, username: user.username });
  } catch (e) {
    console.error("login error:", e);
    res.status(500).json({ error: "サーバーエラー" });
  }
}