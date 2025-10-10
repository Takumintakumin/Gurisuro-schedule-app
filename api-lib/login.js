// /api/api-lib/login.js
import { query } from "./_db.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    // Vercel で body が文字列/undefined の両方に耐える
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body || "{}"); } catch { body = {}; }
    }
    if (!body || (!body.username && !body.password)) {
      // まれに Readable の場合があるので読み切る
      try {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        const raw = Buffer.concat(buffers).toString("utf8");
        if (raw && !body) body = JSON.parse(raw);
      } catch {}
    }

    const username = (body?.username || "").trim();
    const password = (body?.password || "").trim();
    if (!username || !password) {
      return res.status(400).json({ error: "username と password は必須です" });
    }

    const r = await query(
      "SELECT id, username, role FROM users WHERE username=$1 AND password=$2 LIMIT 1",
      [username, password]
    );

    if (r.rows.length === 0) {
      return res.status(401).json({ error: "ユーザーが見つかりません" });
    }

    const user = r.rows[0];
    return res.status(200).json({ ok: true, role: user.role, username: user.username });
  } catch (err) {
    console.error("[/api/login] Error:", err);
    return res.status(500).json({ error: "Server Error: " + err.message });
  }
}