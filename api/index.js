// /api/index.js
import events        from "./api-lib/events.js";
import applications  from "./api-lib/applications.js";
import fairness      from "./api-lib/fairness.js";
import users         from "./api-lib/users.js";
import login         from "./api-lib/login.js";
import register      from "./api-lib/register.js";
import { healthcheck } from "./api-lib/_db.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const url  = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === "/api/health") {
      const db = await healthcheck();
      return res.status(200).json({ ok: true, db });
    }

    if (path.startsWith("/api/fairness"))     return fairness(req, res);
    if (path.startsWith("/api/applications")) return applications(req, res);
    if (path.startsWith("/api/events"))       return events(req, res);
    if (path === "/api/login")                return login(req, res);
    if (path === "/api/register")             return register(req, res);
    if (path.startsWith("/api/users"))        return users(req, res);

    return res.status(404).json({ error: "Not Found", path });
  } catch (err) {
    console.error("[/api/index] ERR:", err);
    return res.status(500).json({ error: "Server Error", message: err.message });
  }
}