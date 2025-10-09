// /api/_db.js
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
// ローカルで .env を使う場合は next.config.js の env 経由か vercel dev を利用

export const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});