// api/users/[id].js
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function sendErr(res, code, msg) {
  return res.status(code).json({ error: msg });
}

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    return sendErr(res, 500, "Missing DATABASE_URL");
  }

  const { id } = req.query || {};
  if (!id) return sendErr(res, 400, "id が必要です");

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return sendErr(res, 405, "Method Not Allowed");
  }

  try {
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    return res.status(200).json({ message: "deleted" });
  } catch (e) {
    console.error("users/[id] delete error:", e);
    return sendErr(res, 500, e?.message || "Server Error");
  }
}