// /api/index.js
import events from "./api-lib/events.js";
import applications from "./api-lib/applications.js";
import login from "./api-lib/login.js";
import register from "./api-lib/register.js";
import users from "./api-lib/users.js";
import health from "./api-lib/health.js";
import fairness from "./api-lib/fairness.js";

export default async function handler(req, res) {
  try {
    // CORS（必要ならドメイン絞ってOK）
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();

    // パスを安全に取り出す（new URL を使わない）
    const u = req.url || "";
    const path = u.split("?")[0] || "/api";

    if (path === "/api/events")         return events(req, res);
    if (path === "/api/applications")   return applications(req, res);
    if (path === "/api/login")          return login(req, res);
    if (path === "/api/register")       return register(req, res);
    if (path === "/api/users")          return users(req, res);
    if (path === "/api/health")         return health(req, res);
    if (path === "/api/fairness")       return fairness(req, res);

    return res.status(404).json({ error: "Not found" });
  } catch (err) {
    console.error("[/api] router error:", err);
    return res.status(500).json({ error: "Server Error: " + (err?.message || String(err)) });
  }
}