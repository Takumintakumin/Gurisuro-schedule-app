// src/lib/apiClient.js
export async function apiFetch(path, options = {}) {
  const base = process.env.REACT_APP_API_BASE || "";
  const url = `${base}${path}`;

  const res = await fetch(url, options);

  // 500でHTMLが返っても落ちないようにテキスト→JSON試行
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* 非JSONは無視 */ }

  return { ok: res.ok, status: res.status, data };
}