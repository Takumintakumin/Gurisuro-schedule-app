// api/users.js
const { getPool } = require("./db.js");
const { readJson, setCors, json, ensureAdmin } = require("./_utils.js");

module.exports = async (req, res) => {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.end();

    // usersテーブル & admin を用意
    await ensureAdmin();

    const pool = getPool();

    if (req.method === "GET") {
      const { rows } = await pool.query("SELECT id, username, role FROM users ORDER BY id ASC");
      return json(res, 200, rows);
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const { username, password, role = "user" } = body || {};
      if (!username || !password) {
        return json(res, 400, { error: "username と password は必須です" });
      }
      await pool.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
        [username, password, role]
      );
      return json(res, 201, { message: "created" });
    }

    if (req.method === "DELETE") {
      // ?id= のクエリ優先、ボディにあればそれでもOK
      const id = req.query?.id || (await readJson(req))?.id;
      if (!id) return json(res, 400, { error: "id が必要です" });
      await pool.query("DELETE FROM users WHERE id = $1", [id]);
      return json(res, 200, { message: "deleted" });
    }

    res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
    return json(res, 405, { error: "Method Not Allowed" });
  } catch (e) {
    console.error("api/users error:", e);
    return json(res, 500, { error: "server error" });
  }
};