// /api/login.js
import { query } from "./_db.js";

export default async function handler(req, res) {
  try {
    // CORS（必要な場合のみ。不要なら削ってOK）
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Vercel の Node 関数は body が string のことがあるので両対応
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body || "{}"); } catch { body = {}; }
    }
    const { username, password } = body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "username と password は必須です" });
    }

    // ここはプレーン比較（ハッシュ未導入前提）
    const sql = `SELECT id, username, password, role FROM users WHERE username = $1 LIMIT 1`;
    const { rows } = await query(sql, [username]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "ユーザーが見つかりません" });
    }

    const user = rows[0];
    if (user.password !== password) {
      return res.status(401).json({ error: "パスワードが違います" });
    }

    // 必要最低限の返却（トークンは後で導入）
    return res.status(200).json({
      message: "ログイン成功",
      role: user.role || "user",
      username: user.username,
      id: user.id,
    });
  } catch (err) {
    console.error("[/api/login] error:", err);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}