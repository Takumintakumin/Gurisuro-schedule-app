// src/pages/AdminDashboard.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageContainer from "../components/PageContainer.js";
import Calendar from "../components/Calendar.js";
import { inputCls, selectCls, primaryBtnCls } from "../styles/formClasses.js";

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
  const [selectedEventKey, setSelectedEventKey] = useState(FIXED_EVENTS[0].key);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");

  const selectedEvent = FIXED_EVENTS.find(e => e.key === selectedEventKey) ?? FIXED_EVENTS[0];

  const fetchEvents = async () => {
    const res = await fetch("/api/events");
    const data = await res.json();
    setEvents(Array.isArray(data) ? data : []);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    if (!res.ok) return alert("登録に失敗しました");
    alert("イベントを登録しました");
    fetchEvents();
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

  return (
    <PageContainer maxWidth={1000}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">管理者カレンダー</h1>
        <button
          className="text-gray-500 underline text-sm sm:text-base"
          onClick={() => {
            localStorage.clear();
            nav("/");
          }}
        >
          ログアウト
        </button>
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

      <form onSubmit={handleSubmit} className="mt-6 bg-gray-50 p-4 rounded-xl border space-y-3">
        <h2 className="font-semibold">
          {selectedDate.toISOString().split("T")[0]} に募集を追加
        </h2>

        <div>
          <label className="block mb-1 text-sm">イベント種類</label>
          <select
            className={selectCls}
            value={selectedEventKey}
            onChange={(e) => setSelectedEventKey(e.target.value)}
          >
            {FIXED_EVENTS.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block mb-1 text-sm">開始時間</label>
            <input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="block mb-1 text-sm">終了時間</label>
            <input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <button className={primaryBtnCls}>登録する</button>
      </form>
    </PageContainer>
  );
}