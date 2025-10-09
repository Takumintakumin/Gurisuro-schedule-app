// /src/pages/AdminDashboard.js（抜粋：登録/削除の肝）
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import { apiFetch } from "../lib/apiClient.js";

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
  const [msg, setMsg] = useState("");

  const roleGuard = () => {
    const r = localStorage.getItem("userRole");
    if (r !== "admin") { alert("管理者のみアクセス可能です"); nav("/admin"); return false; }
    return true;
  };

  const load = async () => {
    const { ok, data } = await apiFetch("/api/events");
    if (!ok) return setMsg(data.error || "取得エラー");
    setEvents(Array.isArray(data) ? data : []);
  };

  useEffect(() => { if (roleGuard()) load(); }, []);

  const addEvent = async (e) => {
    e.preventDefault();
    setMsg("登録中…");
    const body = {
      date: selectedDate.toISOString().split("T")[0],
      label: selectedEvent.label,
      icon: selectedEvent.icon,
      start_time: start,
      end_time: end,
    };
    const { ok, data } = await apiFetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!ok) return setMsg(data.error || "登録失敗");
    setMsg("登録完了");
    load();
  };

  const delEvent = async (id) => {
    if (!window.confirm("削除しますか？")) return;
    const { ok, data } = await apiFetch(`/api/events/${id}`, { method: "DELETE" });
    if (!ok) return alert(data.error || "削除失敗");
    load();
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl font-bold">🗓 管理者カレンダー</h1>
        <button className="underline text-gray-600" onClick={()=>{localStorage.clear(); nav("/admin");}}>
          ログアウト
        </button>
      </div>

      <Calendar
        currentMonth={selectedDate.getMonth()}
        currentYear={selectedDate.getFullYear()}
        selectedDate={selectedDate}
        onMonthChange={(d) => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth()+d, 1))}
        onDateSelect={setSelectedDate}
        events={events}
      />

      <form onSubmit={addEvent} className="mt-4 grid gap-3 border rounded p-4 bg-gray-50">
        <div className="font-semibold">
          {selectedDate.toISOString().split("T")[0]} に募集を追加
        </div>
        <div>
          <label className="block text-sm mb-1">イベント種類</label>
          <select className="border rounded p-2 w-full"
            value={selectedEvent.key}
            onChange={(e)=>setSelectedEvent(FIXED_EVENTS.find(f=>f.key===e.target.value))}
          >
            {FIXED_EVENTS.map(ev => <option key={ev.key} value={ev.key}>{ev.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm">開始</span>
            <input type="time" className="border rounded p-2 w-full" value={start} onChange={(e)=>setStart(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm">終了</span>
            <input type="time" className="border rounded p-2 w-full" value={end} onChange={(e)=>setEnd(e.target.value)} />
          </label>
        </div>
        <button className="bg-blue-600 text-white rounded px-4 py-2">登録</button>
        {msg && <p className="text-sm text-gray-600">{msg}</p>}
      </form>

      <div className="mt-6">
        <h2 className="font-semibold mb-2">登録済みイベント</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">まだ登録はありません。</p>
        ) : (
          <ul className="space-y-2">
            {events.map(ev => (
              <li key={ev.id} className="border rounded p-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{ev.date}：{ev.label}</div>
                  <div className="text-sm text-gray-600">{ev.start_time}〜{ev.end_time}</div>
                </div>
                <button onClick={()=>delEvent(ev.id)} className="bg-red-500 text-white rounded px-3 py-1">削除</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}