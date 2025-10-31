// src/pages/MainApp.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";

// JSON/text どちらも耐える fetch
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

export default function MainApp() {
  const nav = useNavigate();
  const [userName, setUserName] = useState("");
  const userRolePref = localStorage.getItem("userRolePref") || "両方"; // 任意（運転手/添乗員/両方）
  
  // ページロード時にクッキーからセッションを復元
  useEffect(() => {
    // ログアウト直後の場合は自動ログインをスキップ
    const justLoggedOut = sessionStorage.getItem("justLoggedOut");
    if (justLoggedOut === "true") {
      sessionStorage.removeItem("justLoggedOut");
      nav("/");
      return; // 自動ログインしない
    }
    
    (async () => {
      // localStorageから取得を試みる
      const storedName = localStorage.getItem("userName");
      if (storedName) {
        setUserName(storedName);
        return;
      }
      
      // localStorageにない場合、クッキーから復元
      try {
        const { ok, data } = await apiFetch("/api?path=me");
        if (ok && data.username) {
          localStorage.setItem("userRole", data.role || "user");
          localStorage.setItem("userName", data.username);
          setUserName(data.username);
        } else {
          // セッションがない場合、ログイン画面へ
          nav("/");
        }
      } catch (err) {
        console.log("Session restore failed:", err);
        nav("/");
      }
    })();
  }, [nav]);

  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [applying, setApplying] = useState(false);
  const [activeTab, setActiveTab] = useState("calendar"); // "calendar" | "apply" | "notifications" | "mypage"
  const [myApps, setMyApps] = useState([]); // 自分の応募
  const [notifications, setNotifications] = useState([]); // 通知一覧
  const MAX_NOTIFS = 30; // 表示・保持の上限（古いものは自動的に非表示）
  const [applicationHistory, setApplicationHistory] = useState([]); // 応募履歴（イベント情報込み）
  const [showHistory, setShowHistory] = useState(false); // 折り畳み（既定は非表示）
  const [userSettings, setUserSettings] = useState({
    notifications_enabled: true,
    google_calendar_enabled: false,
    google_calendar_id: null,
  });

  // Googleカレンダーエクスポート用
  const [exportLoading, setExportLoading] = useState(false);

  // 日付文字列をDateに変換（JST考慮）
  const parseDate = (dateStr, timeStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!timeStr) {
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    // JST (UTC+9) を考慮
    return new Date(Date.UTC(year, month - 1, day, hours - 9, minutes || 0, 0));
  };

  // DateをICS形式の文字列に変換（UTC）
  const dateToICS = (date) => {
    if (!date) return '';
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  };

  // ICSファイルの内容を生成（ユーザー用：自分が確定したイベントのみ）
  const generateICS = (eventsWithMyDecisions) => {
    let ics = 'BEGIN:VCALENDAR\r\n';
    ics += 'VERSION:2.0\r\n';
    ics += 'PRODID:-//Gurisuro Schedule App//EN\r\n';
    ics += 'CALSCALE:GREGORIAN\r\n';
    ics += 'METHOD:PUBLISH\r\n';

    eventsWithMyDecisions.forEach(({ event, myRole, allDriver, allAttendant }) => {
      const startDate = parseDate(event.date, event.start_time);
      const endDate = parseDate(event.date, event.end_time || event.start_time);
      
      if (!startDate) return;

      // 終了時間がない場合は開始時間から1時間後
      if (!event.end_time) {
        endDate.setUTCHours(endDate.getUTCHours() + 1);
      }

      const uid = `gurisuro-event-${event.id}-${userName}@gurisuro-app`;
      const dtstamp = dateToICS(new Date()); // 現在時刻
      const dtstart = dateToICS(startDate);
      const dtend = dateToICS(endDate);

      // イベントタイトル（自分の役割を含める）
      const roleText = myRole === 'driver' ? '運転手' : '添乗員';
      const summary = `${event.label || 'イベント'} (${roleText})`;

      ics += 'BEGIN:VEVENT\r\n';
      ics += `UID:${uid}\r\n`;
      ics += `DTSTAMP:${dtstamp}\r\n`;
      ics += `DTSTART:${dtstart}\r\n`;
      ics += `DTEND:${dtend}\r\n`;
      ics += `SUMMARY:${summary.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')}\r\n`;
      
      let description = '';
      if (event.label) {
        description += `${event.label}\\n`;
      }
      if (event.start_time || event.end_time) {
        description += `時間: ${event.start_time || ''}${event.end_time ? `〜${event.end_time}` : ''}\\n`;
      }
      description += `役割: ${roleText}\\n`;
      if (allDriver.length > 0 || allAttendant.length > 0) {
        description += `運転手: ${allDriver.join(', ')}\\n添乗員: ${allAttendant.join(', ')}`;
      }
      
      if (description) {
        ics += `DESCRIPTION:${description.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')}\r\n`;
      }
      
      ics += 'END:VEVENT\r\n';
    });

    ics += 'END:VCALENDAR\r\n';
    return ics;
  };

  // Googleカレンダーエクスポート（ユーザー用：自分が確定したイベントのみ）
  const handleExportToGoogleCalendar = async () => {
    if (!userName) {
      alert('ログインが必要です');
      return;
    }

    setExportLoading(true);
    try {
      // すべてのイベントを取得
      const eventsRes = await apiFetch('/api/events');
      if (!eventsRes.ok || !Array.isArray(eventsRes.data)) {
        throw new Error('イベントの取得に失敗しました');
      }

      // 自分が確定したイベントのみをフィルタリング
      const eventsWithMyDecisions = [];
      for (const event of eventsRes.data) {
        try {
          const decideRes = await apiFetch(`/api?path=decide&event_id=${event.id}`);
          if (decideRes.ok && decideRes.data) {
            const driver = Array.isArray(decideRes.data.driver) ? decideRes.data.driver : [];
            const attendant = Array.isArray(decideRes.data.attendant) ? decideRes.data.attendant : [];
            
            // 自分が運転手または添乗員として確定しているかチェック
            const isDriver = driver.includes(userName);
            const isAttendant = attendant.includes(userName);
            
            if (isDriver || isAttendant) {
              eventsWithMyDecisions.push({
                event,
                myRole: isDriver ? 'driver' : 'attendant',
                allDriver: driver,
                allAttendant: attendant
              });
            }
          }
        } catch (e) {
          console.error(`Event ${event.id} decision fetch error:`, e);
        }
      }

      if (eventsWithMyDecisions.length === 0) {
        alert('確定済みの予定がありません。あなたが確定した予定がGoogleカレンダーにエクスポートできます。');
        setExportLoading(false);
        return;
      }

      // ICSファイルを生成
      const icsContent = generateICS(eventsWithMyDecisions);

      // ファイルをダウンロード
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my-gurisuro-calendar-${toLocalYMD(new Date())}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`${eventsWithMyDecisions.length}件の確定済み予定をエクスポートしました。\\n\\nダウンロードした.icsファイルをGoogleカレンダーにインポートしてください:\\n1. Googleカレンダーを開く\\n2. 設定（⚙️）> インポートとエクスポート\\n3. 「ファイルを選択」でダウンロードした.icsファイルを選択\\n4. 「インポート」をクリック`);
    } catch (error) {
      console.error('Export error:', error);
      alert(`エクスポートに失敗しました: ${error.message}`);
    } finally {
      setExportLoading(false);
    }
  };

  // ---- ログアウト ----
  const handleLogout = async () => {
    if (!window.confirm("ログアウトしますか？")) return;
    
    // ログアウトフラグを設定（自動ログインを防ぐ）
    sessionStorage.setItem("justLoggedOut", "true");
    
    // ログアウトAPIを呼び出してクッキーを削除
    try {
      await fetch("/api?path=logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.error("Logout API error:", e);
    }
    
    // localStorageをクリア
    localStorage.clear();
    
    // クッキーが削除されるまで少し待ってからリロード
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // ログインページへ移動（リロードは不要）
    window.location.href = "/";
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

  // リアルタイム性向上: フォアグラウンド復帰/一定間隔で再取得
  useEffect(() => {
    const handleWake = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("focus", handleWake);
    const timer = setInterval(() => {
      refresh();
    }, 20000); // 20秒ごとに更新
    return () => {
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("focus", handleWake);
      clearInterval(timer);
    };
  }, [refresh]);

  // ---- 通知一覧取得 ----
  const refreshNotifications = useCallback(async () => {
    if (!userName) return;
    const r = await apiFetch(`/api?path=notifications`);
    if (r.ok && Array.isArray(r.data)) {
      // 新しい順にソートして最新MAX_NOTIFS件のみ保持
      const sorted = [...r.data].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      const latest = sorted.slice(0, MAX_NOTIFS);
      setNotifications(latest);
      // 古い未読が大量にある場合は自動で既読化（サーバ対応があれば最適化可）
      const older = sorted.slice(MAX_NOTIFS).filter(n => !n.read_at);
      older.slice(0, 20).forEach(n => markAsRead(n.id)); // 一度に叩きすぎない
    }
  }, [userName]);

  useEffect(() => {
    if (activeTab === "notifications") {
      (async () => {
        const r = await apiFetch(`/api?path=notifications`);
        if (r.ok && Array.isArray(r.data)) {
          const sorted = [...r.data].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
          setNotifications(sorted.slice(0, MAX_NOTIFS));
        }
      })();
    }
  }, [activeTab]);

  // ---- ユーザー設定取得 ----
  const refreshUserSettings = useCallback(async () => {
    if (!userName) return;
    const r = await apiFetch(`/api?path=user-settings`);
    if (r.ok && r.data) {
      setUserSettings({
        notifications_enabled: r.data.notifications_enabled !== false,
        google_calendar_enabled: r.data.google_calendar_enabled === true,
        google_calendar_id: r.data.google_calendar_id || null,
        has_google_token: r.data.has_google_token || false,
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

  // Google OAuthコールバック処理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get('google_oauth_success');
    const oauthError = params.get('error');
    
    if (oauthSuccess === 'true') {
      alert('Googleアカウントの連携が完了しました！');
      // URLからパラメータを削除
      window.history.replaceState({}, '', window.location.pathname);
      refreshUserSettings();
    } else if (oauthError) {
      let errorMsg = 'Google認証に失敗しました';
      if (oauthError === 'oauth_failed') errorMsg = 'Google認証が中断されました';
      else if (oauthError === 'token_exchange_failed') errorMsg = 'トークンの取得に失敗しました';
      alert(errorMsg);
      // URLからパラメータを削除
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refreshUserSettings]);

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
      
      // Googleカレンダー同期が有効になった場合、即座に同期を実行
      if (userSettings.google_calendar_enabled) {
        triggerGoogleCalendarSync();
      }
    } catch (e) {
      alert(`設定の保存に失敗しました: ${e.message}`);
    }
  };

  // ---- Googleカレンダー自動同期 ----
  const triggerGoogleCalendarSync = React.useCallback(async (downloadICS = false) => {
    if (!userName || !userSettings.google_calendar_enabled) return;
    
    try {
      const res = await apiFetch(`/api?path=google-calendar-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (res.ok) {
        if (res.data?.needsAuth) {
          // Google認証が必要
          alert(res.data.message || 'Google認証が必要です。マイページでGoogleアカウントを連携してください。');
          return;
        }

        if (res.data?.synced > 0 || res.data?.googleSynced > 0) {
          const syncedCount = res.data.googleSynced || res.data.synced;
          // 成功時は通知
          if (res.data.googleSynced > 0) {
            alert(`${syncedCount}件のイベントをGoogleカレンダーに同期しました！`);
          } else if (downloadICS && res.data?.ics) {
            // フォールバック：ICSファイルをダウンロード
            const blob = new Blob([res.data.ics], { type: 'text/calendar;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `gurisuro-calendar-${toLocalYMD(new Date())}.ics`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            alert('ICSファイルをダウンロードしました。Googleカレンダーにインポートしてください。');
          }
          console.log(`[Google Calendar Sync] ${syncedCount}件のイベントを同期しました`);
        } else {
          console.log('[Google Calendar Sync] 同期するイベントがありませんでした');
        }
      }
    } catch (e) {
      console.error("Googleカレンダー同期エラー:", e);
    }
  }, [userName, userSettings.google_calendar_enabled]);

  const listOfSelected = useMemo(() => {
    const ymd = toLocalYMD(selectedDate);
    return events.filter((e) => e.date === ymd);
  }, [events, selectedDate]);

  // 残枠表示用にイベント別の応募数 + 確定済みメンバーをGET
  const [counts, setCounts] = useState({});
  const [decided, setDecided] = useState({}); // { eventId: { driver: string[], attendant: string[] } }
  const [decidedDates, setDecidedDates] = useState(new Set()); // 確定済みの日付のSet
  const [cancelledDates, setCancelledDates] = useState(new Set()); // ユーザーが応募したがキャンセルが出た日付
  const [decidedMembersByEventId, setDecidedMembersByEventId] = useState({}); // { eventId: { driver: string[], attendant: string[] } } イベントごとの確定状況
  useEffect(() => {
    (async () => {
      const ymd = toLocalYMD(selectedDate);
      const todays = events.filter((e) => e.date === ymd);
      const out = {};
      const decOut = {};
      const decDateSet = new Set();
      
      if (!userName) {
        setCounts(out);
        setDecided(decOut);
        setDecidedDates(decDateSet);
        return;
      }
      
      // 当日のイベントのみ処理
      for (const ev of todays) {
        // 応募数と確定済みメンバーを並列取得
        const [appsRes, decRes] = await Promise.all([
          apiFetch(`/api/applications?event_id=${ev.id}`).catch(() => ({ ok: false, data: [] })),
          apiFetch(`/api?path=decide&event_id=${ev.id}`).catch(() => ({ ok: false, data: null }))
        ]);
        
        // 応募数
        const arr = Array.isArray(appsRes.data) ? appsRes.data : [];
        out[ev.id] = {
          driver: arr.filter(a => a.kind === "driver").length,
          attendant: arr.filter(a => a.kind === "attendant").length,
          raw: arr,
        };
        
        // 確定済みメンバー
        if (decRes.ok && decRes.data) {
          decOut[ev.id] = {
            driver: Array.isArray(decRes.data.driver) ? decRes.data.driver : [],
            attendant: Array.isArray(decRes.data.attendant) ? decRes.data.attendant : [],
          };
          
          // 自分が確定済みかチェック
          const isMyDecided = 
            (decOut[ev.id].driver.includes(userName)) ||
            (decOut[ev.id].attendant.includes(userName));
          
          if (isMyDecided) {
            decDateSet.add(ev.date);
          }
        } else {
          decOut[ev.id] = { driver: [], attendant: [] };
        }
      }
      
      // 他の日付の確定済み状況を簡易的に確認（自分の応募があるイベントのみ）
      const allDecidedByEventId = {};
      const userCancelledDateSet = new Set(); // 自分が応募したがキャンセルが出た日付
      
      if (myApps.length > 0 && events.length > 0) {
        const myEventIds = [...new Set(myApps.map(a => a.event_id))];
        const checks = myEventIds.map(async (eventId) => {
          const ev = events.find(e => e.id === eventId);
          if (!ev) return null;
          
          try {
            const dec = await apiFetch(`/api?path=decide&event_id=${eventId}`);
            if (dec.ok && dec.data) {
              // イベントごとの確定状況を保存
              allDecidedByEventId[eventId] = {
                driver: Array.isArray(dec.data.driver) ? dec.data.driver : [],
                attendant: Array.isArray(dec.data.attendant) ? dec.data.attendant : [],
              };
              
              const isMyDecided = 
                (Array.isArray(dec.data.driver) && dec.data.driver.includes(userName)) ||
                (Array.isArray(dec.data.attendant) && dec.data.attendant.includes(userName));
              
              if (isMyDecided) {
                return { date: ev.date, eventId };
              }
            }
          } catch {}
          return null;
        });
        
        const results = (await Promise.all(checks)).filter(Boolean);
        results.forEach(({ date, eventId }) => {
          decDateSet.add(date);
          // 確定済みの場合はキャンセルフラグを解除
        });
      }
      
      // キャンセル通知をチェック（自分が応募したイベントでキャンセルが出た場合）
      try {
        const notifsRes = await apiFetch(`/api?path=notifications`);
        if (notifsRes.ok && Array.isArray(notifsRes.data)) {
          for (const notif of notifsRes.data) {
            // キャンセル通知で、自分が応募しているイベントの場合
            if (notif.kind?.startsWith("cancel_") && myApps.some(a => a.event_id === notif.event_id)) {
              const ev = events.find(e => e.id === notif.event_id);
              if (ev && ev.date) {
                // ただし、既に確定済み（キャンセルが埋まった）の場合は追加しない
                const evDecided = allDecidedByEventId[notif.event_id];
                const capacityDriver = ev.capacity_driver ?? 1;
                const capacityAttendant = ev.capacity_attendant ?? 1;
                const confirmedDriverCount = evDecided?.driver?.length || 0;
                const confirmedAttendantCount = evDecided?.attendant?.length || 0;
                // 定員が埋まっている場合はキャンセルフラグを付けない
                if (confirmedDriverCount < capacityDriver || confirmedAttendantCount < capacityAttendant) {
                  userCancelledDateSet.add(ev.date);
                }
              }
            }
          }
        }
      } catch {}
      
      // 当日のイベントの確定状況も保存
      for (const ev of todays) {
        if (decOut[ev.id]) {
          allDecidedByEventId[ev.id] = decOut[ev.id];
        }
      }
      
      // decidedステートには当日のデータとallDecidedByEventIdをマージして設定
      // （イベント一覧タブでも確定状況を表示するため）
      const mergedDecided = { ...allDecidedByEventId, ...decOut };
      
      setCounts(out);
      setDecided(mergedDecided);
      setDecidedDates(decDateSet);
      setCancelledDates(userCancelledDateSet);
      setDecidedMembersByEventId(allDecidedByEventId);
    })();
  }, [events, selectedDate, userName, myApps]);

  // 確定状況が変更されたときにGoogleカレンダー自動同期を実行
  useEffect(() => {
    if (!userName || !userSettings.google_calendar_enabled || Object.keys(decidedMembersByEventId).length === 0) {
      return;
    }

    // 少し遅延させて実行（連続更新を防ぐ）
    const timeoutId = setTimeout(() => {
      triggerGoogleCalendarSync();
    }, 2000); // 2秒後に同期

    return () => clearTimeout(timeoutId);
  }, [decidedMembersByEventId, userName, userSettings.google_calendar_enabled, triggerGoogleCalendarSync]);

  // 定期的なバックグラウンド同期（30分ごと）
  useEffect(() => {
    if (!userName || !userSettings.google_calendar_enabled) {
      return;
    }

    // 初回は即座に実行（設定が有効になったとき）
    triggerGoogleCalendarSync();

    // その後は30分ごとに自動同期
    const intervalId = setInterval(() => {
      triggerGoogleCalendarSync();
    }, 30 * 60 * 1000); // 30分

    return () => clearInterval(intervalId);
  }, [userName, userSettings.google_calendar_enabled, triggerGoogleCalendarSync]);

  // すべてのイベントについて確定状況をバックグラウンドで取得し、カレンダーの色がタップ前に反映されるようにする
  useEffect(() => {
    let aborted = false;
    (async () => {
      if (!Array.isArray(events) || events.length === 0) {
        setDecidedMembersByEventId({});
        return;
      }
      const map = {};
      const tasks = events.map(async (ev) => {
        try {
          const dec = await apiFetch(`/api?path=decide&event_id=${ev.id}`);
          if (dec.ok && dec.data) {
            map[ev.id] = {
              driver: Array.isArray(dec.data.driver) ? dec.data.driver : [],
              attendant: Array.isArray(dec.data.attendant) ? dec.data.attendant : [],
            };
          } else {
            map[ev.id] = { driver: [], attendant: [] };
          }
        } catch {
          map[ev.id] = { driver: [], attendant: [] };
        }
      });
      await Promise.all(tasks);
      if (!aborted) {
        setDecidedMembersByEventId(map);
        // イベント一覧タブでも確定状況を表示するため、decidedステートにも反映
        setDecided(prev => ({ ...prev, ...map }));
      }
    })();
    return () => { aborted = true; };
  }, [events]);

  const hasApplied = (eventId, kind) =>
    myApps.some((a) => a.event_id === eventId && a.kind === kind);

  // カレンダーに渡すpropsをメモ化（再レンダリングを防ぐ）
  const calendarDecidedMembersByDate = useMemo(() => {
    return { _byEventId: decidedMembersByEventId };
  }, [decidedMembersByEventId]);

  // decidedDatesとcancelledDatesをメモ化（内容が同じ場合は同じインスタンスを返す）
  const decidedDatesKey = useMemo(() => {
    return Array.from(decidedDates).sort().join(',');
  }, [decidedDates]);
  
  const cancelledDatesKey = useMemo(() => {
    return Array.from(cancelledDates).sort().join(',');
  }, [cancelledDates]);

  const memoizedDecidedDates = useMemo(() => {
    return decidedDates;
  }, [decidedDatesKey]);

  const memoizedCancelledDates = useMemo(() => {
    return cancelledDates;
  }, [cancelledDatesKey]);

  // myAppliedEventIdsをメモ化
  const myAppsKey = useMemo(() => {
    return myApps.map(a => `${a.event_id}`).sort().join(',');
  }, [myApps]);
  
  const memoizedMyAppliedEventIds = useMemo(() => {
    return new Set(myApps.map(a => a.event_id));
  }, [myAppsKey]);

  const apply = async (ev, kind) => {
    if (!userName) {
      alert("先にログインしてください。");
      return;
    }
    
    // 確定済みチェック（自分がその役割で確定済みの場合は応募変更不可）
    const dec = decided[ev.id] || { driver: [], attendant: [] };
    const isDecided = (kind === "driver" ? dec.driver : dec.attendant).includes(userName);
    if (isDecided) {
      const kindLabel = kind === "driver" ? "運転手" : "添乗員";
      alert(`このイベントの${kindLabel}として既に確定済みです。確定済みの役割の応募は変更できません。`);
      return;
    }
    
    // 同じイベントで既に別の役割に応募しているかチェック
    const hasAppliedOtherKind = myApps.some(a => 
      a.event_id === ev.id && a.kind !== kind
    );
    if (hasAppliedOtherKind) {
      const otherKind = myApps.find(a => a.event_id === ev.id && a.kind !== kind)?.kind;
      const otherKindLabel = otherKind === "driver" ? "運転手" : "添乗員";
      alert(`このイベントには既に${otherKindLabel}として応募しています。同じイベントで運転手と添乗員の両方に応募することはできません。`);
      return;
    }

    // 同じ時間帯への重複応募をクライアント側でもガード（サーバー側もチェック済み）
    const targetDate = ev.date;
    const targetStart = ev.start_time;
    const targetEnd = ev.end_time || ev.start_time;
    const eventsMapById = Object.fromEntries(events.map(e => [e.id, e]));
    const overlapsTime = (a, b) => {
      if (!a || !b) return false;
      if (!a.start_time || !b.start_time) return false;
      const aStart = a.start_time;
      const aEnd = a.end_time || a.start_time;
      const bStart = b.start_time;
      const bEnd = b.end_time || b.start_time;
      // 文字列の HH:MM 比較で重なり判定
      if (aStart === bStart) return true;
      return !(aEnd <= bStart || bEnd <= aStart);
    };
    const hasTimeConflict = myApps.some(a => {
      const ev2 = eventsMapById[a.event_id];
      if (!ev2) return false;
      if (ev2.date !== targetDate) return false;
      return overlapsTime(ev2, { start_time: targetStart, end_time: targetEnd });
    });
    if (hasTimeConflict) {
      alert("同じ時間帯に既に応募済みです。別の時間帯を選択してください。");
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
      if (data?.auto_switched && data?.switched_to === "attendant") {
        alert("運転手で応募されましたが運転手が満杯のため、添乗員として登録されました。");
      } else {
        alert("応募しました！");
      }
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
      // 確定済み日付も再取得
      const ymd = toLocalYMD(selectedDate);
      const todays = events.filter((e) => e.date === ymd);
      if (todays.some(e => e.id === ev.id)) {
        // キャンセル後に状態を更新
        setTimeout(() => {
          refresh();
        }, 100);
      }
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
          {notifications.map((n) => {
            // 通知からイベントの日付を取得
            const eventForNotification = events.find(e => e.id === n.event_id);
            const handleNotificationClick = () => {
              if (eventForNotification && eventForNotification.date) {
                const dateParts = eventForNotification.date.split('-');
                if (dateParts.length === 3) {
                  const eventDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
                  setSelectedDate(eventDate);
                  setActiveTab("calendar");
                }
              }
            };
            
            return (
              <li
                key={n.id}
                className={`border rounded p-3 ${!n.read_at ? 'bg-blue-50 border-blue-200' : 'bg-white'} ${eventForNotification ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={handleNotificationClick}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(n.id);
                      }}
                      className="ml-2 px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                      既読
                    </button>
                  )}
                </div>
              </li>
            );
          })}
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
                自動同期: 予定が確定すると自動的にGoogleカレンダーに同期されます。
              </p>
              
              {/* Google認証ステータス */}
              {!userSettings.has_google_token && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                  <p className="text-yellow-800 mb-2">
                    Google認証が必要です。下のボタンからGoogleアカウントを連携してください。
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const res = await apiFetch('/api?path=google-oauth');
                        if (res.ok && res.data?.authUrl) {
                          // 新しいウィンドウで認証
                          window.location.href = res.data.authUrl;
                        } else {
                          alert('認証URLの取得に失敗しました');
                        }
                      } catch (e) {
                        alert(`認証エラー: ${e.message}`);
                      }
                    }}
                    className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Googleアカウントを連携
                  </button>
                </div>
              )}

              {userSettings.has_google_token && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-green-600">✓ Google認証済み</span>
                  <button
                    onClick={async () => {
                      if (confirm('Google認証を解除しますか？')) {
                        try {
                          const res = await apiFetch('/api?path=google-oauth', {
                            method: 'POST',
                          });
                          if (res.ok) {
                            alert('Google認証を解除しました');
                            refreshUserSettings();
                          } else {
                            alert('認証解除に失敗しました');
                          }
                        } catch (e) {
                          alert(`エラー: ${e.message}`);
                        }
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 text-xs"
                  >
                    認証解除
                  </button>
                </div>
              )}

              <button
                onClick={() => triggerGoogleCalendarSync(true)}
                disabled={!userName || !userSettings.has_google_token}
                className="mt-2 px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                title={!userSettings.has_google_token ? 'Google認証が必要です' : 'Googleカレンダーに直接同期'}
              >
                今すぐ同期
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 応募履歴 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">応募履歴</h3>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50"
          >
            {showHistory ? "閉じる" : "表示"}
          </button>
        </div>
        {!showHistory ? (
          <p className="text-xs text-gray-500">必要な時だけ表示できます。</p>
        ) : applicationHistory.length === 0 ? (
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

  // --- 応募状況リスト ---
  const todayYMD = toLocalYMD(new Date());
  const renderApplyTab = () => {
    const sortedEvents = [...events].filter(ev => ev.date && ev.date >= todayYMD).sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || "").localeCompare(b.start_time || ""));
    return (
      <div>
        <h2 className="font-semibold mb-4">今後のイベント一覧（募集中）</h2>
        <ul className="space-y-2">
          {sortedEvents.length === 0 && (
            <li className="text-gray-500 text-sm">現時点でイベントはありません。</li>
          )}
          {sortedEvents.map(ev => {
            const appliedDriver = hasApplied(ev.id, "driver");
            const appliedAtt    = hasApplied(ev.id, "attendant");
            const c = counts?.[ev.id] || { driver: 0, attendant: 0 };
            const dec = decided?.[ev.id] || { driver: [], attendant: [] };
            // 自分がどちらかで“確定”済みか調べる
            const isConfirmed = (dec.driver.includes(userName) || dec.attendant.includes(userName));
            const isDecidedDriver = dec.driver.includes(userName);
            const isDecidedAttendant = dec.attendant.includes(userName);
            return (
              <li key={ev.id} className={"border rounded p-3 bg-white flex items-center gap-3 " + (isConfirmed ? "bg-green-50 border-green-300" : "") }>
                {ev.icon && <img src={ev.icon} alt="" className="w-7 h-7" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{ev.label}</div>
                  <div className="text-xs text-gray-600 truncate">{ev.date} {ev.start_time}〜{ev.end_time}</div>
                  <div className="text-xs text-gray-500 mt-1">運転手: {c.driver}人 / 添乗員: {c.attendant}人</div>
                  {isDecidedDriver && <div className="text-xs text-green-600 mt-1">✓ あなたが運転手として確定済み</div>}
                  {isDecidedAttendant && <div className="text-xs text-green-600 mt-1">✓ あなたが添乗員として確定済み</div>}
                </div>
                <div className="flex flex-col gap-2 items-end text-xs min-w-[128px]">
                  {isDecidedDriver ? (
                    <button
                      style={{ fontSize: "1.1rem", fontWeight: 600, padding: "10px 0" }}
                      className="w-full bg-red-600 text-white px-4 py-2 rounded text-base hover:bg-red-700"
                      disabled={applying}
                      onClick={() => cancelDecided(ev, "driver")}
                    >
                      キャンセル（運転手）
                    </button>
                  ) : (
                    <button
                      style={{ fontSize: "1.1rem", fontWeight: 600, padding: "10px 0" }}
                      className={appliedDriver ? "w-full bg-gray-300 text-gray-700 px-4 py-2 rounded text-base" : "w-full bg-blue-600 text-white px-4 py-2 rounded text-base hover:bg-blue-700"}
                      disabled={applying}
                      onClick={() => appliedDriver ? cancel(ev, "driver") : apply(ev, "driver")}
                    >
                      {appliedDriver ? "運転手 応募取消" : "運転手で応募"}
                    </button>
                  )}
                  {isDecidedAttendant ? (
                    <button
                      style={{ fontSize: "1.1rem", fontWeight: 600, padding: "10px 0" }}
                      className="w-full bg-red-600 text-white px-4 py-2 rounded text-base hover:bg-red-700"
                      disabled={applying}
                      onClick={() => cancelDecided(ev, "attendant")}
                    >
                      キャンセル（添乗員）
                    </button>
                  ) : (
                    <button
                      style={{ fontSize: "1.1rem", fontWeight: 600, padding: "10px 0" }}
                      className={appliedAtt ? "w-full bg-gray-300 text-gray-700 px-4 py-2 rounded text-base" : "w-full bg-emerald-600 text-white px-4 py-2 rounded text-base hover:bg-emerald-700"}
                      disabled={applying}
                      onClick={() => appliedAtt ? cancel(ev, "attendant") : apply(ev, "attendant")}
                    >
                      {appliedAtt ? "添乗員 応募取消" : "添乗員で応募"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <>
    <div 
      className="min-h-screen"
      style={{ 
        backgroundColor: '#f0fdf4',
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
        marginBottom: 0
      }}
    >
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg border border-green-100 p-4 sm:p-6">
        {/* ヘッダー（ログアウト追加） */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold">グリスロ予定調整アプリ</h1>
          <div className="flex items-center gap-3 flex-wrap">
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
              decidedDates={memoizedDecidedDates}
              cancelledDates={memoizedCancelledDates}
              decidedMembersByDate={calendarDecidedMembersByDate}
              myAppliedEventIds={memoizedMyAppliedEventIds}
              compact={true}
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
                    
                    // 同じイベントで既に別の役割に応募しているかチェック
                    const hasAppliedOtherKindDriver = appliedAtt; // 添乗員に応募している場合、運転手は無効
                    const hasAppliedOtherKindAttendant = appliedDriver; // 運転手に応募している場合、添乗員は無効
                  
                  // 同日の他イベントと時間帯が重なる応募が既にあるか（UI 無効化用）
                  const eventsMapById = Object.fromEntries(events.map(e => [e.id, e]));
                  const overlapsTime = (a, b) => {
                    if (!a || !b) return false;
                    if (!a.start_time || !b.start_time) return false;
                    const aStart = a.start_time;
                    const aEnd = a.end_time || a.start_time;
                    const bStart = b.start_time;
                    const bEnd = b.end_time || b.start_time;
                    if (aStart === bStart) return true;
                    return !(aEnd <= bStart || bEnd <= aStart);
                  };
                  const hasAnyTimeConflict = myApps.some(a => {
                    const ev2 = eventsMapById[a.event_id];
                    if (!ev2) return false;
                    if (ev2.id === ev.id) return false;
                    if (ev2.date !== ev.date) return false;
                    return overlapsTime(ev2, ev);
                  });
                    
                    const hasDecidedDriver = dec.driver.length > 0;
                    const hasDecidedAttendant = dec.attendant.length > 0;
                    const isDecidedDriver = dec.driver.includes(userName);
                    const isDecidedAttendant = dec.attendant.includes(userName);

                    return (
                      <li key={ev.id} className="border rounded p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {(() => {
                            // フリー運行・循環運行のアイコンを取得
                            let eventIcon = ev.icon || "";
                            if (ev.label && (ev.label.includes("フリー運行") || ev.label.includes("循環運行"))) {
                              eventIcon = "/icons/app-icon-180.png";
                            }
                            return eventIcon ? <img src={eventIcon} alt="" className="w-6 h-6" /> : null;
                          })()}
                          <div>
                            <div className="font-medium">{ev.label}</div>
                            <div className="text-xs text-gray-500">
                              {ev.start_time}〜{ev.end_time}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              運転手: {c.driver}人
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
                              添乗員: {c.attendant}人
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
                                disabled={applying || hasDecidedDriver || hasAppliedOtherKindDriver || hasAnyTimeConflict}
                                onClick={() => apply(ev, "driver")}
                                title={hasAppliedOtherKindDriver ? "このイベントには既に添乗員として応募しています" : (hasAnyTimeConflict ? "同じ時間帯に応募済みです" : "")}
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
                                disabled={applying || hasDecidedAttendant || hasAppliedOtherKindAttendant || hasAnyTimeConflict}
                                onClick={() => apply(ev, "attendant")}
                                title={hasAppliedOtherKindAttendant ? "このイベントには既に運転手として応募しています" : (hasAnyTimeConflict ? "同じ時間帯に応募済みです" : "")}
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
        {activeTab === "apply" && renderApplyTab()}
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
        minHeight: '72px',
        backgroundColor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -6px 12px -6px rgba(0,0,0,0.12)',
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
          gridTemplateColumns: '1fr 1fr 1fr 1fr', 
          WebkitGridTemplateColumns: '1fr 1fr 1fr 1fr',
          width: '100%', 
          height: '100%', 
          minHeight: '72px' 
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
            onClick={() => setActiveTab("apply")}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '4px',
              padding: '12px 16px',
              backgroundColor: activeTab === "apply" ? '#dbeafe' : 'transparent',
              color: activeTab === "apply" ? '#2563eb' : '#4b5563',
              fontWeight: activeTab === "apply" ? '600' : '400',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-6h6v6M9 21h6a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span style={{ fontSize: '12px', fontWeight: '500' }}>応募状況</span>
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