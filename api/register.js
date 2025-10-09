// /api/register.js
import { pool, ensureTables } from "./db.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    await ensureTables();

    // Vercelの500時はHTMLが返ることがあるため、安全にパース
    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch {
      body = {};
    }

    const { username, password } = body;
    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "お名前とパスワードは必須です。" });
    }

    await pool.query(
      "insert into users (username, password, role) values ($1,$2,$3)",
      [username.trim(), password.trim(), "user"]
    );

    return res.status(201).json({ message: "登録成功" });
  } catch (e) {
    // 重複ユーザー名
    if (e?.code === "23505") {
      return res.status(409).json({ error: "このお名前は既に登録されています。" });
    }
    console.error("[register] error", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}