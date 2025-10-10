// src/pages/AdminDashboard.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";

const FIXED_EVENTS = [
  { key: "grandgolf", label: "グランドゴルフ", icon: "/icons/grandgolf.png" },
  { key: "senior", label: "シニア体操", icon: "/icons/senior.png" },
  { key: "eat", label: "食べようの会", icon: "/icons/eat.png" },
  { key: "mamatomo", label: "ママ友の会", icon: "/icons/mamatomo.png" },
  { key: "cafe", label: "ベイタウンカフェ", icon: "/icons/cafe.png" },
  { key: "chorus", label: "コーラス", icon: "/icons/chorus.png" },
];

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(FIXED_EVENTS[0]);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [loading, setLoading] = useState(true);

  // 応募者モーダル
  const [showApplicants, setShowApplicants] = useState(false);
  const [applicants, setApplicants] = useState([]);
  const [modalEvent, setModalEvent] = useState(null);

  // イベント一覧取得
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/events");
      setEvents(Array.isArray(r.data) ? r.data : []);
    } finally {
      setLoading(false);
    }
  };

  // 応募者取得
  const fetchApplicants = async (eventId) => {
    const r = await apiFetch(`/api/applications?event_id=${eventId}`);
    if (Array.isArray(r.data)) {
      setApplicants(r.data);
    } else {
      setApplicants([]);
    }
  };

  // イベント登録
  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = {
      date: toLocalYMD(selectedDate),
      label: selectedEvent.label,
      icon: selectedEvent.icon,
      start_time: start,
      end_time: end,
    };
    try {
      const r = await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      alert("イベントを登録しました");
      fetchEvents();
    } catch (err) {
      alert("登録に失敗しました: " + err.message);
    }
  };

  // イベント削除
  const handleDelete = async (id) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    try {
      const res = await apiFetch(`/api/events?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(res.data?.error || `HTTP ${res.status}`);
      alert("イベントを削除しました。");
      fetchEvents();
    } catch (err) {
      alert("削除に失敗しました: " + err.message);
    }
  };

  // 応募者モーダル開閉
  const openApplicants = async (ev) => {
    await fetchApplicants(ev.id);
    setModalEvent(ev);
    setShowApplicants(true);
  };
  const closeApplicants = () => {
    setShowApplicants(false);
    setApplicants([]);
    setModalEvent(null);
  };

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/");
      return;
    }
    fetchEvents();
  }, [nav]);

  if (loading) return <div className="p-6">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6 relative">
        {/* ヘッダー */}
        <div className="flex justify-between mb-4 items-center">
          <h1 className="text-xl font-bold">🗓 管理者カレンダー</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav("/admin/users")}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 text-sm"
            >
              ユーザー管理へ
            </button>
            <button
              onClick={() => { localStorage.clear(); nav("/"); }}
              className="text-gray-500 underline text-sm"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* カレンダー */}
        <Calendar
          currentMonth={selectedDate.getMonth()}
          currentYear={selectedDate.getFullYear()}
          selectedDate={selectedDate}
          onMonthChange={(delta) => {
            const newDate = new Date(
              selectedDate.getFullYear(),
              selectedDate.getMonth() + delta,
              1
            );
            setSelectedDate(newDate);
          }}
          onDateSelect={setSelectedDate}
          events={events}
        />

        {/* 募集登録フォーム */}
        <form onSubmit={handleSubmit} className="mt-6 bg-gray-50 p-4 rounded border">
          <h2 className="font-semibold mb-2">
            {toLocalYMD(selectedDate)} に募集を追加
          </h2>

          <div className="mb-3">
            <label className="block mb-1 text-sm">イベント種類</label>
            <select
              className="border p-2 rounded w-full"
              value={selectedEvent.key}
              onChange={(e) =>
                setSelectedEvent(FIXED_EVENTS.find((f) => f.key === e.target.value))
              }
            >
              {FIXED_EVENTS.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="block mb-1 text-sm">開始時間</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="border p-2 rounded w-full"
              />
            </div>
            <div className="flex-1">
              <label className="block mb-1 text-sm">終了時間</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="border p-2 rounded w-full"
              />
            </div>
          </div>

          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            登録する
          </button>
        </form>

        {/* 登録済みイベント一覧 */}
<div className="mt-6">
  <h3 className="font-semibold mb-3 text-lg">📋 登録済みイベント一覧</h3>
  {events.length === 0 ? (
    <p className="text-gray-500 text-sm">まだ登録はありません。</p>
  ) : (
    <div className="space-y-3">
      {events.map((ev) => (
        <div
          key={ev.id}
          className="border border-gray-200 bg-gray-50 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-150"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            {/* 左側：情報 */}
            <div className="flex items-center gap-3">
              {ev.icon && (
                <img
                  src={ev.icon}
                  alt={ev.label}
                  className="w-10 h-10 rounded-md object-contain border border-gray-200 bg-white"
                />
              )}
              <div>
                <div className="text-base font-semibold text-gray-800">
                  {ev.label}
                </div>
                <div className="text-sm text-gray-600">
                  📅 {ev.date}　🕒 {ev.start_time}〜{ev.end_time}
                </div>
              </div>
            </div>

            {/* 右側：操作ボタン */}
            <div className="flex gap-2 mt-2 sm:mt-0">
              <button
                onClick={() => openApplicants(ev)}
                className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1"
              >
                👁 応募者を見る
              </button>
              <button
                onClick={() => handleDelete(ev.id)}
                className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-red-700 flex items-center gap-1"
              >
                🗑 削除
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )}
</div>

        {/* 応募者モーダル */}
        {showApplicants && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-11/12 max-w-md p-6">
              <h2 className="text-lg font-bold mb-3">
                {modalEvent?.label} の応募者一覧
              </h2>
              {applicants.length === 0 ? (
                <p className="text-sm text-gray-500">応募者はいません。</p>
              ) : (
                <ul className="divide-y">
                  {applicants.map((a, i) => (
                    <li key={i} className="py-2 text-sm flex justify-between">
                      <span>{a.username}</span>
                      <span className="text-gray-600">
                        {a.kind === "driver" ? "🚗 運転手" : "🧍 添乗員"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 text-right">
                <button
                  onClick={() => setShowApplicants(false)}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}