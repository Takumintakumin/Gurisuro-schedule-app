// /api/events/[id].js
import { query } from "../_db.js";

export default async function handler(req, res) {
  // Vercel の Node/Express 風サーバレスでは req.query にパラメータが入ります
  const { id } = req.query;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ error: "id が不正です" });
  }

  if (req.method === "DELETE") {
    try {
      const result = await query("DELETE FROM events WHERE id = $1", [id]);
      // Postgres では rowCount を見るのがラク
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "対象が見つかりません" });
      }
      return res.json({ ok: true, deleted: result.rowCount });
    } catch (err) {
      console.error("DELETE /api/events/[id] error:", err);
      return res.status(500).json({ error: "削除に失敗しました" });
    }
  }

  // 必要ならここで PUT も対応可能
  // if (req.method === "PUT") { ... }

  res.setHeader("Allow", "DELETE");
  return res.status(405).json({ error: "Method Not Allowed" });
}