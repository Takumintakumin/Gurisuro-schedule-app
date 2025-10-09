// api/login.js
const { getPool } = require("./db.js");
const { readJson, setCors, json, ensureAdmin } = require("./_utils.js");

module.exports = async (req, res) => {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.end();

    // 管理者を確実に用意（テーブルも）
    await ensureAdmin();

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return json(res, 405, { error: "Method Not Allowed" });
    }

    const { username, password } = await readJson(req);
    if (!username || !password) {
      return json(res, 400, { error: "username と password は必須です" });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT id, username, password, role FROM users WHERE username = $1 LIMIT 1",
      [username]
    );
    if (rows.length === 0) return json(res, 404, { error: "ユーザーが見つかりません" });
    const user = rows[0];

    if (user.password !== password) {
      return json(res, 401, { error: "パスワードが違います" });
    }
    return json(res, 200, { message: "ログイン成功", role: user.role, id: user.id });
  } catch (e) {
    console.error("api/login error:", e);
    return json(res, 500, { error: "server error" });
  }
};