// api/index.js  ← 新規作成（Vercel Serverless Function）
import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import serverless from "serverless-http";

dotenv.config();

const { Pool } = pkg;
const app = express();

// 同一ドメインで呼ぶので CORS は基本不要ですが、ローカル併用のために許可しておきます
app.use(cors());
app.use(express.json());

// ===== Postgres(Neon) 接続 =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ===== 初期化（テーブル作成＆管理者シード） =====
let _initDone = false;
async function initOnce() {
  if (_initDone) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user'
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        label TEXT,
        icon TEXT,
        start_time TEXT,
        end_time TEXT
      );
    `);
    await client.query(`
      INSERT INTO users (username, password, role)
      VALUES ('admin', 'admin123', 'admin')
      ON CONFLICT (username) DO NOTHING;
    `);
    _initDone = true;
    console.log("✅ DB initialized & admin seeded");
  } finally {
    client.release();
  }
}

// ヘルスチェック
app.get("/api/health", async (_req, res) => {
  try {
    await initOnce();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ===== 認証系 =====
app.post("/api/register", async (req, res) => {
  try {
    await initOnce();
    const { username, password, role = "user" } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username と password は必須です" });
    }
    const exists = await pool.query("SELECT 1 FROM users WHERE username=$1", [username]);
    if (exists.rowCount > 0) {
      return res.status(400).json({ error: "このユーザー名は既に存在します" });
    }
    await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
      [username, password, role]
    );
    res.json({ message: "登録成功" });
  } catch (err) {
    console.error("登録エラー:", err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    await initOnce();
    const { username, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "ユーザーが見つかりません" });
    if (user.password !== password)
      return res.status(401).json({ error: "パスワードが違います" });
    res.json({ message: "ログイン成功", role: user.role });
  } catch (err) {
    console.error("ログインエラー:", err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// ===== イベント系 =====
app.post("/api/events", async (req, res) => {
  try {
    await initOnce();
    const { date, label, icon, start_time, end_time } = req.body;
    if (!date || !label) {
      return res.status(400).json({ error: "date と label は必須です" });
    }
    await pool.query(
      "INSERT INTO events (date, label, icon, start_time, end_time) VALUES ($1, $2, $3, $4, $5)",
      [date, label, icon, start_time || null, end_time || null]
    );
    res.json({ message: "イベント登録完了" });
  } catch (err) {
    console.error("イベント登録エラー:", err);
    res.status(500).json({ error: "イベント登録エラー" });
  }
});

app.get("/api/events", async (_req, res) => {
  try {
    await initOnce();
    const rows = await pool.query("SELECT * FROM events ORDER BY date ASC, id ASC");
    res.json(rows.rows);
  } catch (err) {
    console.error("イベント一覧取得エラー:", err);
    res.status(500).json({ error: "イベント一覧エラー" });
  }
});

// ===== 管理用（任意） =====
app.get("/api/users", async (_req, res) => {
  try {
    await initOnce();
    const rows = await pool.query("SELECT id, username, role FROM users ORDER BY id ASC");
    res.json(rows.rows);
  } catch (err) {
    console.error("ユーザー一覧エラー:", err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// ・・・前半（imports, app, pool, initOnce など既存はそのまま）・・・

/** イベント作成（管理者） */
app.post("/api/events", async (req, res) => {
  try {
    await initOnce();
    const {
      date, label, icon,
      start_time, end_time,
      capacity_driver = 1,
      capacity_attendant = 1,
      is_published = true,
    } = req.body;

    if (!date || !label) return res.status(400).json({ error: "date と label は必須です" });

    const q = `
      INSERT INTO events (date, label, icon, start_time, end_time, capacity_driver, capacity_attendant, is_published)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [date, label, icon || null, start_time || null, end_time || null,
      capacity_driver, capacity_attendant, is_published]);
    res.json(rows[0]);
  } catch (err) {
    console.error("イベント登録エラー:", err);
    res.status(500).json({ error: "イベント登録エラー" });
  }
});

