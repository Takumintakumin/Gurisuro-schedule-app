// src/pages/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";

// === JSON/HTMLどちらでも耐える fetch ===
async function apiFetchSafe(url, options = {}) {
  const res = await fetch(url, options);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }
  // 非JSON（500のHTML等）
  let text = "";
  try { text = await res.text(); } catch {}
  return { ok: res.ok, status: res.status, data: { error: text?.slice(0, 200) || "非JSONレスポンス" } };
}

// 固定イベント画像一覧（UIは変更しない）
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
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // 募集フォーム（UIそのまま）
  const [selectedEvent, setSelectedEvent] = useState(FIXED_EVENTS[0]);
  const [customLabel, setCustomLabel] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [capD, setCapD] = useState(1);
  const [capA, setCapA] = useState(1);

  // 応募状況モーダル
  const [fairOpen, setFairOpen] = useState(false);
  const [fairLoading, setFairLoading] = useState(false);
  const [fairError, setFairError] = useState("");
  const [fairData, setFairData] = useState({ event_id: null, driver: [], attendant: [] });

  // 認可
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/");
      return;
    }
    refresh();
  }, [nav]);

  // イベント取得
  const refresh = async () => {
    setLoading(true);
    try {
      const r = await apiFetchSafe("/api/events");
      setEvents(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const ymd = toLocalYMD(selectedDate);
  const todays = useMemo(() => events.filter((e) => e.date === ymd), [events, ymd]);

  // イベント登録（機能のみ強化、UI不変）
  const handleSubmit = async (e) => {
    e.preventDefault();
    const label = (customLabel || "").trim() || (selectedEvent?.label || "");
    if (!label) return alert("イベント名を入力または画像を選択してください。");

    const nCapD = Number(capD);
    const nCapA = Number(capA);

    try {
      const body = {
        date: ymd,
        label,
        icon: selectedEvent?.icon || "",
        start_time: start,
        end_time: end,
        capacity_driver: Number.isFinite(nCapD) ? nCapD : null,
        capacity_attendant: Number.isFinite(nCapA) ? nCapA : null,
      };
      const r = await apiFetchSafe("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      alert("登録しました");
      setCustomLabel("");
      await refresh();
    } catch (err) {
      alert(`登録に失敗しました: ${err.message}`);
    }
  };

  // イベント削除（URLクエリDELETE方式）
  const handleDelete = async (id) => {
    if (!window.confirm("削除しますか？")) return;
    try {
      const r = await apiFetchSafe(`/api/events?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      await refresh();
    } catch (err) {
      alert(`削除に失敗しました: ${err.message}`);
    }
  };

  // 公平スコア順モーダル（機能追加、UIは既存のまま）
  const openFairness = async (eventId) => {
    setFairOpen(true);
    setFairLoading(true);
    setFairError("");
    try {
      const { ok, status, data } = await apiFetchSafe(`/api/fairness?event_id=${encodeURIComponent(eventId)}`);
      if (!ok) throw new Error(data?.error || `HTTP ${status}`);
      setFairData({ event_id: eventId, driver: data.driver || [], attendant: data.attendant || [] });
    } catch (e) {
      setFairError(e.message || "取得失敗");
    } finally {
      setFairLoading(false);
    }
  };

  if (loading) return <div className="p-6">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー（UIそのまま） */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">🗓 管理者カレンダー</h1>
          <div className="flex gap-3">
            <button onClick={() => nav("/")} className="text-gray-600 underline">一般ログインへ</button>
            <button
              onClick={() => { localStorage.clear(); nav("/"); }}
              className="text-gray-600 underline"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* カレンダー（UI変更なし） */}
        <Calendar
          currentMonth={selectedDate.getMonth()}
          currentYear={selectedDate.getFullYear()}
          selectedDate={selectedDate}
          onMonthChange={(d) =>
            setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + d, 1))
          }
          onDateSelect={setSelectedDate}
          events={events}
        />

        {/* 募集登録フォーム（UIそのまま、機能だけ強化） */}
        <form onSubmit={handleSubmit} className="mt-5 bg-gray-50 p-4 rounded-lg border">
          <h2 className="font-semibold mb-3">{ymd} の募集を作成</h2>

          {/* 画像ボタン：再タップで解除（トグル） */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
            {FIXED_EVENTS.map((ev) => {
              const active = selectedEvent?.key === ev.key;
              return (
                <button
                  key={ev.key}
                  type="button"
                  onClick={() => setSelectedEvent(active ? null : ev)}
                  className={`flex flex-col items-center border rounded p-2 ${
                    active ? "ring-2 ring-blue-500" : ""
                  }`}
                  aria-pressed={active}
                >
                  <img
                    src={ev.icon}
                    alt={ev.label}
                    className="w-10 h-10"
                    onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                  />
                  <span className="text-xs">{ev.label}</span>
                </button>
              );
            })}
          </div>

          <input
            type="text"
            placeholder="自由記入（任意）"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            className="w-full border rounded p-2 mb-3"
          />

          <div className="grid grid-cols-2 gap-3 mb-3">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded p-2" />
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded p-2" />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <input
              type="number"
              value={capD}
              onChange={(e) => setCapD(e.target.value)}
              className="border rounded p-2"
              placeholder="運転手枠"
              inputMode="numeric"
            />
            <input
              type="number"
              value={capA}
              onChange={(e) => setCapA(e.target.value)}
              className="border rounded p-2"
              placeholder="添乗員枠"
              inputMode="numeric"
            />
          </div>

          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">登録する</button>
        </form>

        {/* 登録済みイベント一覧（UIは同じ、操作は追加） */}
        <div className="mt-6">
          <h3 className="font-semibold mb-2">{ymd} の登録済みイベント</h3>
          {todays.length === 0 ? (
            <p className="text-sm text-gray-500">この日には登録がありません。</p>
          ) : (
            <ul className="space-y-2">
              {todays.map((ev) => (
                <li key={ev.id} className="border rounded p-3 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-3">
                    {ev.icon && <img src={ev.icon} alt="" className="w-6 h-6" />}
                    <div>
                      <div className="font-medium">{ev.label}</div>
                      <div className="text-xs text-gray-500">
                        {ev.start_time}〜{ev.end_time}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1 bg-indigo-600 text-white text-sm rounded"
                      onClick={() => openFairness(ev.id)}
                    >
                      応募状況
                    </button>
                    <button
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded"
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

        {/* === 応募状況モーダル（UIほぼ同じ、外側クリックで閉じる） === */}
        {fairOpen && (
          <div
            className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) setFairOpen(false);
            }}
          >
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 shadow-lg">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold">公平スコア順（イベントID: {fairData.event_id}）</h3>
                <button onClick={() => setFairOpen(false)} className="text-gray-500">✕</button>
              </div>

              {fairLoading ? (
                <p className="text-sm text-gray-500">読み込み中...</p>
              ) : fairError ? (
                <p className="text-sm text-red-600">エラー: {fairError}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-1">運転手</h4>
                    {fairData.driver.length === 0 ? (
                      <p className="text-xs text-gray-500">応募なし</p>
                    ) : (
                      <ul className="space-y-1">
                        {fairData.driver.map((u) => (
                          <li key={`d-${u.username}`} className="border rounded p-2 text-sm">
                            <div className="flex justify-between">
                              <span>#{u.rank} {u.username}</span>
                              <span className="text-xs text-gray-500">{u.times}回</span>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              最終: {u.last_at ? new Date(u.last_at).toLocaleDateString() : "なし"}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">添乗員</h4>
                    {fairData.attendant.length === 0 ? (
                      <p className="text-xs text-gray-500">応募なし</p>
                    ) : (
                      <ul className="space-y-1">
                        {fairData.attendant.map((u) => (
                          <li key={`a-${u.username}`} className="border rounded p-2 text-sm">
                            <div className="flex justify-between">
                              <span>#{u.rank} {u.username}</span>
                              <span className="text-xs text-gray-500">{u.times}回</span>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              最終: {u.last_at ? new Date(u.last_at).toLocaleDateString() : "なし"}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}