// src/pages/MainApp.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";

export default function MainApp() {
  const nav = useNavigate();

  // カレンダーの状態
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // サーバから取得するイベント
  const [events, setEvents] = useState([]);

  // ログインチェック
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (!role) nav("/");
  }, [nav]);

  // イベント取得
  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("イベント取得失敗:", e);
      setEvents([]);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const onMonthChange = (delta) => {
    let m = currentMonth + delta;
    let y = currentYear;
    if (m > 11) { m = 0; y += 1; }
    else if (m < 0) { m = 11; y -= 1; }
    setCurrentMonth(m);
    setCurrentYear(y);
    // 月が変わったら再取得（必要に応じて最適化）
    fetchEvents();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">グリスロ予定調整アプリ</h1>
          <button
            className="text-sm text-gray-600 underline"
            onClick={() => {
              localStorage.clear();
              nav("/");
            }}
          >
            ログアウト
          </button>
        </header>

        <Calendar
          currentMonth={currentMonth}
          currentYear={currentYear}
          selectedDate={selectedDate}
          onMonthChange={onMonthChange}
          onDateSelect={setSelectedDate}
          events={events}
        />

        {/* 選択日のイベント一覧（任意） */}
        <SelectedDayEvents date={selectedDate} events={events} />
      </div>
    </div>
  );
}

const toDateKey = (d) => d.toISOString().split("T")[0];

function SelectedDayEvents({ date, events }) {
  const dateKey = toDateKey(date || new Date());
  const list = (Array.isArray(events) ? events : []).filter((e) => e.date === dateKey);

  if (list.length === 0) return null;

  return (
    <div className="mt-4 bg-white rounded-xl shadow p-4">
      <h3 className="font-semibold mb-2">{dateKey} のイベント</h3>
      <ul className="space-y-2">
        {list.map((e) => (
          <li key={e.id} className="flex items-center gap-2">
            <img
              src={e.icon}
              alt={e.label}
              className="w-5 h-5 object-contain"
              onError={(ev) => (ev.currentTarget.style.display = "none")}
            />
            <span>{e.label}</span>
            {e.start_time && (
              <span className="text-sm text-gray-600">
                {e.start_time}〜{e.end_time}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}