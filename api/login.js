// api/login.js
const { getPool } = require("./db.js");

async function readBody(req) {
  if (req.body) return req.body; // Vercelが既にパースしてくれてる場合
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
    const { username, password } = await readBody(req);
    if (!username || !password) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "usernameとpasswordは必須です" }));
    }

    const pool = getPool();
    // 初回対策: 管理者がいなければ自動シード（競合は無視）
    await pool.query(
      `CREATE TABLE IF NOT EXISTS users(
         id SERIAL PRIMARY KEY,
         username TEXT UNIQUE NOT NULL,
         password TEXT NOT NULL,
         role TEXT DEFAULT 'user'
       )`
    );
    await pool.query(
      `INSERT INTO users(username,password,role)
       VALUES('admin','admin123','admin')
       ON CONFLICT (username) DO NOTHING`
    );

    const r = await pool.query(
      "SELECT id, username, password, role FROM users WHERE username=$1 LIMIT 1",
      [username]
    );
    const user = r.rows[0];
    if (!user) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "ユーザーが見つかりません" }));
    }
    if (user.password !== password) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "パスワードが違います" }));
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "ログイン成功", role: user.role }));
  } catch (e) {
    console.error("api/login error:", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // デバッグ用に詳細も返す（落ち着いたら消してOK）
    res.end(JSON.stringify({ error: "server error", detail: String(e && e.message || e) }));
  }
};