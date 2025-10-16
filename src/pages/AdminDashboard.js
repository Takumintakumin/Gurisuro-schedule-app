// src/pages/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";

// 500/HTMLにも耐える軽量 fetch
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data, text: "" };
  }
  let text = "";
  try { text = await res.text(); } catch {}
  return { ok: res.ok, status: res.status, data: {}, text };
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
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // 募集作成フォーム
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

  // 管理者認証
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
      const r = await apiFetch("/api/events");
      setEvents(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error("fetch events error:", e);
    } finally {
      setLoading(false);
    }
  };

  const ymd = toLocalYMD(selectedDate);
  const todays = useMemo(() => events.filter((e) => e.date === ymd), [events, ymd]);

  // 募集登録
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
        icon: selectedEvent?.icon || "",
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
      const r = await apiFetch(`/api/events?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      await refresh();
    } catch (err) {
      alert(`削除に失敗しました: ${err.message}`);
    }
  };

  // --- 応募状況取得：/api/fairness → ダメなら /api?path=fairness → それもダメなら /api/applications でフォールバック ---
  const openFairness = async (eventId) => {
    setFairOpen(true);
    setFairLoading(true);
    setFairError("");
    setFairData({ event_id: eventId, driver: [], attendant: [] });

    // 1) 正規ルート
    const tryFairness = async (url) => {
      const r = await apiFetch(url);
      if (!r.ok) throw new Error(r.data?.error || r.text || `HTTP ${r.status}`);
      return r.data;
    };

    try {
      let data = null;
      try {
        data = await tryFairness(`/api/fairness?event_id=${encodeURIComponent(eventId)}`);
      } catch (e1) {
        // 2) rewrite 環境用フォールバック
        data = await tryFairness(`/api?path=fairness&event_id=${encodeURIComponent(eventId)}`);
      }

      // 期待形 { driver:[], attendant:[] }
      setFairData({
        event_id: eventId,
        driver: Array.isArray(data.driver) ? data.driver : [],
        attendant: Array.isArray(data.attendant) ? data.attendant : [],
      });
    } catch (e) {
      // 3) 最後の保険：生応募を種別で分けて時系列ソートして見せる
      try {
        const r =
          (await apiFetch(`/api/applications?event_id=${encodeURIComponent(eventId)}`)).ok
            ? await apiFetch(`/api/applications?event_id=${encodeURIComponent(eventId)}`)
            : await apiFetch(`/api?path=applications&event_id=${encodeURIComponent(eventId)}`);

        const rows = Array.isArray(r.data) ? r.data : [];
        const driver = rows
          .filter((x) => x.kind === "driver")
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          .map((x, i) => ({
            username: x.username,
            kind: "driver",
            times: 0,
            last_at: null,
            applied_at: x.created_at,
            rank: i + 1,
          }));
        const attendant = rows
          .filter((x) => x.kind === "attendant")
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          .map((x, i) => ({
            username: x.username,
            kind: "attendant",
            times: 0,
            last_at: null,
            applied_at: x.created_at,
            rank: i + 1,
          }));

        setFairData({ event_id: eventId, driver, attendant });
        setFairError("公平スコア（v_participation）が使えないため、応募順の簡易表示です。");
      } catch (e2) {
        setFairError(e2.message || "応募状況の取得に失敗しました。");
      }
    } finally {
      setFairLoading(false);
    }
  };

  if (loading) return <div className="p-6">読み込み中…</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー（UIはそのまま） */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">🗓 管理者カレンダー</h1>
          <div className="flex gap-3">
            <button onClick={() => nav("/")} className="text-gray-600 underline" title="一般ログインへ">
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
            const nd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + delta, 1);
            setSelectedDate(nd);
          }}
          onDateSelect={(d) => setSelectedDate(d)}
          events={events}
        />

        {/* 募集作成フォーム（UI据え置き） */}
        <form onSubmit={handleSubmit} className="mt-5 bg-gray-50 p-4 rounded-lg border">
          <h2 className="font-semibold mb-3">{ymd} の募集を作成</h2>

          {/* 画像選択 */}
          <div className="mb-3">
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

          {/* 自由記入（優先） */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="自由記入（任意）"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              className="w-full border rounded p-2"
            />
            <p className="text-xs text-gray-500 mt-1">※自由記入がある場合は画像ラベルより優先されます</p>
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

        {/* 当日の登録済みイベント一覧 */}
        <div className="mt-6">
          <h3 className="font-semibold mb-2">{ymd} の登録済みイベント</h3>
          {todays.length === 0 ? (
            <p className="text-sm text-gray-500">この日には登録がありません。</p>
          ) : (
            <ul className="space-y-2">
              {todays.map((ev) => (
                <li key={ev.id} className="border rounded p-3 flex items-center justify-between bg-white">
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
                      className="px-3 py-1 rounded bg-indigo-600 text-white text-sm"
                      onClick={() => openFairness(ev.id)}
                    >
                      応募状況
                    </button>
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

        {/* 応募状況モーダル */}
        {fairOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 shadow-lg">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold">応募状況（イベントID: {fairData.event_id}）</h3>
                <button onClick={() => setFairOpen(false)} className="text-gray-500">✕</button>
              </div>

              {fairLoading ? (
                <p className="text-sm text-gray-500">読み込み中...</p>
              ) : fairError ? (
                <div className="text-sm text-red-600 mb-2">※ {fairError}</div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-1">運転手</h4>
                  {fairData.driver.length === 0 ? (
                    <p className="text-xs text-gray-500">応募なし</p>
                  ) : (
                    <ul className="space-y-1">
                      {fairData.driver.map((u) => (
                        <li key={`d-${u.username}-${u.rank}`} className="border rounded p-2 text-sm">
                          <div className="flex justify-between">
                            <span>#{u.rank} {u.username}</span>
                            <span className="text-xs text-gray-500">{u.times ?? 0}回</span>
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
                        <li key={`a-${u.username}-${u.rank}`} className="border rounded p-2 text-sm">
                          <div className="flex justify-between">
                            <span>#{u.rank} {u.username}</span>
                            <span className="text-xs text-gray-500">{u.times ?? 0}回</span>
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

            </div>
          </div>
        )}
      </div>
    </div>
  );
}