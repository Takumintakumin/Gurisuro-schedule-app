// api/_utils.js
const { StringDecoder } = require("string_decoder");
const { getPool } = require("./_db.js");

// ---- JSON Body 読み取り（Vercel Node Functions は自動でパースされないことがある）----
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body; // 既にパース済みならそのまま
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let data = "";
    req.on("data", (chunk) => (data += decoder.write(chunk)));
    req.on("end", () => {
      try {
        decoder.end();
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// ---- CORS（必要ならドメイン制限に変更可）----
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---- 便利レスポンス ----
function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

// ---- 管理者の自動シード（毎回軽くチェック）----
async function ensureAdmin() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user'
    )
  `);
  const r = await pool.query("SELECT 1 FROM users WHERE username = $1 LIMIT 1", ["admin"]);
  if (r.rowCount === 0) {
    await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
      ["admin", "admin123", "admin"]
    );
    console.log("Seeded admin user: admin / admin123");
  }
}

// ---- eventsテーブルも存在保証 ----
async function ensureEventsTable() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      label TEXT,
      icon TEXT,
      start_time TEXT,
      end_time TEXT
    )
  `);
}

module.exports = {
  readJson,
  setCors,
  json,
  ensureAdmin,
  ensureEventsTable,
};