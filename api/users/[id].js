// /api/users/[id].js
import { pool } from "../_db";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      const r = await pool.query("DELETE FROM users WHERE id = $1", [id]);
      // r.rowCount で削除件数がわかる
      res.status(200).json({ deleted: r.rowCount });
    } catch (e) {
      console.error("[DELETE /api/users/:id] ", e);
      res.status(500).json({ error: "ユーザー削除に失敗しました" });
    }
    return;
  }

  res.setHeader("Allow", ["DELETE"]);
  res.status(405).end("Method Not Allowed");
}