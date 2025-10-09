// api/users.js
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon
});

export default async function handler(req, res) {
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
      try {
        await pool.query(
          "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
          [username, password, role]
        );
        return res.status(200).json({ message: "ok" });
      } catch (e) {
        if ((e?.message || "").includes("duplicate key")) {
          return res.status(409).json({ error: "そのユーザー名は既に存在します" });
        }
        throw e;
      }
    }

    res.setHeader("Allow", "GET,POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("users api error:", e);
    return res.status(500).json({ error: "Server Error" });
  }
}