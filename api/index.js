// /api/index.js
import eventsHandler from "../api-lib/events.js";
import applicationsHandler from "../api-lib/applications.js";
import usersHandler from "../api-lib/users.js";
import loginHandler from "../api-lib/login.js";
import registerHandler from "../api-lib/register.js";
import fairnessHandler from "../api-lib/fairness.js";
import healthHandler from "../api-lib/health.js";

export default async function handler(req, res) {
  try {
    // CORS（必要に応じて絞る）
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).end();

    const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);

    // サブルーター
    if (pathname === "/api/health")      return healthHandler(req, res);
    if (pathname === "/api/login")       return loginHandler(req, res);
    if (pathname === "/api/register")    return registerHandler(req, res);
    if (pathname.startsWith("/api/events"))        return eventsHandler(req, res);
    if (pathname.startsWith("/api/applications"))  return applicationsHandler(req, res);
    if (pathname.startsWith("/api/users"))         return usersHandler(req, res);
    if (pathname.startsWith("/api/fairness"))      return fairnessHandler(req, res);

    return res.status(404).json({ error: "Not Found", path: pathname });
  } catch (err) {
    console.error("[/api/index] Error:", err);
    return res.status(500).json({ error: "Server Error: " + err.message });
  }
}