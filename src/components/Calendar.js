// src/components/Calendar.js
import React from "react";

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
}) {
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
    const maxBadges = 4;

    const eventBadges = (dayEvents || []).map((ev) =>
      ev && ev.icon
        ? { type: "icon", icon: ev.icon, label: ev.label, start: ev.start_time }
        : { type: "text", label: ev?.label || "" }
    );

    const tagBadges = (tags || []).map((t) => ({
      type: "text",
      label: t?.label || t?.key || "",
    }));

    const allBadges = [...eventBadges, ...tagBadges];
    const visible = allBadges.slice(0, maxBadges);
    const overflow = Math.max(allBadges.length - maxBadges, 0);

    return (
      <div className="mt-1.5 flex flex-wrap items-center" style={{ marginTop: '6px', display: 'flex', WebkitDisplay: 'flex', flexWrap: 'wrap', WebkitFlexWrap: 'wrap', alignItems: 'center', WebkitAlignItems: 'center' }}>
        {visible.map((b, idx) => {
          if (b.type === "icon" && b.icon) {
            return (
              <img
                key={`b-${idx}`}
                src={b.icon}
                alt={b.label || "event"}
                title={b.label ? `${b.label}${b.start ? ` ${b.start}` : ""}` : ""}
                className="h-5 w-5 object-contain"
                style={{ marginRight: '4px', marginBottom: '4px' }}
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
              className="px-1.5 rounded bg-white/90 text-[10px] border border-gray-300 leading-5"
              style={{ marginRight: '4px', marginBottom: '4px' }}
              title={b.label}
            >
              {b.label.slice(解题, 6)}
            </span>
          );
        })}
        {overflow > 0 && (
          <span
            className="px-1.5 rounded bg-white/90 text-[10px] border border-gray-300 leading-5"
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
    const decidedMembers = decidedMembersByDate?.[key] || null; // 管理者用: 確定済みメンバー情報

    // 背景色（優先度：確定済み（自分）>イベント>運休>割当>可用）
    let base =
      "relative border border-gray-200 cursor-pointer select-none transition-colors duration-150 min-h-[64px] sm:min-h-[74px] p-2";
    if (isDecided)
      base += " bg-green-100 hover:bg-green-200 border-green-300";
    else if (dayEvents.length > 0 || hasTags)
      base += " bg-orange-50 hover:bg-orange-100";
    else if (unfilled) base += " bg-red-50 hover:bg-red-100";
    else if (assigned) base += " bg-blue-50 hover:bg-blue-100";
    else if (userAvail) base += " bg-green-50 hover:bg-green-100";
    else base += " hover:bg-gray-50";

    // 選択中はリング・今日アウトライン
    if (isSel) base += " ring-2 ring-blue-500 ring-offset-1";
    if (isToday(date)) base += " outline outline-1 outline-blue-400";

    // 土日色
    const wd = date.getDay();
    const dayColor =
      wd === 0 ? "text-red-600" : wd === 6 ? "text-blue-600" : "text-gray-800";

    return (
      <div
        key={`day-${i}`}
        role="button"
        tabIndex={0}
        aria-label={`${currentYear}年${currentMonth + 1}月${i}日`}
        aria-pressed={isSel ? "true" : "false"}
        className={base + " rounded-md"}
        style={{
          WebkitTransition: 'all 0.15s ease',
          transition: 'all 0.15s ease',
          WebkitTransform: 'translateZ(0)',
          transform: 'translateZ(0)'
        }}
        onTouchStart={(e) => {
          e.currentTarget.style.WebkitTransform = 'scale(0.99)';
          e.currentTarget.style.transform = 'scale(0.99)';
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
        <div className="flex items-start justify-between">
          <span className={`text-[14px] sm:text-[15px] font-bold ${dayColor}`}>
            {i}
          </span>
        </div>

        {/* バッジ（イベントアイコン/タグ） */}
        {(dayEvents.length > 0 || hasTags) && renderBadges(dayEvents, tags)}
        
        {/* 管理者用: 確定済みメンバー表示 */}
        {decidedMembers && (decidedMembers.driver?.length > 0 || decidedMembers.attendant?.length > 0) && (
          <div className="mt-1 px-1 py-0.5 bg-green-100 rounded text-[10px] text-green-800 font-semibold border border-green-300">
            {decidedMembers.driver?.length > 0 && (
              <div className="truncate" title={`運転手: ${decidedMembers.driver.join(", ")}`}>🚗 {decidedMembers.driver.join(", ")}</div>
            )}
            {decidedMembers.attendant?.length > 0 && (
              <div className="truncate" title={`添乗員: ${decidedMembers.attendant.join(", ")}`}>👤 {decidedMembers.attendant.join(", ")}</div>
            )}
          </div>
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
        className="border border-gray-200 bg-white/50 min-h-[64px] sm:min-h-[74px]"
        aria-hidden="true"
      />
    );
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(renderDayCell(i));
  }

  return (
    <div className="mb-3 sm:mb-4 rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* ヘッダー（デカめ・押しやすい） */}
      <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 border-b bg-white sticky top-0 z-10">
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

        <h2 className="text-lg sm:text-xl font-extrabold tracking-wide">
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
      </div>

      {/* 曜日行（固定＆大きめ） */}
      <div className="grid grid-cols-7 text-center text-[12px] sm:text-sm font-semibold text-gray-600 border-b bg-gray-50 sticky top-[44px] sm:top-[52px] z-10">
        {["日","月","火","水","木","金","土"].map((d, idx) => (
          <div
            key={d}
            className={
              "py-2 " +
              (idx === 0 ? "text-red-600" : idx === 6 ? "text-blue-600" : "")
            }
          >
            {d}
          </div>
        ))}
      </div>

      {/* カレンダー本体（タップ幅UP・余白広め） */}
      <div className="grid grid-cols-7 p-1 sm:p-2" style={{ 
        display: 'grid', 
        WebkitDisplay: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        WebkitGridTemplateColumns: 'repeat(7, 1fr)',
        gap: '4px',
        WebkitColumnGap: '4px',
        WebkitRowGap: '4px',
        padding: '4px'
      }}>{cells}</div>
    </div>
  );
}