// src/pages/MainApp.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";

// JSON/text どちらも耐える fetch
async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
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
  const [activeTab, setActiveTab] = useState("calendar"); // "calendar" | "notifications" | "mypage"
  const [myApps, setMyApps] = useState([]); // 自分の応募
  const [notifications, setNotifications] = useState([]); // 通知一覧
  const [applicationHistory, setApplicationHistory] = useState([]); // 応募履歴（イベント情報込み）
  const [userSettings, setUserSettings] = useState({
    notifications_enabled: true,
    google_calendar_enabled: false,
    google_calendar_id: null,
  });

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

  // ---- 通知一覧取得 ----
  const refreshNotifications = useCallback(async () => {
    if (!userName) return;
    const r = await apiFetch(`/api?path=notifications`);
    if (r.ok && Array.isArray(r.data)) {
      setNotifications(r.data);
    }
  }, [userName]);

  useEffect(() => {
    if (activeTab === "notifications") {
      refreshNotifications();
    }
  }, [activeTab, refreshNotifications]);

  // ---- ユーザー設定取得 ----
  const refreshUserSettings = useCallback(async () => {
    if (!userName) return;
    const r = await apiFetch(`/api?path=user-settings`);
    if (r.ok && r.data) {
      setUserSettings({
        notifications_enabled: r.data.notifications_enabled !== false,
        google_calendar_enabled: r.data.google_calendar_enabled === true,
        google_calendar_id: r.data.google_calendar_id || null,
      });
    }
  }, [userName]);

  // ---- 応募履歴取得 ----
  const refreshApplicationHistory = useCallback(async () => {
    if (!userName) {
      setApplicationHistory([]);
      return;
    }
    try {
      // 応募一覧を取得
      const appsRes = await apiFetch(`/api/applications?username=${encodeURIComponent(userName)}`);
      if (!appsRes.ok || !Array.isArray(appsRes.data)) {
        setApplicationHistory([]);
        return;
      }

      // イベント情報を取得
      const eventsRes = await apiFetch("/api/events");
      const allEvents = Array.isArray(eventsRes.data) ? eventsRes.data : [];
      const eventsMap = {};
      for (const ev of allEvents) {
        eventsMap[ev.id] = ev;
      }

      // 確定情報を取得
      const historyWithDetails = await Promise.all(
        appsRes.data.map(async (app) => {
          const ev = eventsMap[app.event_id];
          let isDecided = false;
          try {
            const decRes = await apiFetch(`/api?path=decide&event_id=${app.event_id}`);
            if (decRes.ok && decRes.data) {
              const decidedList = decRes.data[app.kind] || [];
              isDecided = decidedList.includes(userName);
            }
          } catch {}

          return {
            ...app,
            event: ev || null,
            isDecided,
          };
        })
      );

      // 日付でソート（新しい順）
      historyWithDetails.sort((a, b) => {
        if (!a.event || !b.event) return 0;
        if (a.event.date !== b.event.date) {
          return b.event.date.localeCompare(a.event.date);
        }
        return new Date(b.created_at) - new Date(a.created_at);
      });

      setApplicationHistory(historyWithDetails);
    } catch (e) {
      console.error("application history fetch error:", e);
      setApplicationHistory([]);
    }
  }, [userName]);

  useEffect(() => {
    if (activeTab === "mypage") {
      refreshUserSettings();
      refreshApplicationHistory();
    }
  }, [activeTab, refreshUserSettings, refreshApplicationHistory]);

  // ---- 通知を既読にする ----
  const markAsRead = async (id) => {
    try {
      await apiFetch(`/api?path=notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await refreshNotifications();
    } catch (e) {
      console.error("既読処理エラー:", e);
    }
  };

  // ---- ユーザー設定を保存 ----
  const saveUserSettings = async () => {
    try {
      await apiFetch(`/api?path=user-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userSettings),
      });
      alert("設定を保存しました");
    } catch (e) {
      alert(`設定の保存に失敗しました: ${e.message}`);
    }
  };

  const listOfSelected = useMemo(() => {
    const ymd = toLocalYMD(selectedDate);
    return events.filter((e) => e.date === ymd);
  }, [events, selectedDate]);

  // 残枠表示用にイベント別の応募数 + 確定済みメンバーをGET
  const [counts, setCounts] = useState({});
  const [decided, setDecided] = useState({}); // { eventId: { driver: string[], attendant: string[] } }
  const [decidedDates, setDecidedDates] = useState(new Set()); // 確定済みの日付のSet
  useEffect(() => {
    (async () => {
      const ymd = toLocalYMD(selectedDate);
      const todays = events.filter((e) => e.date === ymd);
      const out = {};
      const decOut = {};
      const decDateSet = new Set();
      
      // すべてのイベントをチェックして、自分が確定済みの日付を集計
      for (const ev of events) {
        try {
          const dec = await apiFetch(`/api?path=decide&event_id=${ev.id}`);
          if (dec.ok && dec.data) {
            // 自分が確定済みかチェック
            const isMyDecided = 
              (dec.data.driver && Array.isArray(dec.data.driver) && dec.data.driver.includes(userName)) ||
              (dec.data.attendant && Array.isArray(dec.data.attendant) && dec.data.attendant.includes(userName));
            
            if (isMyDecided) {
              decDateSet.add(ev.date);
            }
            
            // 当日のイベントかチェック（オブジェクトの比較ではなくIDで比較）
            const isTodayEvent = todays.some(e => e.id === ev.id);
            if (isTodayEvent) {
              decOut[ev.id] = {
                driver: Array.isArray(dec.data.driver) ? dec.data.driver : [],
                attendant: Array.isArray(dec.data.attendant) ? dec.data.attendant : [],
              };
            }
          }
        } catch {}
      }
      
      for (const ev of todays) {
        // 応募数
        const r = await apiFetch(`/api/applications?event_id=${ev.id}`);
        const arr = Array.isArray(r.data) ? r.data : [];
        out[ev.id] = {
          driver: arr.filter(a => a.kind === "driver").length,
          attendant: arr.filter(a => a.kind === "attendant").length,
          raw: arr,
        };
        
        // 確定済みメンバー（既に取得済みでない場合）
        if (!decOut[ev.id]) {
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
      }
      setCounts(out);
      setDecided(decOut);
      setDecidedDates(decDateSet);
      // デバッグ: 確定済み日付を確認
      if (decDateSet.size > 0) {
        console.log('[MainApp] 自分の確定済み日付:', Array.from(decDateSet), 'userName:', userName);
      }
    })();
  }, [events, selectedDate, userName]);

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
      if (!ok) {
        throw new Error(data?.error || `HTTP ${status}`);
      }
      await refresh();
      alert("応募しました！");
    } catch (e) {
      alert(`応募に失敗しました: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  // 確定後のキャンセル
  const cancelDecided = async (ev, kind) => {
    if (!userName) return;
    if (!window.confirm("確定済みのシフトをキャンセルしますか？通常の応募者から自動で繰り上げで確定される可能性があります。")) return;
    setApplying(true);
    try {
      const { ok, status, data } = await apiFetch("/api?path=cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: ev.id, kind }),
      });
      if (!ok) {
        throw new Error(data?.error || `HTTP ${status}`);
      }
      await refresh();
      alert("キャンセルが完了しました。");
    } catch (e) {
      alert(`キャンセルに失敗しました: ${e.message}`);
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

  // 未読通知数
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read_at).length;
  }, [notifications]);

  // 通知タブの内容
  const renderNotificationsTab = () => (
    <div>
      <h2 className="font-semibold mb-4">通知一覧</h2>
      {notifications.length === 0 ? (
        <p className="text-sm text-gray-500">通知はありません。</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`border rounded p-3 ${!n.read_at ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-sm font-medium">{n.message}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(n.created_at).toLocaleString('ja-JP')}
                  </div>
                </div>
                {!n.read_at && (
                  <button
                    onClick={() => markAsRead(n.id)}
                    className="ml-2 px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    既読
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // マイページタブの内容
  const renderMypageTab = () => (
    <div>
      <h2 className="font-semibold mb-4">マイページ</h2>
      
      {/* アカウント情報 */}
      <div className="mb-6">
        <h3 className="font-semibold mb-2">アカウント情報</h3>
        <div className="border rounded p-3 bg-gray-50">
          <div className="text-sm">
            <div className="mb-2">
              <span className="font-medium">ユーザー名:</span> {userName}
            </div>
            <div>
              <span className="font-medium">役割設定:</span> {userRolePref}
            </div>
          </div>
        </div>
      </div>

      {/* 通知設定 */}
      <div className="mb-6">
        <h3 className="font-semibold mb-2">通知設定</h3>
        <div className="border rounded p-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={userSettings.notifications_enabled}
              onChange={(e) => setUserSettings({ ...userSettings, notifications_enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm">確定通知を有効にする</span>
          </label>
        </div>
      </div>

      {/* Googleカレンダー同期設定 */}
      <div className="mb-6">
        <h3 className="font-semibold mb-2">Googleカレンダー同期設定</h3>
        <div className="border rounded p-3 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={userSettings.google_calendar_enabled}
              onChange={(e) => setUserSettings({ ...userSettings, google_calendar_enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm">Googleカレンダーと同期する</span>
          </label>
          {userSettings.google_calendar_enabled && (
            <div>
              <label className="block text-sm font-medium mb-1">カレンダーID（オプション）</label>
              <input
                type="text"
                value={userSettings.google_calendar_id || ""}
                onChange={(e) => setUserSettings({ ...userSettings, google_calendar_id: e.target.value })}
                placeholder="your-calendar-id@group.calendar.google.com"
                className="w-full border rounded p-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Googleカレンダーとの同期機能は今後実装予定です。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 応募履歴 */}
      <div className="mb-6">
        <h3 className="font-semibold mb-2">応募履歴</h3>
        {applicationHistory.length === 0 ? (
          <p className="text-sm text-gray-500 border rounded p-3">応募履歴はありません。</p>
        ) : (
          <div className="space-y-2">
            {applicationHistory.map((app) => {
              if (!app.event) return null;
              const kindLabel = app.kind === "driver" ? "運転手" : "添乗員";
              const kindEmoji = app.kind === "driver" ? "🚗" : "👤";
              
              return (
                <div
                  key={`${app.id}-${app.kind}`}
                  className={`border rounded p-3 ${
                    app.isDecided ? "bg-green-50 border-green-200" : "bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {app.event.icon && (
                          <img src={app.event.icon} alt="" className="w-5 h-5 object-contain" />
                        )}
                        <span className="font-medium text-sm">{app.event.label}</span>
                      </div>
                      <div className="text-xs text-gray-600 mb-1">
                        {app.event.date} {app.event.start_time}〜{app.event.end_time}
                      </div>
                      <div className="text-xs">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${
                          app.isDecided ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                        }`}>
                          {kindEmoji} {kindLabel}
                          {app.isDecided && " ✓ 確定済み"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        応募日: {new Date(app.created_at).toLocaleString('ja-JP')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={saveUserSettings}
        className="w-full px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        設定を保存
      </button>
    </div>
  );

  return (
    <>
    <div 
      className="min-h-screen bg-gray-50"
      style={{ 
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
        marginBottom: 0
      }}
    >
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

        {/* タブコンテンツ */}
        {activeTab === "calendar" && (
          <>
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
              decidedDates={decidedDates}
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
                                className="px-3 py-1 rounded bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
                                disabled={applying}
                                onClick={() => cancelDecided(ev, "driver")}
                              >
                                キャンセル（運転手）
                              </button>
                            ) : appliedDriver ? (
                              <button
                                className="px-3 py-1 rounded bg-gray-200 text-gray-700 text-sm hover:bg-gray-300"
                                disabled={applying}
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
                                className="px-3 py-1 rounded bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
                                disabled={applying}
                                onClick={() => cancelDecided(ev, "attendant")}
                              >
                                キャンセル（添乗員）
                              </button>
                            ) : appliedAtt ? (
                              <button
                                className="px-3 py-1 rounded bg-gray-200 text-gray-700 text-sm hover:bg-gray-300"
                                disabled={applying}
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
          </>
        )}
        {activeTab === "notifications" && renderNotificationsTab()}
        {activeTab === "mypage" && renderMypageTab()}
      </div>
    </div>

    {/* 固定タブバー */}
    <div 
      id="main-tab-bar"
      style={{ 
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        minHeight: '64px',
        backgroundColor: '#ffffff',
        borderTop: '2px solid #d1d5db',
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -1px rgba(0, 0, 0, 0.06)',
        WebkitBoxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -1px rgba(0, 0, 0, 0.06)',
        zIndex: 99999,
        display: 'flex',
        WebkitDisplay: 'flex',
        alignItems: 'center',
        WebkitAlignItems: 'center',
        visibility: 'visible',
        opacity: 1,
        WebkitTransform: 'translateZ(0)',
        transform: 'translateZ(0)',
        willChange: 'transform',
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
        <div style={{ 
          maxWidth: '896px', 
          margin: '0 auto', 
          display: 'grid', 
          WebkitDisplay: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr', 
          WebkitGridTemplateColumns: '1fr 1fr 1fr',
          width: '100%', 
          height: '100%', 
          minHeight: '64px' 
        }}>
          <button
            onClick={() => setActiveTab("calendar")}
            style={{
              display: 'flex',
              WebkitDisplay: 'flex',
              flexDirection: 'column',
              WebkitFlexDirection: 'column',
              alignItems: 'center',
              WebkitAlignItems: 'center',
              justifyContent: 'center',
              WebkitJustifyContent: 'center',
              marginBottom: '4px',
              padding: '12px 16px',
              backgroundColor: activeTab === "calendar" ? '#dbeafe' : 'transparent',
              color: activeTab === "calendar" ? '#2563eb' : '#4b5563',
              fontWeight: activeTab === "calendar" ? '600' : '400',
              border: 'none',
              cursor: 'pointer',
              WebkitTransition: 'all 0.2s',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== "calendar") {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== "calendar") {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span style={{ fontSize: '12px', fontWeight: '500' }}>カレンダー</span>
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            style={{
              display: 'flex',
              WebkitDisplay: 'flex',
              flexDirection: 'column',
              WebkitFlexDirection: 'column',
              alignItems: 'center',
              WebkitAlignItems: 'center',
              justifyContent: 'center',
              WebkitJustifyContent: 'center',
              marginBottom: '4px',
              padding: '12px 16px',
              backgroundColor: activeTab === "notifications" ? '#dbeafe' : 'transparent',
              color: activeTab === "notifications" ? '#2563eb' : '#4b5563',
              fontWeight: activeTab === "notifications" ? '600' : '400',
              border: 'none',
              cursor: 'pointer',
              WebkitTransition: 'all 0.2s',
              transition: 'all 0.2s',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== "notifications") {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== "notifications") {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span style={{ fontSize: '12px', fontWeight: '500' }}>通知</span>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: '8px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                fontSize: '10px',
                borderRadius: '10px',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600'
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("mypage")}
            style={{
              display: 'flex',
              WebkitDisplay: 'flex',
              flexDirection: 'column',
              WebkitFlexDirection: 'column',
              alignItems: 'center',
              WebkitAlignItems: 'center',
              justifyContent: 'center',
              WebkitJustifyContent: 'center',
              marginBottom: '4px',
              padding: '12px 16px',
              backgroundColor: activeTab === "mypage" ? '#dbeafe' : 'transparent',
              color: activeTab === "mypage" ? '#2563eb' : '#4b5563',
              fontWeight: activeTab === "mypage" ? '600' : '400',
              border: 'none',
              cursor: 'pointer',
              WebkitTransition: 'all 0.2s',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== "mypage") {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== "mypage") {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span style={{ fontSize: '12px', fontWeight: '500' }}>マイページ</span>
          </button>
        </div>
      </div>
    </>
  );
}