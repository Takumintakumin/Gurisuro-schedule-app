// /api/register.js
import { pool, ensureSchema } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    await ensureSchema();
    const { username, password, role = "user" } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: "username と password は必須です" });
      return;
    }

    await pool.query(
      `insert into users (username, password, role)
       values ($1, $2, $3)
       on conflict (username) do nothing`,
      [username, password, role]
    );

    // 既に存在していたかもしれないので改めて取得
    const { rows } = await pool.query(
      "select id, username, role from users where username = $1 limit 1",
      [username]
    );

    if (!rows[0]) {
      res.status(500).json({ error: "登録に失敗しました" });
      return;
    }

    res.status(200).json({ message: "ok", user: rows[0] });
  } catch (e) {
    console.error("register error:", e);
    res.status(500).json({ error: "サーバーエラー" });
  }
}