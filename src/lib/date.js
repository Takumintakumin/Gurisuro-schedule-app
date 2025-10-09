// 例: src/lib/date.js
export function toLocalYMD(date) {
  // タイムゾーン差分でズレないように getFullYear / getMonth / getDate を使用
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}