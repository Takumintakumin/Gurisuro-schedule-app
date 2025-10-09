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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // イベント取得
  const fetchEvents = async () => {
    try {
      setErrMsg("");
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("イベント取得エラー:", err);
      setErrMsg("イベント一覧の取得に失敗しました。");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // イベント登録
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate) {
      alert("日付を選択してください");
      return;
    }
    if (!selectedEvent) {
      alert("イベント種類を選択してください");
      return;
    }

    try {
      setSubmitting(true);
      setErrMsg("");

      const body = {
        date: selectedDate.toISOString().split("T")[0],
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

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `登録失敗 (HTTP ${res.status})`);
      }

      alert("イベントを登録しました！");
      await fetchEvents(); // 反映
    } catch (err) {
      console.error("登録エラー:", err);
      setErrMsg(`登録に失敗しました：${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // 管理者権限チェック
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です。管理者ログインへ移動します。");
      nav("/admin", { replace: true });
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

        {errMsg && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
            {errMsg}
          </div>
        )}

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
              value={selectedEvent?.key || ""}
              onChange={(e) =>
                setSelectedEvent(
                  FIXED_EVENTS.find((f) => f.key === e.target.value) || null
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

          <button
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "登録中..." : "登録する"}
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