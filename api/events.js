// api/events.js
const { getPool } = require("./db.js");
const { readJson, setCors, json, ensureEventsTable } = require("./_utils.js");

module.exports = async (req, res) => {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.end();

    // eventsテーブルが無ければ作る
    await ensureEventsTable();

    const pool = getPool();

    if (req.method === "GET") {
      const { rows } = await pool.query(
        "SELECT id, date, label, icon, start_time, end_time FROM events ORDER BY date ASC"
      );
      return json(res, 200, rows);
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const { date, label, icon, start_time, end_time } = body || {};
      if (!date || !label) {
        return json(res, 400, { error: "date と label は必須です" });
      }
      await pool.query(
        "INSERT INTO events (date, label, icon, start_time, end_time) VALUES ($1, $2, $3, $4, $5)",
        [date, label, icon || null, start_time || null, end_time || null]
      );
      return json(res, 201, { message: "created" });
    }

    res.setHeader("Allow", "GET, POST, OPTIONS");
    return json(res, 405, { error: "Method Not Allowed" });
  } catch (e) {
    console.error("api/events error:", e);
    return json(res, 500, { error: "server error" });
  }
};