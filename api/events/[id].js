// /api/events/[id].js
import { getClient } from "../_db.js";

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "id is required" });

  let client;
  try {
    client = await getClient();
    const result = await client.query("DELETE FROM events WHERE id = $1", [id]);
    return res.json({ ok: true, deleted: result.rowCount });
  } catch (e) {
    console.error("DELETE /api/events/:id error", e);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client?.release?.();
  }
}