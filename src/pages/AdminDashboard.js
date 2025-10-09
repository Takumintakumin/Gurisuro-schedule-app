// src/pages/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Calendar from "../components/Calendar.js";

// 固定イベント（public/icons 下に置く）
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

  // カレンダー＆フォーム状態
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEventKey, setSelectedEventKey] = useState(FIXED_EVENTS[0].key);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");

  // UI状態
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const selectedEvent = useMemo(
    () => FIXED_EVENTS.find((f) => f.key === selectedEventKey) || FIXED_EVENTS[0],
    [selectedEventKey]
  );

  // ---- API helpers（テキスト→JSON 安定化） ----
  const safeFetchJSON = async (input, init) => {
    const res = await fetch(input, init);
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    return { res, ok: res.ok, status: res.status, data, raw: text };
  };

  // ---- 取得 ----
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { ok, data } = await safeFetchJSON("/api/events");
      if (!ok || !Array.isArray(data)) throw new Error("取得に失敗しました");
      setEvents(data);
    } catch (e) {
      console.error("イベント取得エラー:", e);
      setEvents([]);
      alert("イベント一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // ---- 登録 ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate) return alert("日付を選択してください");
    setSubmitting(true);
    try {
      const body = {
        date: selectedDate.toISOString().split("T")[0],
        label: selectedEvent.label,
        icon: selectedEvent.icon,
        start_time: start,
        end_time: end,
      };
      const { ok, status, data } = await safeFetchJSON("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!ok) throw new Error(data?.error || `HTTP ${status}`);
      await fetchEvents();
      alert("イベントを登録しました。");
    } catch (err) {
      console.error("登録エラー:", err);
      alert("登録に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 削除 ----
  const handleDelete = async (id) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    try {
      const { ok, status, data } = await safeFetchJSON(`/api/events/${id}`, {
        method: "DELETE",
      });
      if (!ok) throw new Error(data?.error || `HTTP ${status}`);
      await fetchEvents();
      alert("削除しました。");
    } catch (err) {
      console.error("DELETE /api/events/:id failed:", err);
      alert("削除に失敗しました。");
    }
  };

  // 権限チェック & 初期ロード
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です。");
      nav("/admin");
      return;
    }
    fetchEvents();
  }, [nav]);

  if (loading) return <div className="p-6">読み込み中…</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between items-start sm:items-center mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">🗓 管理者カレンダー</h1>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/users"
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
            >
              一般ユーザー管理へ
            </Link>
            <Link
              to="/"
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
              onClick={() => {
                // 一般ログインに戻るだけなら localStorage は消さない
              }}
            >
              一般ログインへ
            </Link>
            <button
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
              onClick={() => {
                localStorage.clear();
                nav("/admin");
              }}
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
            const d = new Date(
              selectedDate.getFullYear(),
              selectedDate.getMonth() + delta,
              1
            );
            setSelectedDate(d);
          }}
          onDateSelect={setSelectedDate}
          events={events}
        />

        {/* 登録フォーム */}
        <form onSubmit={handleSubmit} className="mt-6 bg-gray-50 border rounded p-4">
          <h2 className="font-semibold mb-3 text-lg">
            {selectedDate.toISOString().split("T")[0]} の募集を追加
          </h2>

          <div className="mb-3">
            <label className="block mb-1 text-sm">イベント種類</label>
            <select
              className="border p-2 rounded w-full"
              value={selectedEventKey}
              onChange={(e) => setSelectedEventKey(e.target.value)}
            >
              {FIXED_EVENTS.map((ev) => (
                <option key={ev.key} value={ev.key}>
                  {ev.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 mb-4">
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
            disabled={submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "登録中…" : "登録する"}
          </button>
        </form>

        {/* 登録済みイベント一覧 */}
        <div className="mt-6">
          <h3 className="font-semibold mb-2">登録済みイベント一覧</h3>
          {events.length === 0 ? (
            <p className="text-gray-500 text-sm">まだ登録はありません。</p>
          ) : (
            <ul className="divide-y">
              {events.map((ev) => (
                <li key={ev.id} className="py-2 flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-medium">
                      📅 {ev.date} — {ev.label}
                    </div>
                    <div className="text-gray-600">
                      {ev.start_time}〜{ev.end_time}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ev.icon && (
                      <img
                        src={ev.icon}
                        alt={ev.label}
                        className="h-6 w-6 object-contain"
                      />
                    )}
                    <button
                      onClick={() => handleDelete(ev.id)}
                      className="px-3 py-1.5 text-sm rounded bg-red-500 text-white hover:bg-red-600"
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