// api/health.js
const { getPool } = require("./db.js");

module.exports = async (req, res) => {
  try {
    const pool = getPool();
    const r = await pool.query("SELECT now()");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: true,
      now: r.rows?.[0]?.now,
      node: process.version,
      proto: (process.env.DATABASE_URL || "").split(":")[0] + "://",
    }));
  } catch (e) {
    console.error("api/health error:", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
  }
};