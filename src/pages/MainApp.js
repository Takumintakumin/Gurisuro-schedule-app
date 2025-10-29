// src/pages/MainApp.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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

export default function MainApp() {
  const nav = useNavigate();

  const userName = localStorage.getItem("userName") || "";
  const userRolePref = localStorage.getItem("userRolePref") || "両方"; // 任意（運転手/添乗員/両方）

  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [applying, setApplying] = useState(false);
  const [myApps, setMyApps] = useState([]); // 自分の応募

  // ---- ログアウト ----
  const handleLogout = () => {
    if (!window.confirm("ログアウトしますか？")) return;
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userRolePref");
    nav("/"); // 一般ログインへ戻る
  };

  // ---- イベント一覧 + 自分の応募一覧取得 ----
  const refresh = useCallback(async () => {
    const ev = await apiFetch("/api/events");
    setEvents(Array.isArray(ev.data) ? ev.data : []);

    if (userName) {
      const me = await apiFetch(`/api/applications?username=${encodeURIComponent(userName)}`);
      setMyApps(Array.isArray(me.data) ? me.data : []);
    } else {
      setMyApps([]);
    }
  }, [userName]);

  useEffect(() => { refresh(); }, [refresh]);

  const listOfSelected = useMemo(() => {
    const ymd = toLocalYMD(selectedDate);
    return events.filter((e) => e.date === ymd);
  }, [events, selectedDate]);

  // 残枠表示用にイベント別の応募数 + 確定済みメンバーをGET
  const [counts, setCounts] = useState({});
  const [decided, setDecided] = useState({}); // { eventId: { driver: string[], attendant: string[] } }
  useEffect(() => {
    (async () => {
      const ymd = toLocalYMD(selectedDate);
      const todays = events.filter((e) => e.date === ymd);
      const out = {};
      const decOut = {};
      for (const ev of todays) {
        // 応募数
        const r = await apiFetch(`/api/applications?event_id=${ev.id}`);
        const arr = Array.isArray(r.data) ? r.data : [];
        out[ev.id] = {
          driver: arr.filter(a => a.kind === "driver").length,
          attendant: arr.filter(a => a.kind === "attendant").length,
          raw: arr,
        };
        
        // 確定済みメンバー
        try {
          const dec = await apiFetch(`/api?path=decide&event_id=${ev.id}`);
          if (dec.ok && dec.data) {
            decOut[ev.id] = {
              driver: Array.isArray(dec.data.driver) ? dec.data.driver : [],
              attendant: Array.isArray(dec.data.attendant) ? dec.data.attendant : [],
            };
          } else {
            decOut[ev.id] = { driver: [], attendant: [] };
          }
        } catch {
          decOut[ev.id] = { driver: [], attendant: [] };
        }
      }
      setCounts(out);
      setDecided(decOut);
    })();
  }, [events, selectedDate]);

  const hasApplied = (eventId, kind) =>
    myApps.some((a) => a.event_id === eventId && a.kind === kind);

  const apply = async (ev, kind) => {
    if (!userName) {
      alert("先にログインしてください。");
      return;
    }
    
    // 確定済みチェック
    const dec = decided[ev.id] || { driver: [], attendant: [] };
    const isDecided = (kind === "driver" ? dec.driver : dec.attendant).includes(userName);
    if (isDecided) {
      alert("このイベントは既に確定済みです。応募を取り消すことはできません。");
      return;
    }
    
    // 確定済みメンバーがいる場合、新規応募を制限
    const hasDecidedMembers = (kind === "driver" ? dec.driver : dec.attendant).length > 0;
    if (hasDecidedMembers) {
      alert("このイベントは既に確定済みメンバーがいます。新規応募はできません。");
      return;
    }
    
    setApplying(true);
    try {
      const { ok, status, data } = await apiFetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: ev.id, username: userName, kind }),
      });
      if (!ok) throw new Error(data?.error || `HTTP ${status}`);
      await refresh();
      alert("応募しました！");
    } catch (e) {
      alert(`応募に失敗しました: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  const cancel = async (ev, kind) => {
    if (!userName) return;
    if (!window.confirm("応募を取り消しますか？")) return;
    setApplying(true);
    try {
      const url = `/api/applications?event_id=${encodeURIComponent(ev.id)}&username=${encodeURIComponent(userName)}&kind=${encodeURIComponent(kind)}`;
      const { ok, status, data } = await apiFetch(url, { method: "DELETE" });
      if (!ok) throw new Error(data?.error || `HTTP ${status}`);
      await refresh();
      alert("応募を取り消しました。");
    } catch (e) {
      alert(`取り消しに失敗しました: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー（ログアウト追加） */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold">グリスロ予定調整アプリ</h1>
          <div className="flex items-center gap-3">
            {userName && <span className="text-sm text-gray-600">ログイン中：{userName}</span>}
            <button
              onClick={handleLogout}
              className="px-3 py-1 rounded bg-red-500 text-white text-sm hover:bg-red-600"
            >
              ログアウト
            </button>
          </div>
        </div>

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

        <div className="mt-4">
          <h2 className="font-semibold mb-2">{toLocalYMD(selectedDate)} の募集</h2>
          {listOfSelected.length === 0 ? (
            <p className="text-sm text-gray-500">この日には募集がありません。</p>
          ) : (
            <ul className="space-y-2">
              {listOfSelected.map((ev) => {
                const c = counts[ev.id] || { driver: 0, attendant: 0 };
                const dec = decided[ev.id] || { driver: [], attendant: [] };
                const remainDriver =
                  ev.capacity_driver != null ? Math.max(0, ev.capacity_driver - c.driver) : null;
                const remainAtt =
                  ev.capacity_attendant != null ? Math.max(0, ev.capacity_attendant - c.attendant) : null;

                const appliedDriver = hasApplied(ev.id, "driver");
                const appliedAtt    = hasApplied(ev.id, "attendant");
                
                const hasDecidedDriver = dec.driver.length > 0;
                const hasDecidedAttendant = dec.attendant.length > 0;
                const isDecidedDriver = dec.driver.includes(userName);
                const isDecidedAttendant = dec.attendant.includes(userName);

                return (
                  <li key={ev.id} className="border rounded p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {ev.icon ? <img src={ev.icon} alt="" className="w-6 h-6" /> : null}
                      <div>
                        <div className="font-medium">{ev.label}</div>
                        <div className="text-xs text-gray-500">
                          {ev.start_time}〜{ev.end_time}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          運転手: {c.driver}{ev.capacity_driver!=null?` / ${ev.capacity_driver}`:""}
                          {remainDriver!=null?`（残り ${remainDriver}）`:""}
                          {hasDecidedDriver && (
                            <span className="text-blue-600 font-semibold">
                              【確定: {dec.driver.join(", ")}】
                            </span>
                          )}
                          {isDecidedDriver && (
                            <span className="text-green-600 font-semibold ml-1">✓ あなたが確定済み</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          添乗員: {c.attendant}{ev.capacity_attendant!=null?` / ${ev.capacity_attendant}`:""}
                          {remainAtt!=null?`（残り ${remainAtt}）`:""}
                          {hasDecidedAttendant && (
                            <span className="text-blue-600 font-semibold">
                              【確定: {dec.attendant.join(", ")}】
                            </span>
                          )}
                          {isDecidedAttendant && (
                            <span className="text-green-600 font-semibold ml-1">✓ あなたが確定済み</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {["運転手","両方"].includes(userRolePref) && (
                        isDecidedDriver ? (
                          <button
                            className="px-3 py-1 rounded bg-green-200 text-green-800 text-sm"
                            disabled
                          >
                            確定済み（運転手）
                          </button>
                        ) : appliedDriver ? (
                          <button
                            className="px-3 py-1 rounded bg-gray-200 text-gray-700 text-sm"
                            disabled={applying || hasDecidedDriver}
                            onClick={() => cancel(ev, "driver")}
                          >
                            応募取消（運転手）
                          </button>
                        ) : (
                          <button
                            className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                            disabled={applying || remainDriver===0 || hasDecidedDriver}
                            onClick={() => apply(ev, "driver")}
                          >
                            運転手で応募
                          </button>
                        )
                      )}
                      {["添乘員","両方"].includes(userRolePref) && (
                        isDecidedAttendant ? (
                          <button
                            className="px-3 py-1 rounded bg-green-200 text-green-800 text-sm"
                            disabled
                          >
                            確定済み（添乗員）
                          </button>
                        ) : appliedAtt ? (
                          <button
                            className="px-3 py-1 rounded bg-gray-200 text-gray-700 text-sm"
                            disabled={applying || hasDecidedAttendant}
                            onClick={() => cancel(ev, "attendant")}
                          >
                            応募取消（添乗員）
                          </button>
                        ) : (
                          <button
                            className="px-3 py-1 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
                            disabled={applying || remainAtt===0 || hasDecidedAttendant}
                            onClick={() => apply(ev, "attendant")}
                          >
                            添乗員で応募
                          </button>
                        )
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}