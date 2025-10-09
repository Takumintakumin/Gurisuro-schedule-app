// /api/users/index.js
import { query } from "../_db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method === "GET") {
      const { rows } = await query(
        "SELECT id, username, role FROM users ORDER BY id ASC"
      );
      return res.status(200).json(rows);
    }
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body||"{}"); } catch { body = {}; } }
      const { username, password, role = "user" } = body || {};
      if (!username || !password) return res.status(400).json({ error: "usernameとpasswordは必須" });

      await query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
        [username, password, role]
      );
      return res.status(201).json({ ok: true });
    }
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("[/api/users] error:", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}