// src/pages/AdminDashboard.js
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Calendar from "../components/Calendar.js";
import Toast from "../components/Toast.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import { useToast } from "../hooks/useToast.js";
import { useConfirmDialog } from "../hooks/useConfirmDialog.js";
import { toLocalYMD } from "../lib/date.js";

// 500/HTMLにも耐える軽量 fetch（ネットワークエラー検知付き）
async function apiFetch(url, options = {}, onNetworkError) {
  try {
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
  } catch (error) {
    // ネットワークエラーの場合
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      if (onNetworkError) {
        onNetworkError();
      }
      throw new Error('ネットワークエラーが発生しました。インターネット接続を確認してください。');
    }
    throw error;
  }
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

// フリー運行・循環運行のアイコンを取得するヘルパー関数
const getEventIcon = (label, icon) => {
  if (!label) return icon || "";
  
  // フリー運行または循環運行の場合、専用アイコンを返す
  if (label.includes("フリー運行") || label.includes("循環運行")) {
    return "/icons/app-icon-180.png";
  }
  
  // それ以外の場合は既存のiconを返す
  return icon || "";
};

export default function AdminDashboard() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast, showToast, hideToast } = useToast();
  const { dialog, showConfirm, hideConfirm } = useConfirmDialog();
  const [userName, setUserName] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // タブ管理（URLパラメータから取得、デフォルトはcalendar）
  const [activeTab, setActiveTab] = useState(() => {
    let tab = searchParams.get("tab");
    // 軽い入力ミスを許容（例: aaply, appl, applies など）
    if (tab && /^appl/i.test(tab)) tab = "apply";
    return tab && ["calendar", "apply", "notifications", "mypage"].includes(tab) ? tab : "calendar";
  });

  // URLパラメータの変更を監視
  useEffect(() => {
    let tab = searchParams.get("tab");
    if (tab && /^appl/i.test(tab)) tab = "apply";
    if (tab && ["calendar", "apply", "notifications", "mypage"].includes(tab)) {
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
  
  // イベント一覧の検索・フィルタリング
  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [eventFilterStatus, setEventFilterStatus] = useState("all"); // all, decided, pending

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
  
  // イベント複製モーダル
  const [duplicatingEvent, setDuplicatingEvent] = useState(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState("");
  const [duplicateCount, setDuplicateCount] = useState(1); // 複製回数
  const [duplicateInterval, setDuplicateInterval] = useState("day"); // day, week, month

  // 手動応募モーダル
  const [manualApplyOpen, setManualApplyOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUsername, setSelectedUsername] = useState("");
  const [selectedKind, setSelectedKind] = useState("driver");

  // イベント一・覧の表示開始日（デフォルトは今日）
  const [eventListStartDate, setEventListStartDate] = useState(() => toLocalYMD(new Date()));

  // スクロール位置保持用（イベント一覧用）
  const eventListContainerRef = useRef(null);
  const eventListScrollPositionRef = useRef(0);

  // ユーザー設定
  const [userSettings, setUserSettings] = useState({
    notifications_enabled: true,
  });

  // ネットワーク状態の監視
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('インターネット接続が復旧しました', 'success');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('インターネット接続が切断されました', 'warning', 5000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // ネットワークエラー時のハンドラー
  const handleNetworkError = useCallback(() => {
    if (!isOnline) {
      showToast('オフラインです。インターネット接続を確認してください。', 'error', 5000);
    }
  }, [isOnline, showToast]);

  // 管理者認証
  useEffect(() => {
    // ログアウト直後の場合はログインページへ
    const justLoggedOut = sessionStorage.getItem("justLoggedOut");
    if (justLoggedOut === "true") {
      sessionStorage.removeItem("justLoggedOut");
      nav("/admin");
      return;
    }
    
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      showToast("管理者のみアクセス可能です", 'error');
      nav("/admin");
      return;
    }
    // 表示用: 現在のログインユーザー名
    const storedName = localStorage.getItem("userName");
    if (storedName) setUserName(storedName);
    // 念のためサーバで確認
    (async () => {
      try {
        const r = await apiFetch("/api?path=me", {}, handleNetworkError);
        if (r.ok && r.data?.username) {
          setUserName(r.data.username);
          if (!storedName) localStorage.setItem("userName", r.data.username);
        }
      } catch {}
    })();
    refresh();
    refreshUserSettings();
  }, [nav, handleNetworkError]);

  // ユーザー設定の取得
  const refreshUserSettings = async () => {
    try {
      const res = await apiFetch('/api?path=user-settings', {}, handleNetworkError);
      if (res.ok && res.data) {
        setUserSettings({
          notifications_enabled: res.data.notifications_enabled !== false,
        });
      }
    } catch (e) {
      console.error('ユーザー設定の取得エラー:', e);
    }
  };


  // ユーザー設定を保存
  const saveUserSettings = async () => {
    try {
      await apiFetch(`/api?path=user-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userSettings),
      }, handleNetworkError);
      showToast("設定を保存しました", 'success');
    } catch (e) {
      showToast(`設定の保存に失敗しました: ${e.message}`, 'error');
    }
  };


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
      showToast("ユーザーを選択してください", 'warning');
      return;
    }
    try {
      // 「両方」が選択された場合、運転手と添乗員の両方に応募
      if (selectedKind === "both") {
        // 運転手に応募
        const r1 = await apiFetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: fairData.event_id,
            username: selectedUsername,
            kind: "driver",
          }),
        }, handleNetworkError);
        if (!r1.ok) throw new Error(r1.data?.error || `HTTP ${r1.status}`);

        // 添乗員に応募
        const r2 = await apiFetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: fairData.event_id,
            username: selectedUsername,
            kind: "attendant",
          }),
        }, handleNetworkError);
        if (!r2.ok) throw new Error(r2.data?.error || `HTTP ${r2.status}`);

        showToast("応募を登録しました（運転手・添乗員の両方）", 'success');
      } else {
        // 通常の応募（運転手または添乗員）
        const r = await apiFetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: fairData.event_id,
            username: selectedUsername,
            kind: selectedKind,
          }),
        }, handleNetworkError);
        if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
        showToast("応募を登録しました", 'success');
      }
      setManualApplyOpen(false);
      setSelectedUsername("");
      await openFairness(fairData.event_id);
      await refresh();
    } catch (e) {
      showToast(`応募の登録に失敗しました: ${e.message}`, 'error');
    }
  };

  // イベント取得
  const refresh = async () => {
    // スクロール位置を保存（イベント一覧タブが表示されている場合）
    if (activeTab === "apply" && eventListContainerRef.current) {
      eventListScrollPositionRef.current = eventListContainerRef.current.scrollTop;
    }
    setLoading(true);
    try {
      // 1) まずイベントだけ取得して即描画
      const r = await apiFetch("/api/events", {}, handleNetworkError);
      const evs = Array.isArray(r.data) ? r.data : [];
      setEvents(evs);
      setLoading(false); // ここで即座にローディング解除
      
      // スクロール位置を復元（イベント一覧タブが表示されている場合）
      if (activeTab === "apply") {
        requestAnimationFrame(() => {
          if (eventListContainerRef.current) {
            eventListContainerRef.current.scrollTop = eventListScrollPositionRef.current;
          }
        });
      }

      // 2) 以降はバックグラウンド更新（描画はブロックしない）
      // 状態をリセットせず、後続のuseEffectで統一して更新されるまで待つ
      
      // 通知一覧を取得してキャンセル情報と通知一覧の両方を更新（1回のAPI呼び出し）
      (async () => {
        try {
          const notifs = await apiFetch("/api?path=notifications", {}, handleNetworkError);
          if (notifs.ok && Array.isArray(notifs.data)) {
            // 通知一覧をセット
            setNotifications(notifs.data);
          }
        } catch {}
      })();

      // 一覧用：確定済みイベントの簡易判定（重くならない範囲で最大60件）
      (async () => {
        const ids = new Set();
        for (const ev of evs.slice(0, 60)) {
          try {
            const d = await apiFetch(`/api?path=decide&event_id=${ev.id}`, {}, handleNetworkError);
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

  // すべてのイベントの確定状況を取得（カレンダーの色分け用）
  useEffect(() => {
    let aborted = false;
    (async () => {
      if (!Array.isArray(events) || events.length === 0) {
        if (!aborted) {
          setDecidedMembersByEventId({});
          setDecidedMembersByDate({});
          setDecidedDates(new Set());
          setCancelledDates(new Set());
        }
        return;
      }

      // 1. すべてのイベントの確定状況を取得
      const allDecidedByEventId = {};
      const tasks = events.map(async (ev) => {
        try {
          const dec = await apiFetch(`/api?path=decide&event_id=${ev.id}`, {}, handleNetworkError);
          if (dec.ok && dec.data) {
            allDecidedByEventId[ev.id] = {
              driver: Array.isArray(dec.data.driver) ? dec.data.driver : [],
              attendant: Array.isArray(dec.data.attendant) ? dec.data.attendant : [],
            };
          } else {
            allDecidedByEventId[ev.id] = { driver: [], attendant: [] };
          }
        } catch {
          allDecidedByEventId[ev.id] = { driver: [], attendant: [] };
        }
      });
      await Promise.all(tasks);
      if (aborted) return;

      // 2. 日付ごとに確定済みメンバーをまとめる
      const decidedByDate = {};
      const decidedDateSet = new Set();
      for (const ev of events) {
        if (!ev.date) continue;
        const evDecided = allDecidedByEventId[ev.id];
        if (evDecided && (evDecided.driver?.length > 0 || evDecided.attendant?.length > 0)) {
          if (!decidedByDate[ev.date]) {
            decidedByDate[ev.date] = { driver: [], attendant: [] };
          }
          // 日付単位では、どれか一つでも確定していればその日付を確定として扱う
          decidedDateSet.add(ev.date);
        }
      }

      // 3. 確定後のキャンセル通知をチェック（運転手・添乗員として確定された人がキャンセルした場合のみ）
      const cancelDateSet = new Set();
      try {
        const notifsRes = await apiFetch("/api?path=notifications", {}, handleNetworkError);
        if (notifsRes.ok && Array.isArray(notifsRes.data)) {
          for (const notif of notifsRes.data) {
            // cancel_driver または cancel_attendant のみ（確定後のキャンセル）
            if (notif.kind === "cancel_driver" || notif.kind === "cancel_attendant") {
              const ev = events.find(e => e.id === notif.event_id);
              if (ev && ev.date) {
                cancelDateSet.add(ev.date);
              }
            }
          }
        }
      } catch {}

      if (!aborted) {
        // すべての状態を一度に更新（競合を防ぐ）
        setDecidedMembersByEventId(allDecidedByEventId);
        setDecidedMembersByDate(decidedByDate);
        setDecidedDates(decidedDateSet);
        setCancelledDates(cancelDateSet);
      }
    })();
    return () => { aborted = true; };
  }, [events, handleNetworkError]);

  const ymd = toLocalYMD(selectedDate);
  const todays = useMemo(() => events.filter((e) => e.date === ymd), [events, ymd]);
  const todayYMD = toLocalYMD(new Date());

  // カレンダーに渡すpropsをメモ化（再レンダリングを防ぐ）
  const calendarDecidedMembersByDate = useMemo(() => {
    return { ...decidedMembersByDate, _byEventId: decidedMembersByEventId };
  }, [decidedMembersByDate, decidedMembersByEventId]);

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
  
  // 1ヶ月前の日付を計算する関数
  const getOneMonthAgo = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    date.setMonth(date.getMonth() - 1);
    return toLocalYMD(date);
  };
  
  // 1ヶ月後の日付を計算する関数
  const getOneMonthLater = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    date.setMonth(date.getMonth() + 1);
    return toLocalYMD(date);
  };
  
  const renderApplyTab = () => {
    // 表示開始日から1ヶ月後の日付を計算
    const endDate = getOneMonthLater(eventListStartDate);
    const isShowingFuture = eventListStartDate >= todayYMD;
    
    // 今日以降のイベントでフィルタリング（日付）
    let filteredEvents = events.filter(ev => {
      if (!ev || typeof ev !== 'object' || !ev.date) return false;
      // 開始日以上、終了日未満のイベントを表示
      return ev.date >= eventListStartDate && ev.date < endDate;
    });
    
    // 検索クエリでフィルタリング
    if (eventSearchQuery.trim()) {
      const query = eventSearchQuery.toLowerCase().trim();
      filteredEvents = filteredEvents.filter(ev => {
        const label = (ev.label || '').toLowerCase();
        const date = ev.date || '';
        return label.includes(query) || date.includes(query);
      });
    }
    
    // 確定状況でフィルタリング
    if (eventFilterStatus !== 'all') {
      filteredEvents = filteredEvents.filter(ev => {
        const isDecided = decidedEventIds.has(ev.id);
        if (eventFilterStatus === 'decided') return isDecided;
        if (eventFilterStatus === 'pending') return !isDecided;
        return true;
      });
    }
      
    const sortedEvents = [...filteredEvents]
      .sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || '');
      });
    
    // 表示期間の文字列を作成
    const startDateObj = new Date(eventListStartDate + 'T00:00:00');
    const endDateObj = new Date(endDate + 'T00:00:00');
    const periodStr = `${startDateObj.getFullYear()}年${startDateObj.getMonth() + 1}月${startDateObj.getDate()}日 〜 ${endDateObj.getFullYear()}年${endDateObj.getMonth() + 1}月${endDateObj.getDate()}日`;
    
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">登録イベント一覧</h2>
          <div className="flex gap-2 items-center">
            {/* 検索・フィルター */}
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="検索..."
                value={eventSearchQuery}
                onChange={(e) => setEventSearchQuery(e.target.value)}
                className="px-2 py-1 text-sm border rounded w-32"
              />
              <select
                value={eventFilterStatus}
                onChange={(e) => setEventFilterStatus(e.target.value)}
                className="px-2 py-1 text-sm border rounded"
              >
                <option value="all">全て</option>
                <option value="decided">確定済み</option>
                <option value="pending">未確定</option>
              </select>
            </div>
            {!isShowingFuture && (
              <button
                onClick={() => {
                  const oneMonthLater = getOneMonthLater(eventListStartDate);
                  setEventListStartDate(oneMonthLater);
                }}
                className="px-2 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                ▶ 1ヶ月後
              </button>
            )}
            <button
              onClick={() => {
                const oneMonthAgo = getOneMonthAgo(eventListStartDate);
                setEventListStartDate(oneMonthAgo);
              }}
              className="px-2 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              ◀ 1ヶ月前
            </button>
            {!isShowingFuture && (
              <button
                onClick={() => setEventListStartDate(todayYMD)}
                className="px-2 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                今日以降に戻る
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-3">{periodStr}</p>
        {loading && (
          <p className="text-sm text-gray-500">読み込み中…</p>
        )}
        <div 
          ref={eventListContainerRef}
          className="overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 400px)' }}
        >
          <ul className="space-y-2">
          {!loading && sortedEvents.length === 0 && (
            <li className="text-gray-500 text-sm">この期間にはイベントはありません。</li>
          )}
        {sortedEvents.map((ev) => {
          const isDecided = decidedEventIds.has(ev.id);
          const decision = decidedMembersByEventId[ev.id] || { driver: [], attendant: [] };
          const liCls = isDecided ? "border rounded-lg p-3 bg-green-50 border-green-200" : "border rounded-lg p-3 bg-white";
          return (
            <li key={ev.id} className={liCls}>
              <div className="flex items-center gap-3">
                {(() => {
                  const eventIcon = getEventIcon(ev.label, ev.icon);
                  return eventIcon ? (
                    <img src={eventIcon} alt="" className="w-10 h-10 object-contain" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-100" />
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center">
                    <div className="font-semibold text-[15px] truncate">{ev.label || '(無題イベント)'}</div>
                    {isDecided && (
                      <span className="px-1.5 py-0.5 text-xs bg-green-600 text-white rounded">確定</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 truncate">{ev.date || '-'} {ev.start_time || ''}〜{ev.end_time || ''}</div>
                  {isDecided && (
                    <div className="text-xs text-gray-500 mt-1">
                      運転手: {decision.driver.length > 0 ? decision.driver.join(', ') : '未定'} | 
                      添乗員: {decision.attendant.length > 0 ? decision.attendant.join(', ') : '未定'}
                    </div>
                  )}
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
                <div className="flex gap-1">
                  <button
                    className="px-2 py-1 rounded bg-gray-100 text-gray-800 text-xs"
                    onClick={() => {
                      setActiveTab("calendar");
                      nav("/admin/dashboard?tab=calendar", { replace: true });
                      setTimeout(() => handleEdit(ev), 0);
                    }}
                    title="編集"
                  >
                    編集
                  </button>
                  <button
                    className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs"
                    onClick={() => handleDuplicate(ev)}
                    title="複製"
                  >
                    複製
                  </button>
                  <button 
                    className="px-2 py-1 rounded bg-red-600 text-white text-xs" 
                    onClick={() => handleDelete(ev.id)}
                    title="削除"
                  >
                    削除
                  </button>
                </div>
                </div>
              </div>
            </li>
          );
        })}
          </ul>
        </div>
      </div>
    );
  };

  // 募集登録
  const handleSubmit = async (e) => {
    e.preventDefault();
    const label = (customLabel || "").trim() || (selectedEvent?.label || "").trim();
    if (!label) {
      showToast("イベント名を入力するか、画像からイベント種類を選択してください。", 'warning');
      return;
    }
    if (!start || !end) {
      showToast("開始/終了時間を入力してください。", 'warning');
      return;
    }

    // スクロール位置を保存（イベント一覧が表示されている場合）
    if (activeTab === "apply" && eventListContainerRef.current) {
      eventListScrollPositionRef.current = eventListContainerRef.current.scrollTop;
    }

    try {
      // フリー運行・循環運行の場合は専用アイコンを設定
      let eventIcon = selectedEvent?.icon || "";
      if (label.includes("フリー運行") || label.includes("循環運行")) {
        eventIcon = "/icons/app-icon-180.png";
      }
      
      const body = {
        date: ymd,
        label,
        icon: eventIcon,
        start_time: start,
        end_time: end,
        capacity_driver: 1, // 確定で一人ずつ
        capacity_attendant: 1, // 確定で一人ずつ
      };

      const r = await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, handleNetworkError);
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);

      showToast("イベントを登録しました", 'success');
      setCustomLabel("");
      await refresh();
    } catch (err) {
      console.error("create event error:", err);
      showToast(`登録に失敗しました: ${err.message}`, 'error');
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

    // スクロール位置を保存
    if (activeTab === "apply" && eventListContainerRef.current) {
      eventListScrollPositionRef.current = eventListContainerRef.current.scrollTop;
    }

    try {
      // フリー運行・循環運行の場合は専用アイコンを設定
      let eventIcon = editIcon || "";
      if (editLabel && (editLabel.includes("フリー運行") || editLabel.includes("循環運行"))) {
        eventIcon = "/icons/app-icon-180.png";
      }
      
      const r = await apiFetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEvent.id,
          label: editLabel || null,
          icon: eventIcon,
          start_time: editStart || null,
          end_time: editEnd || null,
          date: editDate || null,
        }),
      }, handleNetworkError);
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      setEditOpen(false);
      setEditingEvent(null);
      await refresh();
      showToast("イベントを更新しました", 'success');
    } catch (err) {
      showToast(`更新に失敗しました: ${err.message}`, 'error');
    }
  };

  // イベント削除
  const handleDelete = async (id) => {
    const confirmed = await showConfirm({
      title: 'イベントの削除',
      message: 'このイベントを削除しますか？',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      type: 'danger',
    });
    if (!confirmed) return;
    // スクロール位置を保存
    if (activeTab === "apply" && eventListContainerRef.current) {
      eventListScrollPositionRef.current = eventListContainerRef.current.scrollTop;
    }
    try {
      const r = await apiFetch(`/api/events?id=${encodeURIComponent(id)}`, { method: "DELETE" }, handleNetworkError);
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      showToast("イベントを削除しました", 'success');
      await refresh();
    } catch (err) {
      showToast(`削除に失敗しました: ${err.message}`, 'error');
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
      console.log(`[AdminDashboard] Trying fairness API: ${url}`);
      const r = await apiFetch(url);
      console.log(`[AdminDashboard] Fairness API response:`, { ok: r.ok, status: r.status, data: r.data });
      if (!r.ok) {
        const errorMsg = r.data?.error || r.text || `HTTP ${r.status}`;
        console.error(`[AdminDashboard] Fairness API failed: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      return r.data;
    };

    let fairnessData = null; // 自動選出用に保持
    try {
      let data = null;
      try {
        data = await tryFairness(`/api/fairness?event_id=${encodeURIComponent(eventId)}`);
      } catch (e1) {
        console.error(`[AdminDashboard] /api/fairness failed:`, e1);
        // 2) rewrite 環境用フォールバック
        try {
          data = await tryFairness(`/api?path=fairness&event_id=${encodeURIComponent(eventId)}`);
        } catch (e2) {
          console.error(`[AdminDashboard] /api?path=fairness failed:`, e2);
          throw e2; // 両方失敗した場合はエラーを再スロー
        }
      }

      // 期待形 { driver:[], attendant:[] }
      fairnessData = {
        event_id: eventId,
        driver: Array.isArray(data.driver) ? data.driver : [],
        attendant: Array.isArray(data.attendant) ? data.attendant : [],
      };
      
      // デバッグ用：fairnessデータの内容をログ出力
      console.log('[AdminDashboard] ===== FAIRNESS DATA RECEIVED =====');
      console.log('[AdminDashboard] raw data:', JSON.stringify(data, null, 2));
      console.log('[AdminDashboard] fairnessData:', JSON.stringify(fairnessData, null, 2));
      console.log('[AdminDashboard] driver count:', fairnessData.driver.length);
      console.log('[AdminDashboard] attendant count:', fairnessData.attendant.length);
      if (fairnessData.driver.length > 0) {
        console.log('[AdminDashboard] first driver:', JSON.stringify(fairnessData.driver[0], null, 2));
        console.log('[AdminDashboard] first driver count30:', fairnessData.driver[0].count30, 'roleCount30:', fairnessData.driver[0].roleCount30);
        console.log('[AdminDashboard] all drivers count30:', fairnessData.driver.map(d => ({ username: d.username, count30: d.count30, roleCount30: d.roleCount30, hasCount30: d.count30 !== undefined })));
      }
      if (fairnessData.attendant.length > 0) {
        console.log('[AdminDashboard] first attendant:', JSON.stringify(fairnessData.attendant[0], null, 2));
        console.log('[AdminDashboard] first attendant count30:', fairnessData.attendant[0].count30, 'roleCount30:', fairnessData.attendant[0].roleCount30);
        console.log('[AdminDashboard] all attendants count30:', fairnessData.attendant.map(a => ({ username: a.username, count30: a.count30, roleCount30: a.roleCount30, hasCount30: a.count30 !== undefined })));
      }
      console.log('[AdminDashboard] ===== END =====');
      
      setFairData(fairnessData);
    } catch (e) {
      // fairness APIが失敗した原因をログ出力
      console.error('[AdminDashboard] fairness API failed:', e);
      console.error('[AdminDashboard] error message:', e.message);
      console.error('[AdminDashboard] error stack:', e.stack);
      
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
            // フォールバック時は公平性データが取得できないため、デフォルト値を設定
            count30: 0,
            roleCount30: 0,
            gapDays: 9999,
            score: 9999,
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
            // フォールバック時は公平性データが取得できないため、デフォルト値を設定
            count30: 0,
            roleCount30: 0,
            gapDays: 9999,
            score: 9999,
          }));

        fairnessData = { event_id: eventId, driver, attendant };
        setFairData(fairnessData);
        setFairError(`公平性アルゴリズムが使用できませんでした。エラー: ${e.message || '不明なエラー'}`);
      } catch (e2) {
        setFairError(e2.message || "応募状況の取得に失敗しました。");
      }
    }

    // 既存の確定を読み込み（成功・失敗に関わらず実行）
    let hasExistingDecisions = false;
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
        hasExistingDecisions = confirmedDrivers.length > 0 || confirmedAttendants.length > 0;
        
        // 確定済みのユーザーがfairDataに含まれていない場合、fairDataに追加
        if (fairnessData) {
          const driverUsernames = new Set(fairnessData.driver.map(d => d.username));
          const attendantUsernames = new Set(fairnessData.attendant.map(a => a.username));
          
          // 確定済みの運転手でfairDataに含まれていないユーザーを追加
          confirmedDrivers.forEach(username => {
            if (!driverUsernames.has(username)) {
              fairnessData.driver.push({
                username,
                kind: 'driver',
                times: 0,
                last_at: null,
                applied_at: null,
                rank: fairnessData.driver.length + 1,
                count60: 0,
                roleCount60: 0,
                gapDays: 9999,
                score: 9999,
              });
            }
          });
          
          // 確定済みの添乗員でfairDataに含まれていないユーザーを追加
          confirmedAttendants.forEach(username => {
            if (!attendantUsernames.has(username)) {
              fairnessData.attendant.push({
                username,
                kind: 'attendant',
                times: 0,
                last_at: null,
                applied_at: null,
                rank: fairnessData.attendant.length + 1,
                count60: 0,
                roleCount60: 0,
                gapDays: 9999,
                score: 9999,
              });
            }
          });
          
          // 確定済みのユーザーのlast_atを更新するため、fairness APIを再度呼び出す
          // fairness APIは確定済みユーザーもallApplicantsに含めるため、last_atが取得できる
          try {
            const fairnessDataWithConfirmed = await tryFairness(`/api/fairness?event_id=${encodeURIComponent(eventId)}`).catch(() => 
              tryFairness(`/api?path=fairness&event_id=${encodeURIComponent(eventId)}`)
            );
            
            if (fairnessDataWithConfirmed) {
              // 確定済みのユーザーのlast_atを更新
              const driverMap = new Map(fairnessDataWithConfirmed.driver.map(d => [d.username, d]));
              const attendantMap = new Map(fairnessDataWithConfirmed.attendant.map(a => [a.username, a]));
              
              // 既存のfairnessDataのユーザーを更新
              fairnessData.driver.forEach(d => {
                if (driverMap.has(d.username)) {
                  const updated = driverMap.get(d.username);
                  d.last_at = updated.last_at;
                  d.count30 = updated.count30;
                  d.roleCount30 = updated.roleCount30;
                  d.gapDays = updated.gapDays;
                  d.times = updated.times;
                }
              });
              
              fairnessData.attendant.forEach(a => {
                if (attendantMap.has(a.username)) {
                  const updated = attendantMap.get(a.username);
                  a.last_at = updated.last_at;
                  a.count30 = updated.count30;
                  a.roleCount30 = updated.roleCount30;
                  a.gapDays = updated.gapDays;
                  a.times = updated.times;
                }
              });
              
              // 更新されたfairnessDataを再設定
              setFairData({ ...fairnessData });
            }
          } catch (e) {
            console.error('[AdminDashboard] Failed to update last_at for confirmed users:', e);
            // エラーが発生した場合でも、fairnessDataを再設定
            setFairData({ ...fairnessData });
          }
        }
      }
    } catch {}

    // 既存の確定がない場合、fairnessデータに基づいて自動選出
    if (!hasExistingDecisions && fairnessData && fairnessData.driver && fairnessData.attendant) {
      try {
        // イベントの定員情報を取得
        const eventInfo = events.find(e => e.id === eventId);
        const capacityDriver = eventInfo?.capacity_driver != null ? Number(eventInfo.capacity_driver) : 1;
        const capacityAttendant = eventInfo?.capacity_attendant != null ? Number(eventInfo.capacity_attendant) : 1;

        // fairnessデータのrank順に従って、1名ずつ自動選出
        const autoDrivers = fairnessData.driver.length > 0
          ? [fairnessData.driver[0].username]
          : [];
        
        // 運転手として選出された人は添乗員から除外（同じ人が両方に選ばれないようにする）
        const autoDriverSet = new Set(autoDrivers);
        const filteredAttendants = fairnessData.attendant.filter(item => {
          // itemがオブジェクトでusernameプロパティを持っていることを確認
          if (!item || typeof item !== 'object' || !item.username) {
            return false;
          }
          return !autoDriverSet.has(item.username);
        });
        const autoAttendants = filteredAttendants.length > 0
          ? [filteredAttendants[0].username]
          : [];

        // 自動選出結果を選択済みとして設定
        setSelDriver(autoDrivers);
        setSelAttendant(autoAttendants);
      } catch (err) {
        // 自動選出に失敗してもエラーを表示しない（静かに失敗）
        console.error('自動選出エラー:', err);
      }
    }

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
              <span className="font-medium">役割:</span> 管理者
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

      {/* 設定保存ボタン */}
      <div className="mb-6">
        <button
          onClick={saveUserSettings}
          className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
        >
          設定を保存
        </button>
      </div>
    </div>
  );

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
                          showToast("既読にするのに失敗しました", 'error');
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
          <h1 className="text-xl font-bold">調整者    ページ</h1>
          <div className="flex items-center gap-3 text-sm">
            {userName && (
              <span className="text-gray-600">ログイン中: <span className="font-semibold">{userName}</span></span>
            )}
            <button
              onClick={async () => {
                // ログアウトフラグを設定（自動ログインを防ぐ）
                sessionStorage.setItem("justLoggedOut", "true");
                
                // ログアウトAPIを呼び出してクッキーを削除
                try {
                  await apiFetch("/api?path=logout", { method: "POST" });
                } catch (e) {
                  console.error("Logout API error:", e);
                }
                
                localStorage.clear();
                
                // クッキーが削除されるまで少し待ってからリロード
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // ログインページへ移動
                window.location.href = "/admin";
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
              decidedDates={memoizedDecidedDates}
              decidedMembersByDate={calendarDecidedMembersByDate}
              cancelledDates={memoizedCancelledDates}
              isAdminView={true}
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
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center" style={{ zIndex: 100000, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 shadow-lg max-h-[calc(100vh-140px)] overflow-y-auto">
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
                    {(() => {
                      const eventIcon = getEventIcon(ev.label, ev.icon);
                      return eventIcon ? <img src={eventIcon} alt="" className="w-6 h-6" /> : null;
                    })()}
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
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center" style={{ zIndex: 100000, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 shadow-lg max-h-[calc(100vh-140px)] overflow-y-auto">
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

              {(() => {
                // 両方に応募している人を特定
                const driverUsernames = new Set(fairData.driver.map(u => u.username));
                const bothApplicants = new Set(fairData.attendant.filter(u => driverUsernames.has(u.username)).map(u => u.username));
                
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-1">運転手</h4>
                      {fairData.driver.length === 0 ? (
                        <p className="text-xs text-gray-500">応募なし</p>
                      ) : (
                        <ul className="space-y-1">
                          {fairData.driver.map((u) => {
                            const isSelectedDriver = selDriver.includes(u.username);
                            const isSelectedAttendant = selAttendant.includes(u.username);
                            const isBothApplicant = bothApplicants.has(u.username);
                            // 運転手セクションでは、運転手として選択されているかどうかで判定
                            const isSelected = isSelectedDriver;
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
                                        if (e.target.checked) {
                                          // 運転手として選択（1名のみ選択可能）
                                          // 両方に応募している人の場合、添乗員からは削除（同じ人が両方に選ばれないようにする）
                                          if (isBothApplicant) {
                                            setSelAttendant((prev) => prev.filter((x) => x !== u.username));
                                          }
                                          // 既に選択されている人がいる場合は、その人を解除してから新しい人を選択
                                          setSelDriver([u.username]);
                                        } else {
                                          // 運転手から削除
                                          setSelDriver([]);
                                        }
                                      }}
                                    />
                                    <span className={textClass}>
                                      #{u.rank} {u.username}
                                      {isBothApplicant && <span className="ml-1 text-blue-600 text-xs">(両方)</span>}
                                      {isConfirmed && <span className="ml-1 text-green-600">✓ 確定済み</span>}
                                      {!isConfirmed && isSelected && <span className="ml-1 text-yellow-600">✓ 選択済み</span>}
                                    </span>
                                  </label>
                                  <span className="text-xs text-gray-500">
                                    {u.times ?? 0}回
                                  </span>
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
                            const isSelectedDriver = selDriver.includes(u.username);
                            const isSelectedAttendant = selAttendant.includes(u.username);
                            const isBothApplicant = bothApplicants.has(u.username);
                            // 添乗員セクションでは、添乗員として選択されているかどうかで判定
                            const isSelected = isSelectedAttendant;
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
                                        if (e.target.checked) {
                                          // 添乗員として選択（1名のみ選択可能）
                                          // 両方に応募している人の場合、運転手からは削除（同じ人が両方に選ばれないようにする）
                                          if (isBothApplicant) {
                                            setSelDriver((prev) => prev.filter((x) => x !== u.username));
                                          }
                                          // 既に選択されている人がいる場合は、その人を解除してから新しい人を選択
                                          setSelAttendant([u.username]);
                                        } else {
                                          // 添乗員から削除
                                          setSelAttendant([]);
                                        }
                                      }}
                                    />
                                    <span className={textClass}>
                                      #{u.rank} {u.username}
                                      {isBothApplicant && <span className="ml-1 text-blue-600 text-xs">(両方)</span>}
                                      {isConfirmed && <span className="ml-1 text-green-600">✓ 確定済み</span>}
                                      {!isConfirmed && isSelected && <span className="ml-1 text-yellow-600">✓ 選択済み</span>}
                                    </span>
                                  </label>
                                  <span className="text-xs text-gray-500">
                                    {u.times ?? 0}回
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })()}

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
                  className="px-3 py-2 rounded bg-blue-600 text-white text-sm"
                  onClick={async () => {
                    try {
                      // バリデーション：運転手と添乗員は各1名のみ
                      if (selDriver.length > 1) {
                        showToast("運転手は1名のみ選択できます", 'warning');
                        return;
                      }
                      if (selAttendant.length > 1) {
                        showToast("添乗員は1名のみ選択できます", 'warning');
                        return;
                      }
                      
                      const r = await apiFetch(`/api?path=decide`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          event_id: fairData.event_id,
                          driver: selDriver,
                          attendant: selAttendant,
                        }),
                      }, handleNetworkError);
                      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                      // 選択済みを確定済みに反映
                      setConfirmedDriver(selDriver);
                      setConfirmedAttendant(selAttendant);
                      showToast("確定を保存しました", 'success');
                      // カレンダーも更新
                      await refresh();
                    } catch (err) {
                      showToast(`保存に失敗しました: ${err.message}`, 'error');
                    }
                  }}
                >
                  確定を保存
                </button>

                <button
                  className="px-3 py-2 rounded bg-gray-200 text-gray-800 text-sm"
                  onClick={async () => {
                    try {
                      const r = await apiFetch(`/api?path=decide&event_id=${encodeURIComponent(fairData.event_id)}`, { method: "DELETE" }, handleNetworkError);
                      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                      setSelDriver([]);
                      setSelAttendant([]);
                      setConfirmedDriver([]);
                      setConfirmedAttendant([]);
                      showToast("確定を解除しました", 'success');
                      // カレンダーも更新
                      await refresh();
                    } catch (err) {
                      showToast(`解除に失敗しました: ${err.message}`, 'error');
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
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center" style={{ zIndex: 100000, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 shadow-lg max-h-[calc(100vh-140px)] overflow-y-auto">
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

        {/* イベント複製モーダル */}
        {duplicateOpen && duplicatingEvent && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center" style={{ zIndex: 100000, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 shadow-lg max-h-[calc(100vh-140px)] overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold">イベントを複製</h3>
                <button onClick={() => setDuplicateOpen(false)} className="text-gray-500">✕</button>
              </div>

              <div className="mb-3 p-2 bg-gray-50 rounded text-sm">
                <div className="font-medium">{duplicatingEvent.label || '(無題イベント)'}</div>
                <div className="text-xs text-gray-600">
                  {duplicatingEvent.date} {duplicatingEvent.start_time || ''}〜{duplicatingEvent.end_time || ''}
                </div>
              </div>

              <form onSubmit={handleDuplicateSubmit} className="space-y-3">
                {/* 開始日付 */}
                <label className="block text-sm">
                  開始日付
                  <input
                    type="date"
                    value={duplicateDate}
                    onChange={(e) => setDuplicateDate(e.target.value)}
                    className="mt-1 w-full border rounded p-2"
                    required
                  />
                </label>

                {/* 複製回数 */}
                <label className="block text-sm">
                  複製回数
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={duplicateCount}
                    onChange={(e) => setDuplicateCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    className="mt-1 w-full border rounded p-2"
                    required
                  />
                </label>

                {/* 間隔 */}
                <label className="block text-sm">
                  間隔
                  <select
                    value={duplicateInterval}
                    onChange={(e) => setDuplicateInterval(e.target.value)}
                    className="mt-1 w-full border rounded p-2"
                  >
                    <option value="day">毎日</option>
                    <option value="week">毎週</option>
                    <option value="month">毎月</option>
                  </select>
                </label>

                <div className="text-xs text-gray-500 p-2 bg-blue-50 rounded">
                  {duplicateCount}件のイベントを、{duplicateDate}から{
                    duplicateInterval === "day" ? "毎日" : 
                    duplicateInterval === "week" ? "毎週" : "毎月"
                  }の間隔で作成します。
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="submit"
                    className="flex-1 px-3 py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700"
                  >
                    複製する
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateOpen(false)}
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
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center" style={{ zIndex: 100000, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 shadow-lg max-h-[calc(100vh-140px)] overflow-y-auto">
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
                    <option value="both">両方</option>
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
        {activeTab === "mypage" && renderMypageTab()}
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
        gridTemplateColumns: 'repeat(5, 1fr)', 
        WebkitGridTemplateColumns: 'repeat(5, 1fr)',
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
          <span style={{ fontSize: '12px', fontWeight: '500' }}></span>
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
          onClick={() => {
            setActiveTab("mypage");
            nav("/admin/dashboard?tab=mypage", { replace: true });
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
            backgroundColor: activeTab === "mypage" ? '#dbeafe' : 'transparent',
            color: activeTab === "mypage" ? '#2563eb' : '#4b5563',
            fontWeight: activeTab === "mypage" ? '600' : '400',
            border: 'none',
            cursor: 'pointer',
            WebkitTransition: 'all 0.2s',
            transition: 'all 0.2s'
          }}
        >
          <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: '500' }}>マイページ</span>
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
    
    {/* トースト通知 */}
    <Toast
      message={toast.message}
      type={toast.type}
      visible={toast.visible}
      onClose={hideToast}
      duration={toast.duration}
    />
    
    {/* 確認ダイアログ */}
    <ConfirmDialog
      visible={dialog.visible}
      title={dialog.title}
      message={dialog.message}
      confirmText={dialog.confirmText}
      cancelText={dialog.cancelText}
      type={dialog.type}
      onConfirm={dialog.onConfirm}
      onCancel={dialog.onCancel}
    />
    </>
  );
}
