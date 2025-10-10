import React, { useEffect, useState } from "react";

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

export default function AdminDashboard() {
  const [events, setEvents] = useState([]);
  const [newEvent, setNewEvent] = useState({
    date: "",
    label: "",
    icon: "",
    start_time: "",
    end_time: "",
    capacity_driver: 1,
    capacity_attendant: 1,
  });
  const [openEventId, setOpenEventId] = useState(null);
  const [applicants, setApplicants] = useState([]);

  // イベント一覧を取得
  const loadEvents = async () => {
    const { data } = await apiFetch("/api/events");
    setEvents(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadEvents();
  }, []);

  // イベント削除
  const handleDelete = async (id) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    try {
      const res = await fetch(`/api/events?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert("削除しました");
      loadEvents();
    } catch (e) {
      alert("削除に失敗しました: " + e.message);
    }
  };

  // 応募者一覧を読み込み
  const loadApplicants = async (eventId) => {
    if (openEventId === eventId) {
      setOpenEventId(null);
      setApplicants([]);
      return;
    }
    try {
      const res = await apiFetch(`/api/applications?event_id=${eventId}`);
      setApplicants(Array.isArray(res.data) ? res.data : []);
      setOpenEventId(eventId);
    } catch (e) {
      alert("応募者の取得に失敗しました");
    }
  };

  // イベント登録
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { ok, status } = await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEvent),
      });
      if (!ok) throw new Error(status);
      alert("イベントを登録しました");
      setNewEvent({
        date: "",
        label: "",
        icon: "",
        start_time: "",
        end_time: "",
        capacity_driver: 1,
        capacity_attendant: 1,
      });
      loadEvents();
    } catch (err) {
      alert("登録に失敗しました: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-xl font-bold mb-4">管理者ダッシュボード</h1>

        {/* イベント登録フォーム */}
        <form onSubmit={handleSubmit} className="grid gap-3 mb-8">
          <div>
            <label className="block text-sm font-medium mb-1">日付</label>
            <input
              type="date"
              value={newEvent.date}
              onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
              className="border rounded px-2 py-1 w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">イベント名</label>
            <input
              value={newEvent.label}
              onChange={(e) => setNewEvent({ ...newEvent, label: e.target.value })}
              className="border rounded px-2 py-1 w-full"
              placeholder="例：グランドゴルフ"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">開始時刻</label>
              <input
                type="time"
                value={newEvent.start_time}
                onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })}
                className="border rounded px-2 py-1 w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">終了時刻</label>
              <input
                type="time"
                value={newEvent.end_time}
                onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })}
                className="border rounded px-2 py-1 w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">運転手定員</label>
              <input
                type="number"
                value={newEvent.capacity_driver}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, capacity_driver: parseInt(e.target.value) })
                }
                className="border rounded px-2 py-1 w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">添乗員定員</label>
              <input
                type="number"
                value={newEvent.capacity_attendant}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, capacity_attendant: parseInt(e.target.value) })
                }
                className="border rounded px-2 py-1 w-full"
              />
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            イベントを登録
          </button>
        </form>

        {/* イベント一覧 */}
        <h2 className="text-lg font-semibold mb-3">登録済みイベント一覧</h2>
        {events.length === 0 ? (
          <p className="text-gray-500 text-sm">イベントはまだありません。</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((ev) => {
              const isOpen = openEventId === ev.id;
              const drivers = applicants.filter((a) => a.kind === "driver");
              const attendants = applicants.filter((a) => a.kind === "attendant");

              return (
                <li key={ev.id} className="border rounded p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{ev.date}</span>：{ev.label}（
                      {ev.start_time}〜{ev.end_time}）
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadApplicants(ev.id)}
                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                      >
                        応募状況を見る
                      </button>
                      <button
                        onClick={() => handleDelete(ev.id)}
                        className="px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-xs"
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="border rounded p-2">
                        <div className="font-semibold text-blue-700">
                          運転手（{drivers.length}）
                        </div>
                        {drivers.length === 0 ? (
                          <div className="text-gray-500 text-xs mt-1">応募なし</div>
                        ) : (
                          <ul className="mt-1 space-y-1 text-sm">
                            {drivers.map((a) => (
                              <li key={a.id}>・{a.username}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="border rounded p-2">
                        <div className="font-semibold text-emerald-700">
                          添乗員（{attendants.length}）
                        </div>
                        {attendants.length === 0 ? (
                          <div className="text-gray-500 text-xs mt-1">応募なし</div>
                        ) : (
                          <ul className="mt-1 space-y-1 text-sm">
                            {attendants.map((a) => (
                              <li key={a.id}>・{a.username}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}