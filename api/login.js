// api/login.js
const { getPool } = require("./db.js");

async function readBody(req) {
  if (req.body) return req.body; // 既にパース済みのケース
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }

  try {
    const body = await readBody(req);
    const { username, password } = body || {};
    if (!username || !password) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "usernameとpasswordは必須です" }));
    }

    const pool = getPool();

    // 初回に備えてテーブル＆管理者を用意
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user'
      )
    `);
    await pool.query(`
      INSERT INTO users(username,password,role)
      VALUES('admin','admin123','admin')
      ON CONFLICT (username) DO NOTHING
    `);

    const r = await pool.query(
      "SELECT id, username, password, role FROM users WHERE username=$1 LIMIT 1",
      [username]
    );
    const user = r.rows[0];
    if (!user) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "ユーザーが見つかりません" }));
    }
    if (user.password !== password) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "パスワードが違います" }));
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "ログイン成功", role: user.role }));
  } catch (e) {
    console.error("api/login error:", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "server error", detail: String(e && e.message || e) }));
  }
};