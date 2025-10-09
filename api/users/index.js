// /api/users/index.js
import { pool } from "../db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { rows } = await pool.query(
        "SELECT id, username, role FROM users ORDER BY id ASC"
      );
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      // Vercel の場合 body が文字列のことがあるので保険
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const { username, password, role = "user" } = body;

      if (!username || !password) {
        return res.status(400).json({ error: "username と password は必須です" });
      }

      // ここでは簡易のため平文保存（後で bcrypt へ差し替え推奨）
      await pool.query(
        "INSERT INTO users (username, password, role) VALUES ($1,$2,$3)",
        [username, password, role]
      );

      return res.status(200).json({ message: "ユーザーを追加しました" });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    // UNIQUE 制約違反などのメッセージをそのまま返すのは避け、ざっくり返す
    console.error("USERS_INDEX_ERROR:", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}