// src/pages/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";

// 500エラー時のHTMLにも耐える軽量fetch
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

// 固定イベント（画像は public/icons 配下）
const FIXED_EVENTS = [
  { key: "grandgolf", label: "グランドゴルフ", icon: "/icons/grandgolf.png" },
  { key: "senior",    label: "シニア体操",     icon: "/icons/senior.png" },
  { key: "eat",       label: "食べようの会",   icon: "/icons/eat.png" },
  { key: "mamatomo",  label: "ママ友の会",     icon: "/icons/mamatomo.png" },
  { key: "cafe",      label: "ベイタウンカフェ", icon: "/icons/cafe.png" },
  { key: "chorus",    label: "コーラス",       icon: "/icons/chorus.png" },
];

export default function AdminDashboard() {
  const nav = useNavigate();

  // カレンダー & データ
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]); // {id,date,label,icon,start_time,end_time,capacity_*}
  const [loading, setLoading] = useState(true);

  // 募集作成フォーム
  const [selectedEvent, setSelectedEvent] = useState(FIXED_EVENTS[0]); // 任意選択
  const [customLabel, setCustomLabel] = useState("");                  // 自由記入（優先）
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [capD, setCapD] = useState(1);
  const [capA, setCapA] = useState(1);

  // 認可 & 初期ロード
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/");
      return;
    }
    refresh();
  }, [nav]);

  // 一覧取得
  const refresh = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/events");
      setEvents(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error("fetch events error:", e);
    } finally {
      setLoading(false);
    }
  };

  // 選択日（YYYY-MM-DD）
  const ymd = toLocalYMD(selectedDate);

  // 当日の登録済みイベント
  const todays = useMemo(
    () => events.filter((e) => e.date === ymd),
    [events, ymd]
  );

  // 募集登録：画像は任意／自由記入を優先（両方空ならエラー）
  const handleSubmit = async (e) => {
    e.preventDefault();

    const label = (customLabel || "").trim() || (selectedEvent?.label || "").trim();
    if (!label) {
      alert("イベント名を入力するか、画像からイベント種類を選択してください。");
      return;
    }
    if (!start || !end) {
      alert("開始/終了時間を入力してください。");
      return;
    }

    try {
      const body = {
        date: ymd,
        label,
        icon: selectedEvent?.icon || "", // 画像未選択でもOK
        start_time: start,
        end_time: end,
        capacity_driver: Number(capD),
        capacity_attendant: Number(capA),
      };

      const r = await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);

      alert("イベントを登録しました");
      setCustomLabel("");
      await refresh();
    } catch (err) {
      console.error("create event error:", err);
      alert(`登録に失敗しました: ${err.message}`);
    }
  };

  // イベント削除
  const handleDelete = async (id) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    try {
      // Vercel環境に合わせ、idクエリでDELETE
      const r = await apiFetch(`/api/events?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      await refresh();
    } catch (err) {
      alert(`削除に失敗しました: ${err.message}`);
    }
  };

  if (loading) return <div className="p-6">読み込み中…</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">🗓 管理者カレンダー</h1>
          <div className="flex gap-3">
            <button
              onClick={() => nav("/")}
              className="text-gray-600 underline"
              title="一般ログインへ"
            >
              一般ログインへ
            </button>
            <button
              onClick={() => {
                localStorage.clear();
                nav("/");
              }}
              className="text-gray-600 underline"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* カレンダー（UIは変更しない） */}
        <Calendar
          currentMonth={selectedDate.getMonth()}
          currentYear={selectedDate.getFullYear()}
          selectedDate={selectedDate}
          onMonthChange={(delta) => {
            const nd = new Date(
              selectedDate.getFullYear(),
              selectedDate.getMonth() + delta,
              1
            );
            setSelectedDate(nd);
          }}
          onDateSelect={(d) => setSelectedDate(d)}
          events={events}
        />

        {/* 募集作成フォーム（画像は任意＋自由記入欄） */}
        <form onSubmit={handleSubmit} className="mt-5 bg-gray-50 p-4 rounded-lg border">
          <h2 className="font-semibold mb-3">{ymd} の募集を作成</h2>

          {/* 画像選択グリッド（任意） */}
          <div className="mb-3">
            <div className="text-sm mb-2">イベント種類（画像から選択・任意）</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {FIXED_EVENTS.map((ev) => {
                const active = selectedEvent?.key === ev.key;
                return (
                  <button
                    key={ev.key}
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                    className={`flex flex-col items-center gap-1 border rounded-lg p-2 bg-white hover:bg-gray-50 ${
                      active ? "ring-2 ring-blue-500" : ""
                    }`}
                  >
                    <img
                      src={ev.icon}
                      alt={ev.label}
                      className="w-10 h-10 object-contain"
                      onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                    />
                    <span className="text-[11px] text-gray-700">{ev.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 自由記入（こちらが優先） */}
          <div className="mb-3">
            <div className="text-sm mb-1">自由記入（イベント名・メモ等・任意）</div>
            <input
              type="text"
              placeholder="例：地域清掃ボランティア／買い物サポート など"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              className="w-full border rounded p-2"
            />
            <p className="text-xs text-gray-500 mt-1">
              ※自由記入がある場合は、画像で選んだ種類よりこちらが優先されます
            </p>
          </div>

          {/* 時間・枠数 */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-sm">
              開始
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full border rounded p-2"
              />
            </label>
            <label className="text-sm">
              終了
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full border rounded p-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <label className="text-sm">
              運転手の枠
              <input
                type="number"
                min={0}
                value={capD}
                onChange={(e) => setCapD(e.target.value)}
                className="mt-1 w-full border rounded p-2"
              />
            </label>
            <label className="text-sm">
              添乗員の枠
              <input
                type="number"
                min={0}
                value={capA}
                onChange={(e) => setCapA(e.target.value)}
                className="mt-1 w-full border rounded p-2"
              />
            </label>
          </div>

          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            登録する
          </button>
        </form>

        {/* 当日の登録済みイベント一覧（削除可） */}
        <div className="mt-6">
          <h3 className="font-semibold mb-2">{ymd} の登録済みイベント</h3>
          {todays.length === 0 ? (
            <p className="text-sm text-gray-500">この日には登録がありません。</p>
          ) : (
            <ul className="space-y-2">
              {todays.map((ev) => (
                <li
                  key={ev.id}
                  className="border rounded p-3 flex items-center justify-between bg-white"
                >
                  <div className="flex items-center gap-3">
                    {ev.icon ? <img src={ev.icon} alt="" className="w-6 h-6" /> : null}
                    <div>
                      <div className="font-medium">{ev.label}</div>
                      <div className="text-xs text-gray-500">
                        {ev.start_time}〜{ev.end_time}
                      </div>
                      {(ev.capacity_driver != null || ev.capacity_attendant != null) && (
                        <div className="text-xs text-gray-500 mt-1">
                          運転手枠: {ev.capacity_driver ?? "-"}　添乗員枠: {ev.capacity_attendant ?? "-"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1 rounded bg-red-600 text-white text-sm"
                      onClick={() => handleDelete(ev.id)}
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