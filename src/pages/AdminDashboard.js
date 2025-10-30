// src/pages/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import { toLocalYMD } from "../lib/date.js";

// 500/HTMLにも耐える軽量 fetch
async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
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
  const [searchParams] = useSearchParams();
  const [userName, setUserName] = useState("");

  // タブ管理（URLパラメータから取得、デフォルトはcalendar）
  const [activeTab, setActiveTab] = useState(() => {
    let tab = searchParams.get("tab");
    // 軽い入力ミスを許容（例: aaply, appl, applies など）
    if (tab && /^appl/i.test(tab)) tab = "apply";
    return tab && ["calendar", "apply", "notifications"].includes(tab) ? tab : "calendar";
  });

  // URLパラメータの変更を監視
  useEffect(() => {
    let tab = searchParams.get("tab");
    if (tab && /^appl/i.test(tab)) tab = "apply";
    if (tab && ["calendar", "apply", "notifications"].includes(tab)) {
      setActiveTab(tab);
    } else {
      setActiveTab("calendar");
    }
  }, [searchParams]);

  // カレンダー & データ
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
      const [decidedDates, setDecidedDates] = useState(new Set());
  const [cancelledDates, setCancelledDates] = useState(new Set()); // キャンセルされた日付
  const [decidedMembersByDate, setDecidedMembersByDate] = useState({}); // { "YYYY-MM-DD": { driver: string[], attendant: string[] } }
  const [decidedMembersByEventId, setDecidedMembersByEventId] = useState({}); // { eventId: { driver: string[], attendant: string[] } }

  // 通知
  const [notifications, setNotifications] = useState([]);
  const [decidedEventIds, setDecidedEventIds] = useState(new Set());

  // タブ切替時のデータ確保（applyに直接来た際、必ず一度のみ取得）
  const [didFetchOnce, setDidFetchOnce] = useState(false);
  useEffect(() => {
    if (activeTab === "apply" && !didFetchOnce) {
      setDidFetchOnce(true);
      refresh();
    }
    if (activeTab !== "apply" && didFetchOnce) {
      setDidFetchOnce(false);
    }
  }, [activeTab, didFetchOnce]);

  // 募集作成フォーム
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [customLabel, setCustomLabel] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [createOpen, setCreateOpen] = useState(false);

  // 応募状況モーダル
  const [fairOpen, setFairOpen] = useState(false);
  const [fairLoading, setFairLoading] = useState(false);
  const [fairError, setFairError] = useState("");
  const [fairData, setFairData] = useState({ event_id: null, driver: [], attendant: [] });
  const [fairEventInfo, setFairEventInfo] = useState(null); // 応募状況モーダル用のイベント情報
  const [selDriver, setSelDriver] = useState([]); // 選択中（まだ保存されていない）
  const [selAttendant, setSelAttendant] = useState([]); // 選択中（まだ保存されていない）
  const [confirmedDriver, setConfirmedDriver] = useState([]); // 確定済み（DBに保存済み）
  const [confirmedAttendant, setConfirmedAttendant] = useState([]); // 確定済み（DBに保存済み）

  // イベント編集モーダル
  const [editOpen, setEditOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editStart, setEditStart] = useState("10:00");
  const [editEnd, setEditEnd] = useState("12:00");
  const [editDate, setEditDate] = useState("");

  // 手動応募モーダル
  const [manualApplyOpen, setManualApplyOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUsername, setSelectedUsername] = useState("");
  const [selectedKind, setSelectedKind] = useState("driver");

  // 管理者認証
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      alert("管理者のみアクセス可能です");
      nav("/");
      return;
    }
    // 表示用: 現在のログインユーザー名
    const storedName = localStorage.getItem("userName");
    if (storedName) setUserName(storedName);
    // 念のためサーバで確認
    (async () => {
      try {
        const r = await apiFetch("/api?path=me");
        if (r.ok && r.data?.username) {
          setUserName(r.data.username);
          if (!storedName) localStorage.setItem("userName", r.data.username);
        }
      } catch {}
    })();
    refresh();
  }, [nav]);

  // ユーザーリスト取得
  const refreshUsers = async () => {
    try {
      const r = await apiFetch("/api/users");
      setUsers(Array.isArray(r.data) ? r.data.filter(u => u.role !== "admin") : []);
    } catch (e) {
      console.error("users fetch error:", e);
    }
  };

  // 手動応募
  const handleManualApply = async () => {
    if (!selectedUsername || !fairData.event_id) {
      alert("ユーザーを選択してください");
      return;
    }
    try {
      const r = await apiFetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: fairData.event_id,
          username: selectedUsername,
          kind: selectedKind,
        }),
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      alert("応募を登録しました");
      setManualApplyOpen(false);
      setSelectedUsername("");
      await openFairness(fairData.event_id);
      await refresh();
    } catch (e) {
      alert(`応募の登録に失敗しました: ${e.message}`);
    }
  };

  // イベント取得
  const refresh = async () => {
    setLoading(true);
    try {
      // 1) まずイベントだけ取得して即描画
      const r = await apiFetch("/api/events");
      const evs = Array.isArray(r.data) ? r.data : [];
      setEvents(evs);
      setLoading(false); // ここで即座にローディング解除

      // 2) 以降はバックグラウンド更新（描画はブロックしない）
      // 確定済み情報の大量リクエストは省略（必要時にモーダルで取得）
      setDecidedDates(new Set());
      setDecidedMembersByDate({});
      setDecidedMembersByEventId({});

      // キャンセル・繰上げ・定員不足の検知は通知から集計（非同期）
      (async () => {
        try {
          const cancelNotifs = await apiFetch("/api?path=notifications");
          if (cancelNotifs.ok && Array.isArray(cancelNotifs.data)) {
            const cancelDateSet = new Set();
            for (const notif of cancelNotifs.data) {
              if (notif.kind?.startsWith("cancel_") || notif.kind?.startsWith("promote_") || notif.kind?.startsWith("insufficient_")) {
                try {
                  const evDetail = evs.find(e => e.id === notif.event_id);
                  if (evDetail && evDetail.date) cancelDateSet.add(evDetail.date);
                } catch {}
              }
            }
            setCancelledDates(cancelDateSet);
          }
        } catch {}
      })();

      // 通知一覧も非同期で更新
      (async () => {
        try {
          const notifs = await apiFetch("/api?path=notifications");
          if (notifs.ok && Array.isArray(notifs.data)) setNotifications(notifs.data);
        } catch {}
      })();

      // 一覧用：確定済みイベントの簡易判定（重くならない範囲で最大60件）
      (async () => {
        const ids = new Set();
        for (const ev of evs.slice(0, 60)) {
          try {
            const d = await apiFetch(`/api?path=decide&event_id=${ev.id}`);
            // 管理者一覧の「確定済み」判定: 両役（運転手・添乗員）が揃っているときのみ
            if (
              d.ok && d.data &&
              Array.isArray(d.data.driver) && d.data.driver.length > 0 &&
              Array.isArray(d.data.attendant) && d.data.attendant.length > 0
            ) {
              ids.add(ev.id);
            }
          } catch {}
        }
        setDecidedEventIds(ids);
      })();

      if (process.env.NODE_ENV !== 'production') {
        console.log('[AdminDashboard] events loaded:', evs.length);
      }
    } catch (e) {
      console.error("fetch events error:", e);
      setLoading(false);
    }
  };

  const ymd = toLocalYMD(selectedDate);
  const todays = useMemo(() => events.filter((e) => e.date === ymd), [events, ymd]);
  const todayYMD = toLocalYMD(new Date());
  const renderApplyTab = () => {
  const sortedEvents = [...events]
    .filter(ev => ev && typeof ev === 'object')
    .sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || '');
    });
    return (
      <div>
      <h2 className="font-semibold mb-4">登録イベント一覧</h2>
        {loading && (
          <p className="text-sm text-gray-500">読み込み中…</p>
        )}
        <ul className="space-y-2">
          {!loading && sortedEvents.length === 0 && (
            <li className="text-gray-500 text-sm">現時点でイベントはありません。</li>
          )}
        {sortedEvents.map((ev) => {
          const isDecided = decidedEventIds.has(ev.id);
          const liCls = isDecided ? "border rounded-lg p-3 bg-green-50 border-green-200" : "border rounded-lg p-3 bg-white";
          return (
            <li key={ev.id} className={liCls}>
              <div className="flex items-center gap-3">
                {ev.icon ? (
                  <img src={ev.icon} alt="" className="w-10 h-10 object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded bg-gray-100" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center">
                    <div className="font-semibold text-[15px] truncate">{ev.label || '(無題イベント)'}</div>
                  </div>
                  <div className="text-xs text-gray-600 truncate">{ev.date || '-'} {ev.start_time || ''}〜{ev.end_time || ''}</div>
                </div>
              <div className="flex flex-col gap-2 ml-2">
                <button
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm"
                  onClick={() => {
                    setActiveTab("calendar");
                    nav("/admin/dashboard?tab=calendar", { replace: true });
                    setTimeout(() => openFairness(ev.id), 0);
                  }}
                >
                  応募状況
                </button>
                <button
                  className="px-3 py-1.5 rounded bg-gray-100 text-gray-800 text-sm"
                  onClick={() => {
                    setActiveTab("calendar");
                    nav("/admin/dashboard?tab=calendar", { replace: true });
                    setTimeout(() => handleEdit(ev), 0);
                  }}
                >
                  編集
                </button>
                <button className="px-3 py-1.5 rounded bg-red-600 text-white text-sm" onClick={() => handleDelete(ev.id)}>削除</button>
                </div>
              </div>
            </li>
          );
        })}
        </ul>
      </div>
    );
  };

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
        capacity_driver: 1, // 確定で一人ずつ
        capacity_attendant: 1, // 確定で一人ずつ
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

  // イベント編集開始
  const handleEdit = (ev) => {
    setEditingEvent(ev);
    setEditLabel(ev.label || "");
    setEditIcon(ev.icon || "");
    setEditStart(ev.start_time || "10:00");
    setEditEnd(ev.end_time || "12:00");
    setEditDate(ev.date || "");
    setEditOpen(true);
  };

  // イベント更新
  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingEvent) return;

    try {
      const r = await apiFetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEvent.id,
          label: editLabel || null,
          icon: editIcon || "",
          start_time: editStart || null,
          end_time: editEnd || null,
          date: editDate || null,
        }),
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      setEditOpen(false);
      setEditingEvent(null);
      await refresh();
      alert("イベントを更新しました");
    } catch (err) {
      alert(`更新に失敗しました: ${err.message}`);
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
    setSelDriver([]);
    setSelAttendant([]);
    setConfirmedDriver([]);
    setConfirmedAttendant([]);

    // イベント情報を取得（曜日とイベント名表示用）
    const eventInfo = events.find(e => e.id === eventId);
    if (eventInfo) {
      const eventDate = new Date(eventInfo.date);
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const dayName = dayNames[eventDate.getDay()];
      setFairEventInfo({
        date: eventInfo.date,
        dayName: dayName,
        label: eventInfo.label || 'イベント'
      });
    } else {
      setFairEventInfo(null);
    }

    await refreshUsers();

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
    }

    // 既存の確定を読み込み（成功・失敗に関わらず実行）
    try {
      const dec = await apiFetch(`/api?path=decide&event_id=${encodeURIComponent(eventId)}`);
      if (dec.ok && dec.data) {
        const confirmedDrivers = Array.isArray(dec.data.driver) ? dec.data.driver : [];
        const confirmedAttendants = Array.isArray(dec.data.attendant) ? dec.data.attendant : [];
        setConfirmedDriver(confirmedDrivers);
        setConfirmedAttendant(confirmedAttendants);
        // 確定済みを選択済みにも設定（既存の確定済みは選択済みとしても表示）
        setSelDriver(confirmedDrivers);
        setSelAttendant(confirmedAttendants);
      }
    } catch {}

    setFairLoading(false);
  };

  // 通知の未読数
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read_at).length;
  }, [notifications]);

  // Android 専用: ホームアイコンにバッジ表示（対応ブラウザのみ）
  useEffect(() => {
    try {
      const ua = navigator.userAgent || "";
      const isAndroid = /Android/i.test(ua);
      const canBadge = typeof navigator !== "undefined" && ("setAppBadge" in navigator || "setExperimentalAppBadge" in navigator);
      if (!isAndroid || !canBadge) return;

      const setBadge = navigator.setAppBadge || navigator.setExperimentalAppBadge;
      const clearBadge = navigator.clearAppBadge || navigator.clearExperimentalAppBadge || (() => Promise.resolve());

      if (unreadCount > 0) {
        Promise.resolve(setBadge.call(navigator, unreadCount)).catch(() => {});
      } else {
        Promise.resolve(clearBadge.call(navigator)).catch(() => {});
      }
    } catch {}
  }, [unreadCount]);

  // 通知タブの内容
  const renderNotificationsTab = () => (
    <div>
      <h2 className="font-semibold mb-4">通知一覧</h2>
      {notifications.length === 0 ? (
        <p className="text-sm text-gray-500">通知はありません。</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((notif) => {
            // 通知からイベントの日付を取得
            const eventForNotification = events.find(e => e.id === notif.event_id);
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
                key={notif.id} 
                className={`border rounded p-3 ${notif.read_at ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'} ${eventForNotification ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={handleNotificationClick}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-sm">{notif.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(notif.created_at).toLocaleString('ja-JP')}
                    </p>
                  </div>
                  {!notif.read_at && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await apiFetch("/api?path=notifications", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: notif.id }),
                          });
                          await refresh();
                        } catch (e) {
                          alert("既読にするのに失敗しました");
                        }
                      }}
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
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


  if (loading) return <div className="p-6">読み込み中…</div>;

  return (
    <>
    <div 
      className="min-h-screen p-4 sm:p-6"
      style={{ 
        backgroundColor: '#f0fdf4',
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
        marginBottom: 0
      }}
    >
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-4 sm:p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">🗓 管理者ダッシュボード</h1>
          <div className="flex items-center gap-3 text-sm">
            {userName && (
              <span className="text-gray-600">ログイン中: <span className="font-semibold">{userName}</span></span>
            )}
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

        {/* タブコンテンツ */}
        
        {activeTab === "calendar" && (
          <>
            {/* カレンダー */}
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
              decidedDates={decidedDates}
              decidedMembersByDate={{ ...decidedMembersByDate, _byEventId: decidedMembersByEventId }}
              cancelledDates={cancelledDates}
            />

        {/* 募集作成：常時表示をやめ、ボタンで開く */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm"
          >
            ＋ 募集を作成
          </button>
        </div>

        {createOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom))' }}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 shadow-lg max-h-[calc(100vh-120px)] overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-semibold">{ymd} の募集を作成</h2>
                <button onClick={() => setCreateOpen(false)} className="text-gray-500">✕</button>
              </div>
              <form onSubmit={async (e) => { await handleSubmit(e); setCreateOpen(false); }} className="space-y-3">

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
            {/* 選択解除 */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"
              >
                選択なしにする
              </button>
            </div>
            {/* プリセット（テキスト）: フリー運行 / 循環運行 */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCustomLabel("フリー運行")}
                className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"
                title="ラベルに『フリー運行』をセット"
              >
                フリー運行
              </button>
              <button
                type="button"
                onClick={() => setCustomLabel("循環運行")}
                className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"
                title="ラベルに『循環運行』をセット"
              >
                循環運行
              </button>
            </div>
          </div>

          {/* 自由記入（優先） */}
          <div className="mb-1">
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
          <div className="grid grid-cols-2 gap-3 mb-1">
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

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-3 py-2 rounded bg-gray-200 text-gray-800 text-sm">キャンセル</button>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">登録する</button>
          </div>
        </form>
            </div>
          </div>
        )}

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
                      className="px-3 py-1 rounded bg-green-600 text-white text-sm"
                      onClick={() => handleEdit(ev)}
                    >
                      編集
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
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" style={{ paddingBottom: '80px' }}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 shadow-lg max-h-[calc(100vh-120px)] overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold">
                  応募状況{fairEventInfo ? `（${fairEventInfo.date} ${fairEventInfo.dayName} ${fairEventInfo.label}）` : `（イベントID: ${fairData.event_id}）`}
                </h3>
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
                      {fairData.driver.map((u) => {
                        const isSelected = selDriver.includes(u.username);
                        const isConfirmed = confirmedDriver.includes(u.username);
                        const bgClass = isConfirmed 
                          ? 'bg-green-50 border-green-300 ring-1 ring-green-400' 
                          : isSelected 
                          ? 'bg-yellow-50 border-yellow-300 ring-1 ring-yellow-400' 
                          : '';
                        const textClass = isConfirmed 
                          ? 'font-semibold text-green-700' 
                          : isSelected 
                          ? 'font-semibold text-yellow-700' 
                          : '';
                        return (
                          <li 
                            key={`d-${u.username}-${u.rank}`} 
                            className={`border rounded p-2 text-sm ${bgClass}`}
                          >
                            <div className="flex justify-between items-center">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    setSelDriver((prev) =>
                                      e.target.checked
                                        ? Array.from(new Set([...prev, u.username]))
                                        : prev.filter((x) => x !== u.username)
                                    );
                                  }}
                                />
                                <span className={textClass}>
                                  #{u.rank} {u.username}
                                  {isConfirmed && <span className="ml-1 text-green-600">✓ 確定済み</span>}
                                  {!isConfirmed && isSelected && <span className="ml-1 text-yellow-600">✓ 選択済み</span>}
                                </span>
                              </label>
                              <span className="text-xs text-gray-500">{u.times ?? 0}回</span>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              最終: {u.last_at ? new Date(u.last_at).toLocaleDateString() : "なし"}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold mb-1">添乗員</h4>
                  {fairData.attendant.length === 0 ? (
                    <p className="text-xs text-gray-500">応募なし</p>
                  ) : (
                    <ul className="space-y-1">
                      {fairData.attendant.map((u) => {
                        const isSelected = selAttendant.includes(u.username);
                        const isConfirmed = confirmedAttendant.includes(u.username);
                        const bgClass = isConfirmed 
                          ? 'bg-green-50 border-green-300 ring-1 ring-green-400' 
                          : isSelected 
                          ? 'bg-yellow-50 border-yellow-300 ring-1 ring-yellow-400' 
                          : '';
                        const textClass = isConfirmed 
                          ? 'font-semibold text-green-700' 
                          : isSelected 
                          ? 'font-semibold text-yellow-700' 
                          : '';
                        return (
                          <li 
                            key={`a-${u.username}-${u.rank}`} 
                            className={`border rounded p-2 text-sm ${bgClass}`}
                          >
                            <div className="flex justify-between items-center">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    setSelAttendant((prev) =>
                                      e.target.checked
                                        ? Array.from(new Set([...prev, u.username]))
                                        : prev.filter((x) => x !== u.username)
                                    );
                                  }}
                                />
                                <span className={textClass}>
                                  #{u.rank} {u.username}
                                  {isConfirmed && <span className="ml-1 text-green-600">✓ 確定済み</span>}
                                  {!isConfirmed && isSelected && <span className="ml-1 text-yellow-600">✓ 選択済み</span>}
                                </span>
                              </label>
                              <span className="text-xs text-gray-500">{u.times ?? 0}回</span>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              最終: {u.last_at ? new Date(u.last_at).toLocaleDateString() : "なし"}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* 手動応募ボタン */}
              <div className="mt-4 border-t pt-3">
                <button
                  className="px-3 py-2 rounded bg-purple-600 text-white text-sm hover:bg-purple-700"
                  onClick={() => {
                    setManualApplyOpen(true);
                    refreshUsers();
                  }}
                >
                  手動で応募する
                </button>
              </div>

              {/* 操作行 */}
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <button
                  className="px-3 py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                  onClick={async () => {
                    if (!window.confirm("定員に合わせて自動選出しますか？（確定は保存されません。確定を保存ボタンで保存してください）")) return;
                    try {
                      const r = await apiFetch(`/api?path=decide_auto`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ event_id: fairData.event_id }),
                      });
                      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                      const autoDrivers = Array.isArray(r.data.driver) ? r.data.driver : [];
                      const autoAttendants = Array.isArray(r.data.attendant) ? r.data.attendant : [];
                      // 自動選出は選択済みとして設定（確定済みではない）
                      setSelDriver(autoDrivers);
                      setSelAttendant(autoAttendants);
                      alert(`自動選出が完了しました。\n運転手: ${autoDrivers.length}人、添乗員: ${autoAttendants.length}人\n※「確定を保存」ボタンで保存してください。`);
                    } catch (err) {
                      alert(`自動選出に失敗しました: ${err.message}`);
                    }
                  }}
                >
                  定員に合わせて自動選出
                </button>

                <button
                  className="px-3 py-2 rounded bg-blue-600 text-white text-sm"
                  onClick={async () => {
                    try {
                      const r = await apiFetch(`/api?path=decide`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          event_id: fairData.event_id,
                          driver: selDriver,
                          attendant: selAttendant,
                        }),
                      });
                      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                      // 選択済みを確定済みに反映
                      setConfirmedDriver(selDriver);
                      setConfirmedAttendant(selAttendant);
                      alert("確定を保存しました");
                      // カレンダーも更新
                      await refresh();
                    } catch (err) {
                      alert(`保存に失敗しました: ${err.message}`);
                    }
                  }}
                >
                  確定を保存
                </button>

                <button
                  className="px-3 py-2 rounded bg-gray-200 text-gray-800 text-sm"
                  onClick={async () => {
                    try {
                      const r = await apiFetch(`/api?path=decide&event_id=${encodeURIComponent(fairData.event_id)}`, { method: "DELETE" });
                      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                      setSelDriver([]);
                      setSelAttendant([]);
                      setConfirmedDriver([]);
                      setConfirmedAttendant([]);
                      alert("確定を解除しました");
                      // カレンダーも更新
                      await refresh();
                    } catch (err) {
                      alert(`解除に失敗しました: ${err.message}`);
                    }
                  }}
                >
                  確定を解除
                </button>
              </div>

            </div>
          </div>
        )}

        {/* apply/notifications は calendar ブロックの外に配置する */}

        {/* イベント編集モーダル */}
        {editOpen && editingEvent && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" style={{ paddingBottom: '80px' }}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 shadow-lg max-h-[calc(100vh-120px)] overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold">イベント編集（ID: {editingEvent.id}）</h3>
                <button onClick={() => setEditOpen(false)} className="text-gray-500">✕</button>
              </div>

              <form onSubmit={handleUpdate} className="space-y-3">
                {/* 日付 */}
                <label className="block text-sm">
                  日付
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="mt-1 w-full border rounded p-2"
                    required
                  />
                </label>

                {/* 画像選択 */}
                <div>
                  <div className="text-sm mb-2">イベントアイコン</div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {FIXED_EVENTS.map((fe) => {
                      const active = editIcon === fe.icon;
                      return (
                        <button
                          key={fe.key}
                          type="button"
                          onClick={() => setEditIcon(fe.icon)}
                          className={`flex flex-col items-center gap-1 border rounded-lg p-2 bg-white hover:bg-gray-50 ${
                            active ? "ring-2 ring-blue-500" : ""
                          }`}
                        >
                          <img
                            src={fe.icon}
                            alt={fe.label}
                            className="w-10 h-10 object-contain"
                            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                          />
                          <span className="text-[11px] text-gray-700">{fe.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 自由記入（優先） */}
                <label className="block text-sm">
                  ラベル（自由記入）
                  <input
                    type="text"
                    placeholder="自由記入（任意）"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="mt-1 w-full border rounded p-2"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">※自由記入がある場合は画像ラベルより優先されます</p>
                </label>

                {/* 時間 */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    開始
                    <input
                      type="time"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                      className="mt-1 w-full border rounded p-2"
                    />
                  </label>
                  <label className="text-sm">
                    終了
                    <input
                      type="time"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                      className="mt-1 w-full border rounded p-2"
                    />
                  </label>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="submit"
                    className="flex-1 px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                  >
                    更新する
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="px-3 py-2 rounded bg-gray-200 text-gray-800 text-sm hover:bg-gray-300"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 手動応募モーダル */}
        {manualApplyOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" style={{ paddingBottom: '80px' }}>
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 shadow-lg max-h-[calc(100vh-120px)] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold">手動で応募する</h3>
                <button onClick={() => setManualApplyOpen(false)} className="text-gray-500">✕</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">ユーザー</label>
                  <select
                    value={selectedUsername}
                    onChange={(e) => setSelectedUsername(e.target.value)}
                    className="w-full border rounded p-2"
                  >
                    <option value="">選択してください</option>
                    {users.map(u => (
                      <option key={u.username} value={u.username}>{u.username}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">役割</label>
                  <select
                    value={selectedKind}
                    onChange={(e) => setSelectedKind(e.target.value)}
                    className="w-full border rounded p-2"
                  >
                    <option value="driver">運転手</option>
                    <option value="attendant">添乗員</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleManualApply}
                    className="flex-1 px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700"
                  >
                    応募を登録
                  </button>
                  <button
                    onClick={() => setManualApplyOpen(false)}
                    className="px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
        )}

        {activeTab === "apply" && renderApplyTab()}
        {activeTab === "notifications" && renderNotificationsTab()}
      </div>
    </div>

    {/* 固定タブバー */}
    <div 
      id="admin-tab-bar"
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
        gridTemplateColumns: 'repeat(4, 1fr)', 
        WebkitGridTemplateColumns: 'repeat(4, 1fr)',
        width: '100%', 
        height: '100%', 
        minHeight: '72px' 
      }}>
        <button
          onClick={() => {
            setActiveTab("calendar");
            nav("/admin/dashboard?tab=calendar", { replace: true });
          }}
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
        >
          <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: '500' }}>カレンダー</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("apply");
            nav("/admin/dashboard?tab=apply", { replace: true });
          }}
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
          <span style={{ fontSize: '12px', fontWeight: '500' }}>イベント一覧</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("notifications");
            nav("/admin/dashboard?tab=notifications", { replace: true });
          }}
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
          onClick={() => nav("/admin/users")}
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
            backgroundColor: activeTab === "users" ? '#dbeafe' : 'transparent',
            color: activeTab === "users" ? '#2563eb' : '#4b5563',
            fontWeight: activeTab === "users" ? '600' : '400',
            border: 'none',
            cursor: 'pointer',
            WebkitTransition: 'all 0.2s',
            transition: 'all 0.2s'
          }}
        >
          <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: '500' }}>ユーザー管理</span>
        </button>
      </div>
    </div>
    </>
    );
  };
