// src/pages/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";

// 固定イベント（作成フォームで使用）
const FIXED_EVENTS = [
  { key: "grandgolf", label: "グランドゴルフ", icon: "/icons/grandgolf.png" },
  { key: "senior", label: "シニア体操", icon: "/icons/senior.png" },
  { key: "eat", label: "食べようの会", icon: "/icons/eat.png" },
  { key: "mamatomo", label: "ママ友の会", icon: "/icons/mamatomo.png" },
  { key: "cafe", label: "ベイタウンカフェ", icon: "/icons/cafe.png" },
  { key: "chorus", label: "コーラス", icon: "/icons/chorus.png" },
];

// ローカル日付の YYYY-MM-DD
const toLocalYMD = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// JSON/テキストどちらでも耐えるfetch
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

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

  // 応募者数（event_id => 合計人数）
  const [appCounts, setAppCounts] = useState({}); // { [id]: number }

  // ===== 権限チェック & イベント取得 =====
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です。");
      nav("/");
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/events");
      const arr = Array.isArray(r.data) ? r.data : [];
      setEvents(arr);
    } finally {
      setLoading(false);
    }
  };

  // ===== 今日以降のみ抽出（YYYY-MM-DD の文字列比較OK）=====
  const todayYMD = toLocalYMD(new Date());
  const upcoming = useMemo(() => {
    return (events || [])
      .filter((e) => e.date >= todayYMD)
      .sort((a, b) => (a.date === b.date ? (a.start_time || "").localeCompare(b.start_time || "") : a.date.localeCompare(b.date)));
  }, [events, todayYMD]);

  // ===== 表示中（今日以降）のイベントの応募者数をまとめて取得 =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // N本叩く（APIに集計がない前提）。重い場合はサーバ側に /api/applications/counts を作るのがベター。
      const pairs = await Promise.all(
        upcoming.map(async (ev) => {
          const r = await apiFetch(`/api/applications?event_id=${ev.id}`);
          const arr = Array.isArray(r.data) ? r.data : [];
          return [ev.id, arr.length];
        })
      );
      if (!cancelled) {
        const map = {};
        for (const [id, count] of pairs) map[id] = count;
        setAppCounts(map);
      }
    })();
    return () => { cancelled = true; };
  }, [upcoming]);

  // ===== イベント登録 =====
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const body = {
        date: toLocalYMD(selectedDate),
        label: selectedEvent.label,
        icon: selectedEvent.icon,
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
      await refresh();
    } catch (err) {
      alert(`登録に失敗しました: ${err.message}`);
    }
  };

  // ===== 応募者一覧（簡易表示）=====
  const openApplicants = async (ev) => {
    const r = await apiFetch(`/api/applications?event_id=${ev.id}`);
    const arr = Array.isArray(r.data) ? r.data : [];
    if (arr.length === 0) {
      alert(`${ev.date}「${ev.label}」の応募者はまだいません。`);
      return;
    }
    const lines = arr.map(a => `・${a.username}（${a.kind === "driver" ? "運転手" : "添乗員"}）`);
    alert(`${ev.date}「${ev.label}」応募者：\n${lines.join("\n")}`);
  };

  // ===== イベント削除 =====
  const handleDelete = async (id) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    try {
      // Vercel構成のDELETEは /api/events?id=xxx を推奨（/api/events/[id] がある場合はそちらでも可）
      const r = await apiFetch(`/api/events?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      await refresh();
      alert("削除しました");
    } catch (err) {
      alert(`削除に失敗しました: ${err.message}`);
    }
  };

  if (loading) return <div className="p-6">読み込み中…</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">🗓 管理者カレンダー</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav("/admin/users")}
              className="px-3 py-2 rounded-lg text-sm bg-gray-200 hover:bg-gray-300"
            >
              一般ユーザー管理
            </button>
            <button
              onClick={() => { localStorage.clear(); nav("/"); }}
              className="text-gray-500 underline"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* カレンダー（既存UIそのまま） */}
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

        {/* 募集作成フォーム（画像選択式） */}
        <form onSubmit={handleSubmit} className="mt-5 bg-gray-50 p-4 rounded-lg border">
          <h2 className="font-semibold mb-3">
            {toLocalYMD(selectedDate)} の募集を作成
          </h2>

          {/* アイコン選択（画像グリッド） */}
          <div className="mb-3">
            <div className="text-sm mb-2">イベント種類（画像から選択）</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {FIXED_EVENTS.map((ev) => {
                const active = selectedEvent.key === ev.key;
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

        {/* 今日以降のイベント一覧（👥バッジ付き・コンパクト行） */}
        <div className="mt-6">
          <h3 className="font-semibold mb-3 text-lg">📋 今日以降のイベント</h3>
          {upcoming.length === 0 ? (
            <p className="text-gray-500 text-sm">登録済みの今後のイベントはありません。</p>
          ) : (
            <div className="divide-y border rounded-lg overflow-hidden">
              {upcoming.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 px-3 py-2 bg-white"
                >
                  {/* 左：アイコン */}
                  {ev.icon ? (
                    <img
                      src={ev.icon}
                      alt={ev.label}
                      className="w-8 h-8 object-contain rounded bg-gray-50 border"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-gray-100 border flex items-center justify-center text-xs text-gray-500">
                      無
                    </div>
                  )}

                  {/* 中央：日付・時間・名称（コンパクト） */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{ev.date}</span>
                      <span className="text-xs text-gray-500">
                        {ev.start_time}〜{ev.end_time}
                      </span>
                      {/* 応募者バッジ */}
                      <span className="ml-1 inline-flex items-center text-[11px] px-2 py-[3px] rounded-full bg-emerald-100 text-emerald-700">
                        👥 {appCounts[ev.id] ?? 0}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 truncate">{ev.label}</div>
                  </div>

                  {/* 右：操作（横並び・小さめ） */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openApplicants(ev)}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                      title="応募者を見る"
                    >
                      応募者
                    </button>
                    <button
                      onClick={() => handleDelete(ev.id)}
                      className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700"
                      title="削除"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}