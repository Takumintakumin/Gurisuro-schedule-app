// src/styles/formClasses.js
// フォーム入力・ボタン・カードなどの共通クラス（Tailwind対応）
// 大文字・小文字は厳密にこのままにしてください

export const labelCls =
  "block text-sm font-medium text-gray-700 mb-1";

export const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export const selectCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

export const textareaCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500";

export const checkboxCls =
  "h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500";

export const primaryBtnCls =
  "w-full bg-blue-600 text-white font-semibold rounded-md px-4 py-2 text-sm hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150";

export const secondaryBtnCls =
  "w-full bg-gray-100 text-gray-800 font-semibold rounded-md px-4 py-2 text-sm hover:bg-gray-200 active:bg-gray-300 transition-colors duration-150";

export const dangerBtnCls =
  "w-full bg-red-600 text-white font-semibold rounded-md px-4 py-2 text-sm hover:bg-red-700 active:bg-red-800 transition-colors duration-150";

export const cardCls =
  "w-full bg-white rounded-xl shadow-md p-4 sm:p-6";

export const sectionTitleCls =
  "text-lg sm:text-xl font-semibold text-gray-800 mb-4";

export const helperTextCls =
  "text-xs text-gray-500 mt-1";

// デフォルトエクスポート（両方の import 形式に対応）
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