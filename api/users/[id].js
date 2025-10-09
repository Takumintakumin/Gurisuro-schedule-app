// api/users/[id].js
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  const { id } = req.query;
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    return res.status(200).json({ message: "deleted" });
  } catch (e) {
    console.error("users/[id] delete error:", e);
    return res.status(500).json({ error: "Server Error" });
  }
}