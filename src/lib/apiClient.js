// /src/lib/apiClient.js
export async function apiFetch(path, init = {}) {
  const res = await fetch(path, init);
  const text = await res.text(); // 500時のHTMLも拾える
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, data, raw: text };
}