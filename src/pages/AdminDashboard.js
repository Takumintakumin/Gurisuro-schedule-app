// src/pages/AdminDashboard.js
import React, { useEffect, useState } from "react";
import { toLocalYMD } from "../lib/date.js";

export default function AdminDashboard() {
  // タブ管理
  const tabList = [
    { key: 'calendar', label: 'カレンダー' },
    { key: 'apply', label: 'イベント一覧' },
    { key: 'notifications', label: '通知' },
    { key: 'users', label: 'ユーザー管理' },
  ];
  const [activeTab, setActiveTab] = useState('calendar');

  // イベント一覧用
  const [applyEvents, setApplyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventPage, setEventPage] = useState(0);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [modalMonth, setModalMonth] = useState(""); // "YYYY-MM"

  useEffect(() => {
    if (activeTab === 'apply') {
      setLoading(true); setError("");
      fetch("/api/events", { credentials: "include" })
        .then(res => res.json())
        .then(json => setApplyEvents(Array.isArray(json) ? json : (json.data || [])))
        .catch(e => setError("データ取得失敗: " + (e.message || "")))
        .finally(() => setLoading(false));
    }
  }, [activeTab]);

  // --- 14件単位 ---
  const sortedEvents = [...applyEvents].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.start_time || "").localeCompare(b.start_time || "")
  );
  const PAGE_SIZE = 14;
  const totalPages = Math.ceil(sortedEvents.length / PAGE_SIZE);
  const nowPage = Math.max(0, Math.min(eventPage, totalPages - 1));
  const pageEvents = sortedEvents.slice(nowPage * PAGE_SIZE, (nowPage + 1) * PAGE_SIZE);
  const monthEvents = modalMonth
    ? sortedEvents.filter(ev => ev.date && ev.date.startsWith(modalMonth))
    : [];

  // --- タブ内容レンダ ---
  const renderBody = () => {
    if (activeTab === 'calendar') {
      return <div className="p-6">カレンダー表示（本来の管理者用カレンダーをここに設置）</div>;
    }
    if (activeTab === 'apply') {
      return (
        <div className="p-6">
          <h2 className="font-semibold text-lg mb-4">イベント一覧</h2>
          {loading && <div>読み込み中…</div>}
          {error && <div className="text-red-600 p-2">{error}</div>}
          {!loading && !error && (
            <>
              <div className="flex items-center gap-4 mb-2">
                <button
                  disabled={nowPage <= 0}
                  onClick={() => setEventPage(p => Math.max(0, p - 1))}
                  className={`px-3 py-1 rounded ${nowPage <= 0 ? 'bg-gray-200 text-gray-400' : 'bg-gray-600 text-white'}`}
                >← 前へ</button>
                <span className="text-sm">
                  {pageEvents[0]?.date || "---"} ～ {pageEvents[pageEvents.length-1]?.date || "---"}
                  （{nowPage+1} / {totalPages || 1}ページ）
                </span>
                <button
                  disabled={nowPage >= totalPages-1}
                  onClick={() => setEventPage(p => Math.min(totalPages-1, p + 1))}
                  className={`px-3 py-1 rounded ${nowPage >= totalPages-1 ? 'bg-gray-200 text-gray-400' : 'bg-gray-600 text-white'}`}
                >次へ →</button>
              </div>
              <ul className="space-y-2">
                {pageEvents.length === 0 && <li className="text-gray-500">イベントはありません。</li>}
                {pageEvents.map(ev => {
                  const ym = ev.date ? ev.date.slice(0, 7) : "";
                  return (
                    <li key={ev.id} className="border rounded p-3 flex items-center gap-3">
                      {ev.icon && <img src={ev.icon} alt="" className="w-7 h-7" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{ev.label}</div>
                        <div className="text-xs text-gray-600 truncate">
                          {ev.date} {ev.start_time}〜{ev.end_time}
                        </div>
                      </div>
                      <button className="px-3 py-1 rounded bg-indigo-600 text-white text-sm"
                        onClick={() => { setShowMonthModal(true); setModalMonth(ym); }}>
                        詳細（月一覧）
                      </button>
                    </li>
                  );
                })}
              </ul>
              {showMonthModal && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-lg w-full max-w-xl p-6 relative">
                    <button onClick={() => setShowMonthModal(false)} className="absolute top-2 right-3 text-2xl">×</button>
                    <h3 className="font-semibold mb-2">{modalMonth.replace("-", "年")}月のイベント一覧</h3>
                    <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {monthEvents.length === 0 && <li className="text-gray-500">該当月のイベントはありません。</li>}
                      {monthEvents.map(ev => (
                        <li key={ev.id} className="border rounded p-2 flex items-center gap-2">
                          {ev.icon && <img src={ev.icon} alt="" className="w-6 h-6" />}
                          <span className="font-medium">{ev.label}</span>
                          <span className="text-xs text-gray-600">{ev.date} {ev.start_time}〜{ev.end_time}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      );
    }
    if (activeTab === 'notifications') {
      return <div className="p-6">通知リスト（本来の管理通知をここに設置）</div>;
    }
    if (activeTab === 'users') {
      return <div className="p-6">ユーザー管理UI（本来の管理ユーザーUIをここに設置）</div>;
    }
    return null;
  };

  return (
    <div>
      <div className="flex gap-2 border-b bg-white p-2 sticky top-0 z-10">
        {tabList.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 ${activeTab === t.key ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-gray-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {renderBody()}
    </div>
  );
}