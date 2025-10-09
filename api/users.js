// /api/users.js
import { pool, ensureTables } from "./db.js";

export default async function handler(req, res) {
  try {
    await ensureTables();

    if (req.method === "GET") {
      const { rows } = await pool.query("select id, username, role from users order by id asc");
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      let body = {};
      try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; } catch {}
      const { username, password, role = "user" } = body;
      if (!username?.trim() || !password?.trim()) {
        return res.status(400).json({ error: "お名前とパスワードは必須です。" });
        }
      await pool.query(
        "insert into users (username, password, role) values ($1,$2,$3)",
        [username.trim(), password.trim(), role]
      );
      return res.status(201).json({ message: "追加しました" });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query?.id);
      if (!id) return res.status(400).json({ error: "id が必要です" });
      await pool.query("delete from users where id=$1", [id]);
      return res.status(200).json({ message: "削除しました" });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    if (e?.code === "23505") {
      return res.status(409).json({ error: "このお名前は既に登録されています。" });
    }
    console.error("[users] error", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}