// /api/db.js
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing env DATABASE_URL");
}

// VercelのServerlessで使い回すためにグローバルにプールを保持
let _pool = global.__POOL__;
if (!_pool) {
  _pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  global.__POOL__ = _pool;
}

export const pool = _pool;

// 起動時にテーブルを用意（存在しなければ作成）
export async function ensureTables() {
  await pool.query(`
    create table if not exists users (
      id serial primary key,
      username text unique not null,
      password text not null,
      role text not null default 'user'
    );
  `);

  await pool.query(`
    create table if not exists events (
      id serial primary key,
      date text not null,
      label text,
      icon text,
      start_time text,
      end_time text
    );
  `);

  // 管理者の初期投入（無ければ）
  await pool.query(
    `insert into users (username, password, role)
     values ('admin','admin123','admin')
     on conflict (username) do nothing;`
  );
}