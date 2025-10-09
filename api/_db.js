// /api/_db.js
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[_db] DATABASE_URL is missing");
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});