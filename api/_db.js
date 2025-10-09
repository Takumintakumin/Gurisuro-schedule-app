// /api/_db.js
import { Pool } from "pg";

const connectionString = process.env.NEON_DATABASE_URL;
if (!connectionString) {
  throw new Error("NEON_DATABASE_URL is not set");
}

// プールはサーバーレスでも再利用される（コールドスタート時のみ生成）
export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// コールドスタート時に一度だけスキーマを用意
let schemaReady = false;
export async function ensureSchema() {
  if (schemaReady) return;

  const sql = `
    create table if not exists users (
      id bigserial primary key,
      username text unique not null,
      password text not null,
      role text default 'user'
    );
    create table if not exists events (
      id bigserial primary key,
      date text not null,
      label text,
      icon text,
      start_time text,
      end_time text
    );
    insert into users (username, password, role)
    values ('admin', 'admin123', 'admin')
    on conflict (username) do nothing;
  `;
  const client = await pool.connect();
  try {
    await client.query(sql);
    schemaReady = true;
  } finally {
    client.release();
  }
}