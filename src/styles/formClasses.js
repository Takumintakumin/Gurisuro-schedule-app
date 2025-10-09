// src/styles/formClasses.js
// TailwindCSS 共通クラス定義（スマホ対応 + 各種フォーム要素）

export const labelCls =
  "block text-sm font-medium text-gray-700 mb-1";

export const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

export const selectCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

export const textareaCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500";

export const checkboxCls =
  "h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500";

export const primaryBtnCls =
  "w-full bg-blue-600 text-white rounded-lg px-4 py-2 font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed";

export const secondaryBtnCls =
  "w-full bg-gray-100 text-gray-800 rounded-lg px-4 py-2 font-semibold hover:bg-gray-200";

export const dangerBtnCls =
  "w-full bg-red-600 text-white rounded-lg px-4 py-2 font-semibold hover:bg-red-700";

export const cardCls =
  "w-full bg-white rounded-xl shadow p-4 sm:p-6";

export const sectionTitleCls =
  "text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4";

export const helperTextCls =
  "mt-1 text-xs text-gray-500";

// デフォルトエクスポート（両方の書き方に対応）
export default {
  labelCls,
  inputCls,
  selectCls,
  textareaCls,
  checkboxCls,
  primaryBtnCls,
  secondaryBtnCls,
  dangerBtnCls,
  cardCls,
  sectionTitleCls,
  helperTextCls,
};