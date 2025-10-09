// src/pages/AdminDashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";

// 固定イベントアイコンとラベル
const FIXED_EVENTS = [
  { key: "grandgolf", label: "グランドゴルフ", icon: "/icons/grandgolf.png" },
  { key: "senior",   label: "シニア体操",     icon: "/icons/senior.png" },
  { key: "eat",      label: "食べようの会",   icon: "/icons/eat.png" },
  { key: "mamatomo", label: "ママ友の会",     icon: "/icons/mamatomo.png" },
  { key: "cafe",     label: "ベイタウンカフェ", icon: "/icons/cafe.png" },
  { key: "chorus",   label: "コーラス",       icon: "/icons/chorus.png" },
];

// テキスト→JSON安全パース
const parseJSON = async (res) => {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
};

export default function AdminDashboard() {
  const nav = useNavigate();

  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(FIXED_EVENTS[0]);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [loading, setLoading] = useState(true);

  // === 管理者チェック & 初回ロード ===
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です。");
      nav("/admin");
      return;
    }
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === イベント取得 ===
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/events");
      const data = await parseJSON(res);
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("GET /api/events failed:", e);
      alert("イベント取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // === イベント登録 ===
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedEvent) {
      alert("日付とイベントを選択してください");
      return;
    }
    try {
      const body = {
        date: toLocalYMD(selectedDate),
        label: selectedEvent.label,
        icon: selectedEvent.icon,
        start_time: start,
        end_time: end,
      };
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseJSON(res);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await fetchEvents();
      alert("イベントを登録しました");
    } catch (err) {
      console.error("POST /api/events failed:", err);
      alert(`登録に失敗しました: ${err.message}`);
    }
  };

  // === イベント削除 ===
const handleDelete = async (id) => {
  if (!window.confirm("このイベントを削除しますか？")) return;
  try {
    const url = `/api/events/${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: "DELETE" });

    // 500のときにHTMLを返す環境でも落ちないようにする
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}

    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    alert("削除しました");
    // 一覧を更新（fetchEvents は既存の再取得関数を想定）
    fetchEvents?.();
  } catch (err) {
    console.error("DELETE /api/events/:id failed:", err);
    alert(`削除に失敗しました: ${err.message}`);
  }
};

  if (loading) return <div className="p-6">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">🗓 管理者カレンダー</h1>
          <div className="flex gap-3">
            <Link to="/admin/users" className="text-blue-600 underline">
              一般ユーザー管理へ
            </Link>
            <Link to="/" className="text-gray-600 underline">
              一般ログイン画面へ
            </Link>
            <button
              onClick={() => {
                localStorage.clear();
                nav("/admin");
              }}
              className="text-gray-500 underline"
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

        {/* イベント登録フォーム */}
        <form onSubmit={handleSubmit} className="mt-6 bg-gray-50 border rounded p-4">
          <h2 className="font-semibold mb-3 text-lg">
            {selectedDate.toISOString().split("T")[0]} の募集を追加
          </h2>

          <div className="mb-3">
            <label className="block mb-1 text-sm">イベント種類</label>
            <select
              className="border p-2 rounded w-full"
              value={selectedEvent.key}
              onChange={(e) =>
                setSelectedEvent(
                  FIXED_EVENTS.find((f) => f.key === e.target.value) || FIXED_EVENTS[0]
                )
              }
            >
              {FIXED_EVENTS.map((ev) => (
                <option key={ev.key} value={ev.key}>
                  {ev.label}
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

        {/* イベント一覧 + 削除 */}
        <div className="mt-6">
          <h3 className="font-semibold mb-2">登録済みイベント一覧</h3>
          {events.length === 0 ? (
            <p className="text-gray-500 text-sm">まだ登録はありません。</p>
          ) : (
            <ul className="divide-y">
              {events.map((ev) => (
                <li key={ev.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">
                      📅 {ev.date} — {ev.label}
                    </div>
                    <div className="text-sm text-gray-600">
                      {ev.start_time || "--:--"}〜{ev.end_time || "--:--"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {ev.icon ? (
                      <img
                        src={ev.icon}
                        alt={ev.label || "icon"}
                        className="w-6 h-6 object-contain"
                        loading="lazy"
                      />
                    ) : null}
                    <button
                      onClick={() => handleDelete(ev.id)}
                      className="px-3 py-1.5 rounded bg-red-500 text-white text-sm hover:bg-red-600"
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}