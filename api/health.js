import { ensureSchema } from "./_db.js";

export default async function handler(req, res) {
  try {
    await ensureSchema();
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}