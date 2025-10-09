// api/users.js
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon
});

// 500時にHTMLが返らないよう必ずJSONで返す
function sendErr(res, code, msg) {
  return res.status(code).json({ error: msg });
}

export default async function handler(req, res) {
  try {
    if (!process.env.DATABASE_URL) {
      return sendErr(res, 500, "Missing DATABASE_URL");
    }

    if (req.method === "GET") {
      const { rows } = await pool.query("SELECT id, username, role FROM users ORDER BY id ASC");
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const { username, password, role = "user" } = req.body || {};
      if (!username || !password) return sendErr(res, 400, "username と password は必須です");

      try {
        await pool.query(
          "INSERT INTO users (username, password, role) VALUES ($1,$2,$3)",
          [username, password, role]
        );
        return res.status(200).json({ message: "ok" });
      } catch (e) {
        const m = String(e?.message || "");
        if (m.includes("duplicate key") || m.includes("already exists")) {
          return sendErr(res, 409, "そのユーザー名は既に存在します");
        }
        console.error("users POST error:", e);
        return sendErr(res, 500, m);
      }
    }

    res.setHeader("Allow", "GET,POST");
    return sendErr(res, 405, "Method Not Allowed");
  } catch (e) {
    console.error("users api error:", e);
    return sendErr(res, 500, e?.message || "Server Error");
  }
}