/** イベント一覧（集計つき） */
app.get("/api/events", async (_req, res) => {
  try {
    await initOnce();
    const q = `
      SELECT
        e.*,
        COALESCE(d.driver_count,0) AS driver_count,
        COALESCE(a.attendant_count,0) AS attendant_count
      FROM events e
      LEFT JOIN (
        SELECT event_id, COUNT(*) AS driver_count
        FROM event_enrollments
        WHERE role='driver'
        GROUP BY event_id
      ) d ON d.event_id = e.id
      LEFT JOIN (
        SELECT event_id, COUNT(*) AS attendant_count
        FROM event_enrollments
        WHERE role='attendant'
        GROUP BY event_id
      ) a ON a.event_id = e.id
      ORDER BY e.date ASC, e.id ASC;
    `;
    const { rows } = await pool.query(q);
    res.json(rows);
  } catch (err) {
    console.error("イベント一覧取得エラー:", err);
    res.status(500).json({ error: "イベント一覧エラー" });
  }
});

/** 募集公開/非公開切替（管理者） */
app.patch("/api/events/:id/publish", async (req, res) => {
  try {
    await initOnce();
    const { id } = req.params;
    const { is_published } = req.body;
    const { rows } = await pool.query(
      `UPDATE events SET is_published=$1 WHERE id=$2 RETURNING *;`,
      [!!is_published, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("publish切替エラー:", err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

/** 応募（ユーザー） */
app.post("/api/events/:id/enroll", async (req, res) => {
  try {
    await initOnce();
    const { id } = req.params;
    const { username, role, note } = req.body; // role: 'driver' | 'attendant'
    if (!username || !role) return res.status(400).json({ error: "username と role は必須" });

    // イベント取得＋枠確認
    const { rows: erows } = await pool.query(
      `SELECT * FROM events WHERE id=$1 AND is_published=TRUE`, [id]
    );
    const ev = erows[0];
    if (!ev) return res.status(404).json({ error: "募集が見つかりません" });

    // 現在の応募数
    const countSql = `
      SELECT
        SUM(CASE WHEN role='driver' THEN 1 ELSE 0 END) AS driver_count,
        SUM(CASE WHEN role='attendant' THEN 1 ELSE 0 END) AS attendant_count
      FROM event_enrollments WHERE event_id=$1
    `;
    const { rows: counts } = await pool.query(countSql, [id]);
    const driverCount = Number(counts[0].driver_count) || 0;
    const attCount    = Number(counts[0].attendant_count) || 0;

    if (role === "driver" && driverCount >= ev.capacity_driver)
      return res.status(409).json({ error: "運転手の募集枠は満員です" });
    if (role === "attendant" && attCount >= ev.capacity_attendant)
      return res.status(409).json({ error: "添乗員の募集枠は満員です" });

    // 重複応募防止 (UNIQUE 制約にも守られる)
    await pool.query(
      `INSERT INTO event_enrollments (event_id, username, role, note) VALUES ($1,$2,$3,$4)`,
      [id, username, role, note || null]
    );

    res.json({ message: "応募を受け付けました" });
  } catch (err) {
    if (String(err).includes("duplicate key")) {
      return res.status(409).json({ error: "すでに応募済みです" });
    }
    console.error("応募エラー:", err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

/** 応募取り消し（ユーザー） */
app.delete("/api/events/:id/enroll", async (req, res) => {
  try {
    await initOnce();
    const { id } = req.params;
    const { username, role } = req.body;
    await pool.query(
      `DELETE FROM event_enrollments WHERE event_id=$1 AND username=$2 AND role=$3`,
      [id, username, role]
    );
    res.json({ message: "キャンセルしました" });
  } catch (err) {
    console.error("キャンセルエラー:", err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// Serverless Functions へエクスポート
export default serverless(app);