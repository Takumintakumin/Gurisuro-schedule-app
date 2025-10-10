// src/pages/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";

// JSON/text どちらも耐える fetch
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

  // 応募者モーダル用
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalApplicants, setModalApplicants] = useState([]); // [{id, username, kind, created_at}, ...]
  const [modalEvent, setModalEvent] = useState(null); // {id, label, icon, ...}

  // 作成フォーム（既存のまま）
  const FIXED_EVENTS = [
    { key: "grandgolf", label: "グランドゴルフ", icon: "/icons/grandgolf.png" },
    { key: "senior", label: "シニア体操", icon: "/icons/senior.png" },
    { key: "eat", label: "食べようの会", icon: "/icons/eat.png" },
    { key: "mamatomo", label: "ママ友の会", icon: "/icons/mamatomo.png" },
    { key: "cafe", label: "ベイタウンカフェ", icon: "/icons/cafe.png" },
    { key: "chorus", label: "コーラス", icon: "/icons/chorus.png" },
  ];
  const [selectedEventType, setSelectedEventType] = useState(FIXED_EVENTS[0]);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [capDriver, setCapDriver] = useState(1);
  const [capAttendant, setCapAttendant] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // イベント取得
  const fetchEvents = async () => {
    const { ok, data } = await apiFetch("/api/events");
    if (ok && Array.isArray(data)) setEvents(data);
  };

  useEffect(() => { fetchEvents(); }, []);

  // 選択日のイベント一覧
  const listOfSelected = useMemo(() => {
    const ymd = toLocalYMD(selectedDate);
    return events.filter((e) => e.date === ymd);
  }, [events, selectedDate]);

  // ====== イベント登録 ======
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!selectedEventType) return alert("イベント種類を選択してください。");
    setSubmitting(true);
    try {
      const body = {
        date: toLocalYMD(selectedDate),
        label: selectedEventType.label,
        icon: selectedEventType.icon,
        start_time: start,
        end_time: end,
        capacity_driver: Number(capDriver),
        capacity_attendant: Number(capAttendant),
      };
      const { ok, status, data } = await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!ok) throw new Error(data?.error || `HTTP ${status}`);
      await fetchEvents();
      alert("募集を登録しました！");
    } catch (err) {
      alert(`登録に失敗しました: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ====== 応募者モーダル（開く） ======
  const openApplicantsModal = async (ev) => {
    setModalEvent(ev);
    setModalApplicants([]);
    setModalError("");
    setModalLoading(true);
    setModalOpen(true);

    try {
      const { ok, status, data } = await apiFetch(`/api/applications?event_id=${ev.id}`);
      if (!ok) throw new Error(data?.error || `HTTP ${status}`);
      // 期待形：[{ id, event_id, username, kind, created_at }, ...]
      setModalApplicants(Array.isArray(data) ? data : []);
    } catch (err) {
      setModalError(err.message || "取得に失敗しました");
    } finally {
      setModalLoading(false);
    }
  };

  // ====== 応募者モーダル（閉じる） ======
  const closeApplicantsModal = () => {
    setModalOpen(false);
    setModalEvent(null);
    setModalApplicants([]);
    setModalError("");
  };

  // ====== イベント削除 ======
  // ※ Vercel 構成では /api/events DELETE に id はクエリで渡すと安全（405回避）
  const handleDelete = async (id) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    try {
      const { ok, status, data } = await apiFetch(`/api/events?id=${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!ok) throw new Error(data?.error || `HTTP ${status}`);
      await fetchEvents();
      if (modalOpen && modalEvent?.id === id) closeApplicantsModal();
      alert("削除しました");
    } catch (err) {
      alert(`削除に失敗しました: ${err.message}`);
    }
  };

  // 応募者を kind でグルーピング
  const grouped = useMemo(() => {
    const g = { driver: [], attendant: [], other: [] };
    for (const a of modalApplicants) {
      if (a.kind === "driver") g.driver.push(a);
      else if (a.kind === "attendant") g.attendant.push(a);
      else g.other.push(a);
    }
    return g;
  }, [modalApplicants]);

  // 残数を表示するための集計（簡易）
  const [counts, setCounts] = useState({});
  useEffect(() => {
    (async () => {
      const ymd = toLocalYMD(selectedDate);
      const todays = events.filter((e) => e.date === ymd);
      const out = {};
      for (const ev of todays) {
        const r = await apiFetch(`/api/applications?event_id=${ev.id}`);
        const arr = Array.isArray(r.data) ? r.data : [];
        out[ev.id] = {
          driver: arr.filter(a => a.kind === "driver").length,
          attendant: arr.filter(a => a.kind === "attendant").length,
        };
      }
      setCounts(out);
    })();
  }, [events, selectedDate]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">管理者ダッシュボード</h1>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = "/";
            }}
            className="text-sm text-blue-600 underline"
          >
            一般ログインへ / ログアウト
          </button>
        </div>

        {/* —— カレンダー（既存UIそのまま） —— */}
        <Calendar
          currentMonth={selectedDate.getMonth()}
          currentYear={selectedDate.getFullYear()}
          selectedDate={selectedDate}
          onMonthChange={(d) => {
            const nd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + d, 1);
            setSelectedDate(nd);
          }}
          onDateSelect={setSelectedDate}
          events={events}
        />

        {/* —— 募集登録フォーム（既存の簡易版） —— */}
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 font-semibold">
            {toLocalYMD(selectedDate)} に募集を追加
          </div>

          <label className="block">
            <div className="text-sm mb-1">イベント種類</div>
            <select
              className="border rounded px-2 py-2 w-full"
              value={selectedEventType.key}
              onChange={(e) =>
                setSelectedEventType(
                  FIXED_EVENTS.find((f) => f.key === e.target.value) || FIXED_EVENTS[0]
                )
              }
            >
              {FIXED_EVENTS.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-sm mb-1">開始</div>
            <input
              type="time"
              className="border rounded px-2 py-2 w-full"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>

          <label className="block">
            <div className="text-sm mb-1">終了</div>
            <input
              type="time"
              className="border rounded px-2 py-2 w-full"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>

          <label className="block">
            <div className="text-sm mb-1">運転手 募集枠</div>
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-2 w-full"
              value={capDriver}
              onChange={(e) => setCapDriver(e.target.value)}
            />
          </label>

          <label className="block">
            <div className="text-sm mb-1">添乗員 募集枠</div>
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-2 w-full"
              value={capAttendant}
              onChange={(e) => setCapAttendant(e.target.value)}
            />
          </label>

          <div className="sm:col-span-2">
            <button
              className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "登録中…" : "この内容で募集を登録"}
            </button>
          </div>
        </form>

        {/* —— 選択日の募集一覧 —— */}
        <div className="mt-6">
          <h2 className="font-semibold mb-2">{toLocalYMD(selectedDate)} の募集一覧</h2>
          {listOfSelected.length === 0 ? (
            <p className="text-sm text-gray-500">この日には募集がありません。</p>
          ) : (
            <ul className="space-y-2">
              {listOfSelected.map((ev) => {
                const c = counts[ev.id] || { driver: 0, attendant: 0 };
                return (
                  <li
                    key={ev.id}
                    className="border rounded p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {ev.icon ? <img src={ev.icon} alt="" className="w-7 h-7 flex-none" /> : null}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{ev.label}</div>
                        <div className="text-xs text-gray-500">
                          {ev.start_time}〜{ev.end_time}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex gap-3">
                          <span>運転手: {c.driver}{ev.capacity_driver!=null?` / ${ev.capacity_driver}`:""}</span>
                          <span>添乗員: {c.attendant}{ev.capacity_attendant!=null?` / ${ev.capacity_attendant}`:""}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="px-3 py-1 rounded bg-emerald-600 text-white text-sm"
                        onClick={() => openApplicantsModal(ev)}
                      >
                        応募者を見る
                      </button>
                      <button
                        className="px-3 py-1 rounded bg-red-600 text-white text-sm"
                        onClick={() => handleDelete(ev.id)}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ===== 応募者モーダル ===== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50">
          {/* 背景 */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeApplicantsModal}
          />
          {/* 本体 */}
          <div className="absolute inset-x-3 bottom-3 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-lg bg-white rounded-2xl shadow-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {modalEvent?.icon && (
                  <img src={modalEvent.icon} className="w-7 h-7" alt="" />
                )}
                <div>
                  <div className="font-semibold">
                    {toLocalYMD(selectedDate)} の応募者
                  </div>
                  {modalEvent && (
                    <div className="text-xs text-gray-500">
                      {modalEvent.label}（{modalEvent.start_time}〜{modalEvent.end_time}）
                    </div>
                  )}
                </div>
              </div>
              <button
                className="p-2 rounded hover:bg-gray-100"
                onClick={closeApplicantsModal}
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            <div className="mt-3">
              {modalLoading ? (
                <div className="text-sm text-gray-500">読み込み中…</div>
              ) : modalError ? (
                <div className="text-sm text-red-600">エラー: {modalError}</div>
              ) : modalApplicants.length === 0 ? (
                <div className="text-sm text-gray-500">応募者はいません。</div>
              ) : (
                <div className="space-y-3">
                  {/* 運転手 */}
                  <section>
                    <div className="text-sm font-semibold mb-1">運転手</div>
                    {grouped.driver.length === 0 ? (
                      <div className="text-xs text-gray-500">— なし —</div>
                    ) : (
                      <ul className="space-y-1">
                        {grouped.driver.map((a) => (
                          <li
                            key={a.id}
                            className="text-sm flex items-center justify-between border rounded px-2 py-1"
                          >
                            <span className="truncate">{a.username}</span>
                            <span className="text-xs text-gray-500">
                              {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* 添乗員 */}
                  <section>
                    <div className="text-sm font-semibold mb-1">添乗員</div>
                    {grouped.attendant.length === 0 ? (
                      <div className="text-xs text-gray-500">— なし —</div>
                    ) : (
                      <ul className="space-y-1">
                        {grouped.attendant.map((a) => (
                          <li
                            key={a.id}
                            className="text-sm flex items-center justify-between border rounded px-2 py-1"
                          >
                            <span className="truncate">{a.username}</span>
                            <span className="text-xs text-gray-500">
                              {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* その他（予防） */}
                  {grouped.other.length > 0 && (
                    <section>
                      <div className="text-sm font-semibold mb-1">その他</div>
                      <ul className="space-y-1">
                        {grouped.other.map((a) => (
                          <li
                            key={a.id}
                            className="text-sm flex items-center justify-between border rounded px-2 py-1"
                          >
                            <span className="truncate">{a.username}</span>
                            <span className="text-xs text-gray-500">{a.kind}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </div>

            {/* 下部アクション（任意で強化用） */}
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-100"
                onClick={closeApplicantsModal}
              >
                閉じる
              </button>
              {modalEvent && (
                <button
                  className="px-3 py-1 rounded bg-red-600 text-white"
                  onClick={() => handleDelete(modalEvent.id)}
                >
                  この募集を削除
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}