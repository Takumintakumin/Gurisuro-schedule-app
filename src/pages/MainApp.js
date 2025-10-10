// src/pages/MainApp.js
import React, { useEffect, useMemo, useState } from "react";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";
import React, { useEffect, useMemo, useState, useCallback } from "react";

// JSON/text どちらも耐える fetch
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

export default function MainApp() {
  const userName = localStorage.getItem("userName") || "";
  const userRolePref = localStorage.getItem("userRolePref") || "両方"; // 任意（運転手/添乗員/両方）

  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [applying, setApplying] = useState(false);
  const [myApps, setMyApps] = useState([]); // 自分の応募

  // イベント一覧 + 自分の応募一覧取得
const refresh = useCallback(async () => {
  const ev = await apiFetch("/api/events");
  setEvents(Array.isArray(ev.data) ? ev.data : []);

  if (userName) {
    const me = await apiFetch(`/api/applications?username=${encodeURIComponent(userName)}`);
    setMyApps(Array.isArray(me.data) ? me.data : []);
  }
}, [userName]);

  const listOfSelected = useMemo(() => {
    const ymd = toLocalYMD(selectedDate);
    return events.filter((e) => e.date === ymd);
  }, [events, selectedDate]);

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
          raw: arr,
        };
      }
      setCounts(out);
    })();
  }, [events, selectedDate]);

  const hasApplied = (eventId, kind) =>
    myApps.some((a) => a.event_id === eventId && a.kind === kind);

  const apply = async (ev, kind) => {
    if (!userName) {
      alert("先にログインしてください。");
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

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        <h1 className="text-xl font-bold mb-4">グリスロ予定調整アプリ</h1>

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
                const remainDriver =
                  ev.capacity_driver != null ? Math.max(0, ev.capacity_driver - c.driver) : null;
                const remainAtt =
                  ev.capacity_attendant != null ? Math.max(0, ev.capacity_attendant - c.attendant) : null;

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
                          添乗員: {c.attendant}{ev.capacity_attendant!=null?` / ${ev.capacity_attendant}`:""}
                          {remainAtt!=null?`（残り ${remainAtt}）`:""}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {["運転手","両方"].includes(userRolePref) && (
                        <button
                          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                          disabled={applying || hasApplied(ev.id,"driver") || remainDriver===0}
                          onClick={() => apply(ev, "driver")}
                          title={hasApplied(ev.id,"driver") ? "既に応募済み" : ""}
                        >
                          運転手で応募
                        </button>
                      )}
                      {["添乗員","両方"].includes(userRolePref) && (
                        <button
                          className="px-3 py-1 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
                          disabled={applying || hasApplied(ev.id,"attendant") || remainAtt===0}
                          onClick={() => apply(ev, "attendant")}
                          title={hasApplied(ev.id,"attendant") ? "既に応募済み" : ""}
                        >
                          添乗員で応募
                        </button>
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