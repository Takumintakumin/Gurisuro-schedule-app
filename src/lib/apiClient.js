// src/lib/apiClient.js
export async function apiFetch(path, options = {}) {
  const base = process.env.REACT_APP_API_BASE || "";
  const url = `${base}${path}`;



  const res = await fetch(path, init);
  const text = await res.text(); // 500時にHTMLが返ってきても落ちない
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* no-op */ }
  return { ok: res.ok, status: res.status, data };
  // 500でHTMLが返っても落ちないようにテキスト→JSON試行
  try { data = text ? JSON.parse(text) : {}; } catch { /* 非JSONは無視 */ }

  return { ok: res.ok, status: res.status, data };
}