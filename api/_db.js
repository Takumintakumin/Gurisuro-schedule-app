// /api/_db.js
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Missing env: DATABASE_URL");

export const pool =
  global.pgPool ??
  new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

if (!global.pgPool) global.pgPool = pool;