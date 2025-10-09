// src/pages/AdminDashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";

// 固定イベントアイコンとラベル
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
  const [capD, setCapD] = useState(1);
  const [capA, setCapA] = useState(1);
  const [loading, setLoading] = useState(true);

  // イベント取得
  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []); // 安全対策
    } catch (err) {
      console.error("イベント取得エラー:", err);
    } finally {
      setLoading(false);
    }
  };

  // イベント登録
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedEvent) {
      alert("日付とイベントを選択してください");
      return;
    }

    try {
      const body = {
        date: selectedDate.toISOString().split("T")[0],
        label: selectedEvent.label,
        icon: selectedEvent.icon,
        start_time: start,
        end_time: end,
        capacity_driver: Number(capD),
        capacity_attendant: Number(capA),
      };

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "登録に失敗しました");
      }

      alert("イベントを登録しました！");
      fetchEvents(); // 更新
    } catch (err) {
      console.error("登録エラー:", err);
      alert("登録に失敗しました: " + err.message);
    }
  };

  // 管理者権限チェック
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です。");
      nav("/");
      return;
    }
    fetchEvents();
  }, [nav]);

  if (loading) return <div className="p-6">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
        {/* ヘッダー */}
        <div className="flex justify-between mb-4 items-center">
          <h1 className="text-2xl font-bold">🗓 管理者カレンダー</h1>
          <button
            onClick={() => {
              localStorage.clear();
              nav("/");
            }}
            className="text-gray-500 underline"
          >
            ログアウト
          </button>
        </div>

        {/* カレンダー部分 */}
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
        <form
          onSubmit={handleSubmit}
          className="mt-6 bg-gray-50 border rounded p-4"
        >
          <h2 className="font-semibold mb-2 text-lg">
            {selectedDate.toISOString().split("T")[0]} の募集を追加
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

        {/* イベント一覧プレビュー */}
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