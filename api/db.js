// api/db.js
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
// 例: postgres://USER:PASSWORD@HOST:PORT/DB?sslmode=require

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }, // Neon向け
});
