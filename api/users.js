// /api/users.js
import { pool } from "./_db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { rows } = await pool.query(
        "SELECT id, username, role FROM users ORDER BY id ASC"
      );
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
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
        return res.status(400).json({ error: "username/password は必須です" });
      }

      try {
        const { rows } = await pool.query(
          "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role",
          [username, password, role]
        );
        return res.status(201).json({ message: "登録成功", user: rows[0] });
      } catch (e) {
        if (e.code === "23505") {
          return res.status(409).json({ error: "このユーザー名は既に存在します" });
        }
        throw e;
      }
    }

    if (req.method === "DELETE") {
      const id = req.query?.id || new URL(req.url, `http://${req.headers.host}`).searchParams.get("id");
      if (!id) return res.status(400).json({ error: "id は必須です" });
      await pool.query("DELETE FROM users WHERE id = $1", [id]);
      return res.status(200).json({ message: "削除しました" });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("[/api/users] ERROR:", e);
    return res.status(500).json({ error: "サーバーエラー（/api/users）" });
  }
}