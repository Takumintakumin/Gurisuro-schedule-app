import React, { useEffect, useState } from "react";
import Calendar from "../components/Calendar.js";

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

export default function AdminDashboard() {
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    date: "",
    icon: "",
    start_time: "",
    end_time: "",
    capacity_driver: 1,
    capacity_attendant: 1,
  });

  // プリセット画像一覧（自由に追加OK）
  const presetIcons = [
    { src: "/icons/golf.png", label: "ゴルフ" },
    { src: "/icons/bus.png", label: "送迎" },
    { src: "/icons/walk.png", label: "散歩" },
    { src: "/icons/lunch.png", label: "昼食" },
    { src: "/icons/meeting.png", label: "会議" },
  ];

  const loadEvents = async () => {
    const { data } = await apiFetch("/api/events");
    setEvents(Array.isArray(data) ? data : []);
  };

  useEffect(() => { loadEvents(); }, []);

  const handleAddEvent = async (e) => {
    e.preventDefault();
    try {
      const { ok, status } = await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newEvent,
          label: newEvent.icon ? "image-event" : "no-title",
        }),
      });
      if (!ok) throw new Error(status);
      alert("募集を追加しました");
      setShowModal(false);
      loadEvents();
    } catch (err) {
      alert("登録に失敗しました: " + err.message);
    }
  };

  const handleDateSelect = (date) => {
    const ymd = date.toISOString().split("T")[0];
    setNewEvent({ ...newEvent, date: ymd });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("この募集を削除しますか？")) return;
    try {
      const res = await fetch(`/api/events?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert("削除しました");
      loadEvents();
    } catch (e) {
      alert("削除に失敗しました: " + e.message);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setNewEvent({ ...newEvent, icon: reader.result });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        <h1 className="text-xl font-bold mb-4">管理者ダッシュボード</h1>

        <Calendar
          currentMonth={selectedDate.getMonth()}
          currentYear={selectedDate.getFullYear()}
          selectedDate={selectedDate}
          onMonthChange={(d) => {
            const nd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + d, 1);
            setSelectedDate(nd);
          }}
          onDateSelect={handleDateSelect}
          events={events}
        />

        <h2 className="text-lg font-semibold mt-6 mb-3">登録済み募集一覧</h2>
        {events.length === 0 ? (
          <p className="text-gray-500 text-sm">募集はまだありません。</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((ev) => (
              <li key={ev.id} className="border rounded p-3 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {ev.icon ? <img src={ev.icon} alt="" className="w-6 h-6" /> : null}
                  <div>
                    <div className="text-sm font-medium">{ev.date}</div>
                    <div className="text-xs text-gray-500">
                      {ev.start_time}〜{ev.end_time}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(ev.id)}
                  className="px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-xs"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* === 募集追加モーダル === */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white rounded-lg p-5 w-[90%] max-w-md shadow-lg">
            <h3 className="text-lg font-bold mb-4">新規募集 ({newEvent.date})</h3>
            <form onSubmit={handleAddEvent} className="grid gap-3">

              {/* 画像選択 */}
              <div>
                <div className="text-sm mb-1">募集アイコンを選択</div>
                <div className="flex flex-wrap gap-2">
                  {presetIcons.map((icon) => (
                    <button
                      type="button"
                      key={icon.src}
                      className={`border rounded p-1 ${
                        newEvent.icon === icon.src ? "border-blue-500 ring-2 ring-blue-300" : ""
                      }`}
                      onClick={() => setNewEvent({ ...newEvent, icon: icon.src })}
                    >
                      <img src={icon.src} alt={icon.label} className="w-10 h-10 object-contain" />
                    </button>
                  ))}
                  <label className="border rounded p-2 cursor-pointer hover:bg-gray-100">
                    <span className="text-sm text-gray-600">＋画像</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                {newEvent.icon && (
                  <div className="mt-2 text-sm text-green-600">選択中の画像あり</div>
                )}
              </div>

              {/* 時間・定員 */}
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <div className="text-sm mb-1">開始時刻</div>
                  <input
                    type="time"
                    value={newEvent.start_time}
                    onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })}
                    className="border rounded px-2 py-1 w-full"
                  />
                </label>
                <label>
                  <div className="text-sm mb-1">終了時刻</div>
                  <input
                    type="time"
                    value={newEvent.end_time}
                    onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })}
                    className="border rounded px-2 py-1 w-full"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <div className="text-sm mb-1">運転手定員</div>
                  <input
                    type="number"
                    min="1"
                    value={newEvent.capacity_driver}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, capacity_driver: parseInt(e.target.value) })
                    }
                    className="border rounded px-2 py-1 w-full"
                  />
                </label>
                <label>
                  <div className="text-sm mb-1">添乗員定員</div>
                  <input
                    type="number"
                    min="1"
                    value={newEvent.capacity_attendant}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, capacity_attendant: parseInt(e.target.value) })
                    }
                    className="border rounded px-2 py-1 w-full"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                  disabled={!newEvent.icon}
                >
                  登録
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}