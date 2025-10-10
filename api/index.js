// /api/index.js
import events from "../api-lib/events.js";
import applications from "../api-lib/applications.js";
import login from "../api-lib/login.js";
import register from "../api-lib/register.js";
import users from "../api-lib/users.js";
import fairness from "../api-lib/fairness.js";
import { healthcheck } from "../api-lib/_db.js";

export default async function handler(req, res) {
  // 共通CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/?/, "/");

  // ヘルス
  if (path === "/health") {
    const db = await healthcheck();
    return res.status(200).json({ ok: true, db });
  }

  // ルーティング分岐
  if (path === "/login") return login(req, res);
  if (path === "/register") return register(req, res);
  if (path === "/users" || path.startsWith("/users")) return users(req, res);

  if (path === "/events" || path.startsWith("/events")) return events(req, res);
  if (path === "/applications" || path.startsWith("/applications")) return applications(req, res);
  if (path === "/fairness") return fairness(req, res);

  return res.status(404).json({ error: "Not Found", path });
}