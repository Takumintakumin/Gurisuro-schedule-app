// src/components/Calendar.js
import React from "react";

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

const monthNames = [
  "1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"
];

// YYYY-MM-DD
const toKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function Calendar({
  currentMonth,
  currentYear,
  selectedDate,
  onMonthChange,
  onDateSelect,
  events = [],
  availability = {},
  assignedSchedule = {},
  unfilledDates = new Set(),
  eventTagsByDate = {},
  decidedDates = new Set(), // 確定済みの日付のSet (YYYY-MM-DD形式) 一般ユーザー: 自分が確定済みの日付、管理者: すべての確定済み日付
  decidedMembersByDate = {}, // 管理者用: { "YYYY-MM-DD": { driver: string[], attendant: string[] } }
  cancelledDates = new Set(), // キャンセルされた日付のSet (YYYY-MM-DD形式)
  myAppliedEventIds = new Set(), // ユーザー側用: 自分が応募しているイベントIDのSet（管理者側では空のSet）
  compact = false, // モバイルで見やすくするための簡易表示
}) {
  // 追加: 月/週 表示トグル
  const [viewMode, setViewMode] = React.useState("month");

  // 画面幅による自動コンパクト判定（初期）
  const [isCompact, setIsCompact] = React.useState(() => {
    if (typeof window === "undefined") return !!compact;
    try { return compact || window.matchMedia('(max-width: 420px)').matches; } catch { return !!compact; }
  });
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia('(max-width: 420px)');
    const handler = () => setIsCompact(compact || mq.matches);
    try { mq.addEventListener('change', handler); } catch { mq.addListener(handler); }
    handler();
    return () => {
      try { mq.removeEventListener('change', handler); } catch { mq.removeListener(handler); }
    };
  }, [compact]);
  // events を日付キーにまとめる
  const eventsByDate = React.useMemo(() => {
    const map = {};
    const list = Array.isArray(events) ? events : [];
    for (const ev of list) {
      if (!ev?.date) continue;
      (map[ev.date] ||= []).push(ev);
    }
    return map;
  }, [events]);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0:日〜6:土

  const isToday = (date) => {
    const t = new Date();
    return (
      date.getFullYear() === t.getFullYear() &&
      date.getMonth() === t.getMonth() &&
      date.getDate() === t.getDate()
    );
  };

  const renderBadges = (dayEvents, tags) => {
    const maxBadges = isCompact ? 1 : 4;

    // コンパクト時はイベント優先、タグは省略
    const eventBadges = (dayEvents || []).map((ev) =>
      (() => {
        const eventIcon = getEventIcon(ev?.label, ev?.icon);
        return eventIcon
          ? { type: "icon", icon: eventIcon, label: ev?.label || "", start: ev?.start_time }
          : { type: "text", label: ev?.label || "" };
      })()
    );

    const tagBadges = isCompact ? [] : (tags || []).map((t) => ({
      type: "text",
      label: t?.label || t?.key || "",
    }));

    const allBadges = [...eventBadges, ...tagBadges];
    const visible = allBadges.slice(0, maxBadges);
    const overflow = Math.max(allBadges.length - maxBadges, 0);

    return (
      <div className="mt-1.5 flex flex-wrap items-center" style={{ marginTop: isCompact ? '4px' : '6px', display: 'flex', WebkitDisplay: 'flex', flexWrap: 'wrap', WebkitFlexWrap: 'wrap', alignItems: 'center', WebkitAlignItems: 'center' }}>
        {visible.map((b, idx) => {
          if (b.type === "icon" && b.icon) {
            return (
              <img
                key={`b-${idx}`}
                src={b.icon}
                alt={b.label || "event"}
                title={b.label ? `${b.label}${b.start ? ` ${b.start}` : ""}` : ""}
                className={"object-contain rounded-sm shadow-sm " + (isCompact ? "h-5 w-5" : "h-6 w-6")}
                style={{ marginRight: isCompact ? '4px' : '6px', marginBottom: '4px', border: '1px solid rgba(0,0,0,0.1)' }}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            );
          }
          return (
            <span
              key={`b-${idx}`}
              className={"rounded-md bg-white/95 font-medium border border-gray-300 shadow-sm " + (isCompact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]")}
              style={{ marginRight: '4px', marginBottom: '4px' }}
              title={b.label}
            >
              {isCompact ? (b.label.startsWith("フリー運行") ? "フリー" : b.label.slice(0, 4)) : b.label.slice(0, 8)}
            </span>
          );
        })}
        {overflow > 0 && (
          <span
            className={"rounded-md font-medium border border-amber-300 shadow-sm " + (isCompact ? "px-1.5 py-0.5 text-[10px] bg-amber-100/90" : "px-2 py-0.5 text-[11px] bg-amber-100/90")}
            style={{ marginRight: '4px', marginBottom: '4px' }}
            title={`他 ${overflow} 件`}
          >
            +{overflow}
          </span>
        )}
      </div>
    );
  };

  const renderDayCell = (i) => {
    const date = new Date(currentYear, currentMonth, i);
    const key = toKey(date);
    const isSel =
      selectedDate && selectedDate.toDateString() === date.toDateString();

    const userAvail = availability[key];
    const assigned = assignedSchedule?.[key]?.length > 0;
    const unfilled = unfilledDates.has(key);
    const tags = eventTagsByDate?.[key] || [];
    const hasTags = tags.length > 0;
    const dayEvents = eventsByDate[key] || [];
    const isDecided = decidedDates.has(key);
    const isCancelled = cancelledDates.has(key);
    const decidedMembers = decidedMembersByDate?.[key] || null; // 管理者用: 確定済みメンバー情報（日付単位のまとめ）
    const decidedMembersByEventId = decidedMembersByDate?._byEventId || {}; // 管理者用: イベントIDごとの確定済みメンバー情報

    // 1週間前以内かどうかを判定（イベントがある場合のみ）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(date);
    eventDate.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((eventDate - today) / (1000 * 60 * 60 * 24));
    const isWithinOneWeek = daysDiff >= 0 && daysDiff <= 7;
    
    // 管理者用/ユーザー用: 運転手と添乗員が確定済みか、定員不足かチェック
    const isAdmin = Object.keys(decidedMembersByEventId).length > 0; // 管理者かどうかの判定（decidedMembersByEventIdがある場合）
    let allConfirmed = false; // 運転手と添乗員が確定済み
    let insufficientCapacity = false; // 1週間以内で定員不足
    
    if (dayEvents.length > 0) {
      if (isAdmin) {
        // 管理者用: 全てのイベントをチェックして、確定済み/未確定を分類
        let hasConfirmed = false;
        let hasUnconfirmed = false;
        
        for (const ev of dayEvents) {
          const evDecided = decidedMembersByEventId[ev.id] || null;
          // 確定済みかどうかを確認（evDecidedが存在し、driverまたはattendantが存在する）
          const isEventDecided = evDecided && (evDecided.driver?.length > 0 || evDecided.attendant?.length > 0);
          
          if (isEventDecided) {
            hasConfirmed = true;
          } else {
            hasUnconfirmed = true;
          }
        }
        
        // 確定済みのイベントがある場合は緑色にする（確定済みが優先）
        if (hasConfirmed) {
          allConfirmed = true;
          insufficientCapacity = false; // 確定済みがある場合は赤色にしない
        } else if (hasUnconfirmed && isWithinOneWeek) {
          // 未確定のイベントがあり、1週間以内の場合のみ赤色
          insufficientCapacity = true;
        }
      } else {
        // ユーザー用: 自分の応募があるイベントで、定員が埋まっているか、1週間以内で定員が埋まっていないかをチェック
        let hasInsufficientCapacity = false;
        let hasAllCapacityFilled = false; // 自分の応募があるイベントで定員が埋まっている
        
        for (const ev of dayEvents) {
          // 自分の応募があるイベントのみチェック
          const isMyEvent = myAppliedEventIds && myAppliedEventIds.size > 0 && myAppliedEventIds.has(ev.id);
          if (!isMyEvent) continue;
          
          const evDecided = decidedMembersByEventId[ev.id] || null;
          const capacityDriver = ev.capacity_driver ?? 1;
          const capacityAttendant = ev.capacity_attendant ?? 1;
          const confirmedDriverCount = evDecided?.driver?.length || 0;
          const confirmedAttendantCount = evDecided?.attendant?.length || 0;
          
          // 定員が埋まっているかチェック（運転手と添乗員が揃っている）
          const isCapacityFilled = confirmedDriverCount >= capacityDriver && confirmedAttendantCount >= capacityAttendant;
          
          if (isCapacityFilled) {
            // 定員が埋まっている場合は緑色にする
            hasAllCapacityFilled = true;
          } else if (isWithinOneWeek) {
            // 1週間以内で定員が埋まっていない場合は赤色にする
            hasInsufficientCapacity = true;
          }
        }
        
        // 定員が埋まっている場合は緑色を優先
        if (hasAllCapacityFilled) {
          allConfirmed = true;
          insufficientCapacity = false; // 定員が埋まっている場合は赤色にしない
        } else if (hasInsufficientCapacity) {
          insufficientCapacity = true;
        }
      }
    }
    
    // ユーザー側でも管理者側でも、確定済み（isDecided）の場合は緑色（自分の応募が確定済み）
    if (isDecided) {
      allConfirmed = true;
      insufficientCapacity = false; // 確定済みがある場合は赤色にしない
    }

    // 背景色の優先度：
    // 1. キャンセル（定員が埋まっていない場合のみ）
    // 2. 1週間以内で定員不足（赤）
    // 3. 確定済みまたは定員が埋まった（緑）
    // 4. イベントあり（オレンジ）
    // 注意: キャンセルがあっても定員が埋まった（allConfirmed）場合は緑色を優先
    let base =
      "relative border cursor-pointer select-none transition-all duration-200 min-h-[80px] sm:min-h-[88px] p-2.5 rounded-lg shadow-sm";
    if (allConfirmed || isDecided) {
      // 確定済みまたは定員が埋まった場合は鮮やかなグリーン
      base += " bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white shadow-md";
    } else if (isCancelled) {
      // キャンセルがあり、定員が埋まっていない場合
      base += " bg-rose-200 hover:bg-rose-300 border-rose-400 shadow-md";
    } else if (insufficientCapacity) {
      // 1週間以内で定員が埋まっていない場合
      base += " bg-rose-100 hover:bg-rose-200 border-rose-300";
    } else if (dayEvents.length > 0 || hasTags) {
      // イベントがある場合
      base += " bg-amber-50 hover:bg-amber-100 border-amber-200 shadow-sm";
    } else if (unfilled) base += " bg-red-50 hover:bg-red-100 border-red-200";
    else if (assigned) base += " bg-blue-50 hover:bg-blue-100 border-blue-200";
    else if (userAvail) base += " bg-green-50 hover:bg-green-100 border-green-200";
    else base += " bg-white hover:bg-green-50/50 border-gray-200";

    // 選択中はリング・今日アウトライン（より目立つように）
    if (isSel) base += " ring-3 ring-emerald-400 ring-offset-2 shadow-lg transform scale-105";

    // 土日色（確定済みの場合は白色テキスト）
    const wd = date.getDay();
    const isConfirmedDay = allConfirmed || isDecided;
    const dayColor = isConfirmedDay 
      ? "text-white" 
      : (wd === 0 ? "text-red-600" : wd === 6 ? "text-blue-600" : "text-gray-800");
    
    // 今日の日付には特別なバッジ
    const isTodayDate = isToday(date);

    return (
      <div
        key={`day-${i}`}
        role="button"
        tabIndex={0}
        aria-label={`${currentYear}年${currentMonth + 1}月${i}日`}
        aria-pressed={isSel ? "true" : "false"}
        className={base}
        style={{
          WebkitTransition: 'all 0.2s ease',
          transition: 'all 0.2s ease',
          WebkitTransform: 'translateZ(0)',
          transform: 'translateZ(0)'
        }}
        onTouchStart={(e) => {
          e.currentTarget.style.WebkitTransform = 'scale(0.97)';
          e.currentTarget.style.transform = 'scale(0.97)';
        }}
        onTouchEnd={(e) => {
          e.currentTarget.style.WebkitTransform = 'scale(1)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onClick={() => onDateSelect?.(date)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onDateSelect?.(date);
        }}
      >
        {/* 上段：日付 */}
        <div className="flex items-start justify-between mb-1">
          <span className={`text-[17px] sm:text-[18px] font-extrabold ${dayColor}`}>
            {i}
          </span>
          {/* 右上に小さなイベントマーク（コンパクト時のみ） */}
          {isCompact && (dayEvents.length > 0 || hasTags) && (
            <span
              aria-label="イベントあり"
              title="イベントあり"
              className="inline-block rounded-full bg-amber-500"
              style={{ width: '6px', height: '6px', marginTop: '2px' }}
            />
          )}
        </div>

        {/* コンパクト時: アイコンのみを1つ表示（なければマークのみ）。通常時: バッジ表示 */}
        {isCompact ? (
          (() => {
            const iconEvents = (dayEvents || [])
              .map(ev => {
                const eventIcon = getEventIcon(ev?.label, ev?.icon);
                return eventIcon ? { ...ev, icon: eventIcon } : null;
              })
              .filter(ev => ev !== null);
            if (iconEvents.length > 0) {
              const first = iconEvents[0];
              const overflow = Math.max(iconEvents.length - 1, 0);
              return (
                <div className="mt-1.5 flex items-center" style={{ gap: '4px' }}>
                  <img
                    src={first.icon}
                    alt={first.label || "event"}
                    title={first.label || ""}
                    className="h-5 w-5 object-contain rounded-sm shadow-sm"
                    style={{ border: '1px solid rgba(0,0,0,0.1)' }}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  {overflow > 0 && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100/90 border border-amber-300">
                      +{overflow}
                    </span>
                  )}
                </div>
              );
            }
            // アイコンがない場合はマークのみ
            return null;
          })()
        ) : (
          (dayEvents.length > 0 || hasTags) && renderBadges(dayEvents, tags)
        )}
      </div>
    );
  };

  // 空白 + 当月日セル
  const cells = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    cells.push(
      <div
        key={`empty-${i}`}
        className="border border-gray-100 bg-green-50/30 min-h-[72px] sm:min-h-[80px] rounded-lg"
        aria-hidden="true"
      />
    );
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(renderDayCell(i));
  }

  // カレンダーグリッド作成
  const totalDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    totalDays.push(null); // 空白セル
  }
  for (let i = 1; i <= daysInMonth; i++) {
    totalDays.push(i);
  }
  // weekMode時、選択中日が含まれる週だけ抜き出す
  let visibleCells = [];
  if (viewMode === "week" && selectedDate) {
    const idx = firstDayOfMonth + selectedDate.getDate() - 1;
    const startIdx = Math.floor(idx / 7) * 7;
    visibleCells = totalDays.slice(startIdx, startIdx+7);
    while (visibleCells.length < 7) visibleCells.push(null);
  } else {
    visibleCells = totalDays;
  }

  return (
    <div className="mb-0 w-full bg-white" style={{ boxShadow: 'none', border: 'none', borderRadius: 0, maxWidth: '100%', margin: 0 }}>
      {/* ヘッダー（デカめ・押しやすい） */}
      <div className="flex items-center justify-between px-0 py-2 border-b border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 sticky top-0 z-10" style={{margin:0}}>
        <button
          className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100"
          style={{
            WebkitTransition: 'all 0.15s ease',
            transition: 'all 0.15s ease',
            WebkitTransform: 'translateZ(0)',
            transform: 'translateZ(0)'
          }}
          onClick={() => onMonthChange?.(-1)}
          onTouchStart={(e) => {
            e.currentTarget.style.WebkitTransform = 'scale(0.98) translateZ(0)';
            e.currentTarget.style.transform = 'scale(0.98) translateZ(0)';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.WebkitTransform = 'scale(1) translateZ(0)';
            e.currentTarget.style.transform = 'scale(1) translateZ(0)';
          }}
          aria-label="前の月へ"
        >
          <svg className="w-6 h-6 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
          </svg>
        </button>

        <h2 className="text-lg sm:text-xl font-extrabold tracking-wide text-gray-800">
          {currentYear}年 {monthNames[currentMonth]}
        </h2>

        <button
          className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100"
          style={{
            WebkitTransition: 'all 0.15s ease',
            transition: 'all 0.15s ease',
            WebkitTransform: 'translateZ(0)',
            transform: 'translateZ(0)'
          }}
          onClick={() => onMonthChange?.(1)}
          onTouchStart={(e) => {
            e.currentTarget.style.WebkitTransform = 'scale(0.98) translateZ(0)';
            e.currentTarget.style.transform = 'scale(0.98) translateZ(0)';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.WebkitTransform = 'scale(1) translateZ(0)';
            e.currentTarget.style.transform = 'scale(1) translateZ(0)';
          }}
          aria-label="次の月へ"
        >
          <svg className="w-6 h-6 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>
        {/* 右端に表示切替 */}
        <div className="ml-3 flex gap-2">
          <button onClick={()=>setViewMode("month")} style={{fontWeight: viewMode==="month"?'bold':'normal',background:viewMode==="month"?'#e0ffe9':'transparent'}} className="px-2 py-1 rounded">月</button>
          <button onClick={()=>setViewMode("week")}  style={{fontWeight: viewMode==="week"?'bold':'normal',background:viewMode==="week"?'#e0ffe9':'transparent'}} className="px-2 py-1 rounded">週</button>
        </div>
      </div>

      {/* 曜日行（固定＆大きめ） */}
      <div className="grid grid-cols-7 text-center text-[12px] sm:text-sm font-bold text-gray-700 border-b border-green-200 bg-gradient-to-r from-green-50/80 to-emerald-50/80 sticky top-[44px] sm:top-[52px] z-10" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', margin:0, padding:0 }}>
        {["日","月","火","水","木","金","土"].map((d, idx) => (
          <div key={d} className={"py-2 "+(idx===0?"text-red-600":idx===6?"text-blue-600":"")} style={{margin:0}}>{d}</div>
        ))}
      </div>

      {/* カレンダー本体（タップ幅UP・余白広め） */}
      <div className="grid grid-cols-7 bg-white" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: '3px',
        padding: 0,
        margin: 0
      }}>{visibleCells.map((cell, i) =>
          cell===null ? <div key={`empty-${i}`}></div> : renderDayCell(cell)
        )}</div>
    </div>
  );
}