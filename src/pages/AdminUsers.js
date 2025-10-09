// src/pages/AdminDashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";

const FIXED_EVENTS = [
  { key: "grandgolf", label: "グランドゴルフ", icon: "/icons/grandgolf.png" },
  { key: "senior", label: "シニア体操", icon: "/icons/senior.png" },
  { key: "eat", label: "食べようの会", icon: "/icons/eat.png" },
  { key: "mamatomo", label: "ママ友の会", icon: "/icons/mamatomo.png" },
  { key: "cafe", label: "ベイタウンカフェ", icon: "/icons/cafe.png" },
  { key: "chorus", label: "コーラス", icon: "/icons/chorus.png" },
];

export default function AdminDashboard() {
  const nav = useNavigate();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(FIXED_EVENTS[0]);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");

  const [loading, setLoading] = useState(true);
  const [fetchInfo, setFetchInfo] = useState({ ok: null, status: "", note: "" });

  async function fetchEvents() {
    setLoading(true);
    setFetchInfo({ ok: null, status: "loading", note: "" });
    try {
      const res = await fetch("/api/events", { method: "GET" });
      const raw = await res.text(); // 失敗時(500のHTML)でも中身を拾う
      console.log("[/api/events] status:", res.status, "raw:", raw);

      let data = [];
      try {
        data = raw ? JSON.parse(raw) : [];
      } catch (e) {
        console.warn("JSON parse failed:", e);
        setFetchInfo({
          ok: false,
          status: `${res.status}`,
          note: "JSON解析に失敗。サーバー返却テキストをConsoleに出力しました。",
        });
        setEvents([]);
        return;
      }

      if (!res.ok) {
        setFetchInfo({
          ok: false,
          status: `${res.status}`,
          note: data?.error || "APIエラー（サーバーログ参照）",
        });
        setEvents([]);
        return;
      }

      setEvents(Array.isArray(data) ? data : []);
      setFetchInfo({
        ok: true,
        status: `${res.status}`,
        note: `取得: ${Array.isArray(data) ? data.length : 0}件`,
      });
    } catch (err) {
      console.error("fetch /api/events failed:", err);
      setFetchInfo({ ok: false, status: "network_error", note: String(err) });
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const body = {
      date: selectedDate.toISOString().split("T")[0],
      label: selectedEvent.label,
      icon: selectedEvent.icon,
      start_time: start,
      end_time: end,
    };

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      console.log("[POST /api/events] status:", res.status, "raw:", raw);

      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}

      if (!res.ok) {
        alert(`登録失敗: ${data?.error || `HTTP ${res.status}`}`);
        return;
      }
      alert("イベントを登録しました");
      fetchEvents();
    } catch (err) {
      console.error("register event failed:", err);
      alert("通信エラーで登録できませんでした");
    }
  }

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
          <h1 className="text-2xl font-bold">🗓 管理者カレンダー</h1>
          <button
            className="text-gray-500 underline"
            onClick={() => { localStorage.clear(); nav("/"); }}
          >
            ログアウト
          </button>
        </div>

        {/* API ステータス表示 */}
        <div className={`mb-3 text-sm ${fetchInfo.ok === false ? "text-red-600" : "text-gray-600"}`}>
          API: /api/events → status: <b>{fetchInfo.status}</b> {fetchInfo.note && ` / ${fetchInfo.note}`}
        </div>

        <Calendar
          currentMonth={selectedDate.getMonth()}
          currentYear={selectedDate.getFullYear()}
          selectedDate={selectedDate}
          onMonthChange={(delta) =>
            setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + delta, 1))
          }
          onDateSelect={setSelectedDate}
          events={events}
        />

        <form onSubmit={handleSubmit} className="mt-6 bg-gray-50 p-4 rounded border">
          <h2 className="font-semibold mb-2">
            {selectedDate.toISOString().split("T")[0]} に募集を追加
          </h2>

          <label className="block text-sm mb-1">イベント種類</label>
          <select
            className="border p-2 rounded w-full mb-3"
            value={selectedEvent.key}
            onChange={(e) =>
              setSelectedEvent(FIXED_EVENTS.find((f) => f.key === e.target.value) || FIXED_EVENTS[0])
            }
          >
            {FIXED_EVENTS.map((e) => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>

          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="block text-sm mb-1">開始</label>
              <input className="border p-2 rounded w-full" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="block text-sm mb-1">終了</label>
              <input className="border p-2 rounded w-full" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">登録</button>
        </form>

        <div className="mt-6">
          <h3 className="font-semibold mb-2">登録済みイベント一覧（{events.length}件）</h3>
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