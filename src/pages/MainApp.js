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
      setUserSettings(r.data);
    }
  }, [userName]);

  useEffect(() => {
    if (activeTab === "mypage") {
      refreshUserSettings();
    }
  }, [activeTab, refreshUserSettings]);

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
        const waitlistDriver = arr.filter(a => a.kind === "driver" && a.is_waitlist).length;
        const waitlistAttendant = arr.filter(a => a.kind === "attendant" && a.is_waitlist).length;
        out[ev.id] = {
          driver: arr.filter(a => a.kind === "driver" && !a.is_waitlist).length,
          attendant: arr.filter(a => a.kind === "attendant" && !a.is_waitlist).length,
          waitlistDriver,
          waitlistAttendant,
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

  const hasApplied = (eventId, kind, waitlist = false) =>
    myApps.some((a) => a.event_id === eventId && a.kind === kind && (waitlist ? a.is_waitlist : !a.is_waitlist));

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
      if (status === 403 && data?.can_waitlist) {
        // 定員満杯でキャンセル待ち可能
        if (window.confirm("定員が満杯です。キャンセル待ちとして登録しますか？")) {
          const waitRes = await apiFetch("/api/applications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event_id: ev.id, username: userName, kind, is_waitlist: true }),
          });
          if (waitRes.ok) {
            await refresh();
            alert("キャンセル待ちとして登録しました！");
          } else {
            alert(`キャンセル待ち登録に失敗しました: ${waitRes.data?.error || waitRes.status}`);
          }
        }
      } else if (!ok) {
        if (status === 403 && data?.error?.includes("確定済み")) {
          // 確定済みの場合、キャンセル待ちを提案
          if (window.confirm("このイベントは既に確定済みです。キャンセル待ちとして登録しますか？")) {
            const waitRes = await apiFetch("/api/applications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_id: ev.id, username: userName, kind, is_waitlist: true }),
            });
            if (waitRes.ok) {
              await refresh();
              alert("キャンセル待ちとして登録しました！");
            } else {
              alert(`キャンセル待ち登録に失敗しました: ${waitRes.data?.error || waitRes.status}`);
            }
          }
        } else {
          throw new Error(data?.error || `HTTP ${status}`);
        }
      } else {
        await refresh();
        alert(data?.waitlist ? "キャンセル待ちとして登録しました！" : "応募しました！");
      }
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

      <button
        onClick={saveUserSettings}
        className="w-full px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        設定を保存
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
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
                              {c.waitlistDriver > 0 && (
                                <span className="text-orange-600 ml-1">【キャンセル待ち: {c.waitlistDriver}人】</span>
                              )}
                              {hasDecidedDriver && (
                                <span className="text-blue-600 font-semibold">
                                  【確定: {dec.driver.join(", ")}】
                                </span>
                              )}
                              {isDecidedDriver && (
                                <span className="text-green-600 font-semibold ml-1">✓ あなたが確定済み</span>
                              )}
                              {hasApplied(ev.id, "driver", true) && (
                                <span className="text-orange-600 font-semibold ml-1">✓ あなたがキャンセル待ち</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              添乗員: {c.attendant}{ev.capacity_attendant!=null?` / ${ev.capacity_attendant}`:""}
                              {remainAtt!=null?`（残り ${remainAtt}）`:""}
                              {c.waitlistAttendant > 0 && (
                                <span className="text-orange-600 ml-1">【キャンセル待ち: {c.waitlistAttendant}人】</span>
                              )}
                              {hasDecidedAttendant && (
                                <span className="text-blue-600 font-semibold">
                                  【確定: {dec.attendant.join(", ")}】
                                </span>
                              )}
                              {isDecidedAttendant && (
                                <span className="text-green-600 font-semibold ml-1">✓ あなたが確定済み</span>
                              )}
                              {hasApplied(ev.id, "attendant", true) && (
                                <span className="text-orange-600 font-semibold ml-1">✓ あなたがキャンセル待ち</span>
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
          </>
        )}
        {activeTab === "notifications" && renderNotificationsTab()}
        {activeTab === "mypage" && renderMypageTab()}
      </div>

      {/* 固定タブバー */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="max-w-4xl mx-auto grid grid-cols-3">
          <button
            onClick={() => setActiveTab("calendar")}
            className={`py-3 px-4 flex flex-col items-center gap-1 ${activeTab === "calendar" ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium">カレンダー</span>
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            className={`py-3 px-4 flex flex-col items-center gap-1 relative ${activeTab === "notifications" ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="text-xs font-medium">通知</span>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("mypage")}
            className={`py-3 px-4 flex flex-col items-center gap-1 ${activeTab === "mypage" ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs font-medium">マイページ</span>
          </button>
        </div>
      </div>
    </div>
  );
}