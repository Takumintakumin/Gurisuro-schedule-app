// /api/_db.js
import pkg from "pg";
const { Pool } = pkg;


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

export async function healthcheck() {
  const r = await query("SELECT 1 as ok");
  return r.rows?.[0]?.ok === 1 ? 1 : 0;
}