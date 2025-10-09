// src/lib/apiClient.js
const API_BASE = process.env.REACT_APP_API_BASE?.replace(/\/+$/, "") || ""; 
// 例: https://gurisuro-server.vercel.app  ← Vercel(サーバー側)のURL

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, options);
  // 500時にHTMLが返っても落ちないようにまずテキストで受ける
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { ok: res.ok, status: res.status, data, raw: text };
}