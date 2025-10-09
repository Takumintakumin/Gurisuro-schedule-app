// api/users.js
import { getPool } from "./db.js";

export default async function handler(req, res) {
  const pool = getPool();

  try {
    if (req.method === "GET") {
      const { rows } = await pool.query(
        "SELECT id, username, role FROM users ORDER BY id ASC"
      );
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const { username, password, role = "user" } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: "username と password は必須です" });
      }
      await pool.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
        [username, password, role]
      );
      return res.status(201).json({ message: "created" });
    }

    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "id が必要です" });
      await pool.query("DELETE FROM users WHERE id = $1", [id]);
      return res.status(200).json({ message: "deleted" });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("users api error:", e);
    return res.status(500).json({ error: "server error" });
  }
}