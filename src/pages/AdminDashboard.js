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

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/events");
      setEvents(Array.isArray(r.data) ? r.data : []);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = {
      date: toLocalYMD(selectedDate),        // ← ここが超重要（ISO禁止）
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
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
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
                setSelectedEvent(
                  FIXED_EVENTS.find((f) => f.key === e.target.value)
                )
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

        <div className="mt-6">
          <h3 className="font-semibold mb-2">登録済みイベント一覧</h3>
          {events.length === 0 ? (
            <p className="text-gray-500 text-sm">まだ登録はありません。</p>
          ) : (
            <ul className="text-sm space-y-1">
              {events.map((ev) => (
                <li key={ev.id}>
                  📅 {ev.date}：{ev.label}（{ev.start_time}〜{ev.end_time}）
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}