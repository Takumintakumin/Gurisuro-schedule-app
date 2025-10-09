// src/pages/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Calendar from "../components/Calendar.js";

// 固定イベント（アイコンは public/icons/xxx.png へ配置）
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

  // カレンダー/フォーム
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedKind, setSelectedKind] = useState(FIXED_EVENTS[0].key);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 選択中のプリセット
  const selectedEvent = useMemo(
    () => FIXED_EVENTS.find((f) => f.key === selectedKind) ?? FIXED_EVENTS[0],
    [selectedKind]
  );

  // 認可チェック & 初回ロード
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

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/events");
      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : [];
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("GET /api/events failed:", e);
      alert("イベント一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate) return;
    setSubmitting(true);
    try {
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
      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : {};
      if (!res.ok) throw new Error(data?.error || "登録に失敗しました");
      await fetchEvents();
      alert("イベントを登録しました。");
    } catch (e) {
      console.error("POST /api/events failed:", e);
      alert(e.message || "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  // ★ 削除
  const deleteEvent = async (id) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : {};
      if (!res.ok || !data.ok) throw new Error(data?.error || "削除に失敗しました");
      await fetchEvents();
    } catch (e) {
      console.error("DELETE /api/events/:id failed:", e);
      alert(e.message || "削除に失敗しました");
    }
  };

  if (loading) return <div className="p-6">読み込み中…</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h1 className="text-lg sm:text-xl font-bold">🗓 管理者カレンダー</h1>
          <div className="flex items-center gap-3 text-sm">
            <Link
              to="/admin/users"
              className="text-blue-600 hover:underline"
              title="ユーザー管理へ"
            >
              ユーザー管理
            </Link>
            <button
              onClick={() => {
                localStorage.clear();
                nav("/");
              }}
              className="text-gray-500 hover:underline"
              title="ログアウト"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* 本体 */}
        <div className="p-4 sm:p-6">
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

          {/* 追加フォーム */}
          <form
            onSubmit={handleSubmit}
            className="mt-5 border rounded-lg p-4 bg-gray-50"
          >
            <h2 className="font-semibold mb-3">
              {selectedDate.toISOString().split("T")[0]} に募集を追加
            </h2>

            <div className="mb-3">
              <label className="block text-sm mb-1">イベント種類</label>
              <select
                className="border rounded w-full p-2"
                value={selectedKind}
                onChange={(e) => setSelectedKind(e.target.value)}
              >
                {FIXED_EVENTS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm mb-1">開始</label>
                <input
                  type="time"
                  className="border rounded w-full p-2"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">終了</label>
                <input
                  type="time"
                  className="border rounded w-full p-2"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "登録中…" : "登録"}
            </button>
          </form>

          {/* 登録済みイベント */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">登録済みイベント</h3>
              <button
                className="text-sm text-blue-600 hover:underline"
                onClick={fetchEvents}
                title="再読み込み"
              >
                更新
              </button>
            </div>

            {events.length === 0 ? (
              <p className="text-gray-500 text-sm">まだ登録はありません。</p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-center justify-between border rounded p-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {ev.icon ? (
                        <img
                          src={ev.icon}
                          alt=""
                          className="w-5 h-5 object-contain"
                          loading="lazy"
                        />
                      ) : null}
                      <span className="whitespace-nowrap">
                        {ev.date}：{ev.label}
                        {ev.start_time
                          ? `（${ev.start_time}〜${ev.end_time || ""}）`
                          : ""}
                      </span>
                    </div>

                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}