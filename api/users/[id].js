// /api/users/[id].js
import { pool } from "../db.js";

export default async function handler(req, res) {
  try {
    const { id } = req.query || {};
    if (!id || !/^\d+$/.test(String(id))) {
      return res.status(400).json({ error: "有効な id が必要です" });
    }

    if (req.method === "DELETE") {
      const result = await pool.query("DELETE FROM users WHERE id = $1", [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "対象ユーザーが見つかりません" });
      }
      return res.status(200).json({ message: "ユーザーを削除しました" });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("USERS_DELETE_ERROR:", e);
    return res.status(500).json({ error: "サーバーエラー" });
  }
}