// /api/index.js
import events from "./events.js";
import applications from "./applications.js";
import fairness from "./fairness.js";
import health from "./health.js";
import users from "./users.js";
import login from "./login.js";
import register from "./register.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    // どのエンドポイントが呼ばれたか、ログ出し（デバッグ用）
    console.log("[API]", req.method, path);

    // 明示的なパス振り分け（先に長い順）
    if (path === "/api/health") return health(req, res);
    if (path.startsWith("/api/fairness")) return fairness(req, res);
    if (path.startsWith("/api/applications")) return applications(req, res);
    if (path.startsWith("/api/events")) return events(req, res);
    if (path === "/api/login") return login(req, res);
    if (path === "/api/register") return register(req, res);
    if (path.startsWith("/api/users")) return users(req, res);

    return res.status(404).json({ error: "Not Found", path });
  } catch (err) {
    // ここで落ちても 500 の詳細が返るようにする（一時的に公開）
    console.error("[/api/index] ERR:", err);
    return res.status(500).json({
      error: "Server Error",
      message: err?.message,
      stack: err?.stack?.split("\n").slice(0, 5),
    });
  }
}