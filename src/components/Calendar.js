// src/components/Calendar.js
import React from "react";

const monthNames = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const toKey = (d) => d.toISOString().split("T")[0];

export default function Calendar({
  currentMonth,
  currentYear,
  selectedDate,
  onMonthChange,
  onDateSelect,
  // ユーザー側では availability / assigned などをマークに使っている想定
  // 管理者側では events を渡す（[{date,label,icon,start_time,end_time}...]）
  events = [],
  availability = {},
  assignedSchedule = {},
  unfilledDates = new Set(),
  eventTagsByDate = {},
}) {
  // events を日付キーごとの配列に正規化
  const eventsByDate = React.useMemo(() => {
    const map = {};
    const list = Array.isArray(events) ? events : [];
    for (const ev of list) {
      if (!ev?.date) continue;
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [events]);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const isToday = (date) => {
    const t = new Date();
    return (
      date.getFullYear() === t.getFullYear() &&
      date.getMonth() === t.getMonth() &&
      date.getDate() === t.getDate()
    );
  };

  const renderDayCell = (i) => {
    const date = new Date(currentYear, currentMonth, i);
    const key = toKey(date);
    const isSel = selectedDate && selectedDate.toDateString() === date.toDateString();

    const userAvail = availability[key];
    const assigned = assignedSchedule?.[key]?.length > 0;
    const unfilled = unfilledDates.has(key);
    const tags = eventTagsByDate?.[key] || [];
    const hasTags = tags.length > 0;
    const dayEvents = eventsByDate[key] || [];

    let base =
      "relative p-1 xs:p-1.5 sm:p-2 border border-gray-200 cursor-pointer transition-colors duration-150 text-gray-800 min-h-[48px] sm:min-h-[64px] overflow-hidden";
    // 色優先度: 管理者登録イベント > 運休 > 割当 > 自分の可用
    if (dayEvents.length > 0 || hasTags) base += " bg-orange-100 hover:bg-orange-200";
    else if (unfilled) base += " bg-red-100 hover:bg-red-200";
    else if (assigned) base += " bg-blue-100 hover:bg-blue-200";
    else if (userAvail) base += " bg-green-100 hover:bg-green-200";
    else base += " hover:bg-gray-50";

    if (isSel) base += " ring-2 ring-blue-500 ring-offset-1";
    if (isToday(date)) base += " outline outline-1 outline-blue-400";

    return (
      <div key={`day-${i}`} className={base} onClick={() => onDateSelect?.(date)}>
        {/* 日付ラベル */}
        <div className="flex items-start justify-between">
          <span className="text-[12px] sm:text-sm font-semibold">{i}</span>
          {isToday(date) && (
            <span className="text-[10px] sm:text-xs text-blue-600 font-medium">今日</span>
          )}
        </div>

        {/* 管理者のイベントアイコン or タグ（最大4つ） */}
        {(dayEvents.length > 0 || hasTags) && (() => {
          const maxBadges = 4;
          const eventBadges = (dayEvents || []).map((ev) =>
            ev && ev.icon ? { type: "icon", icon: ev.icon, label: ev.label, start: ev.start_time } 
                           : { type: "text", label: ev?.label || "" }
          );
          const tagBadges = (tags || []).map((t) =>
            ({ type: "text", label: t?.label || t?.key || "" })
          );
          const allBadges = [...eventBadges, ...tagBadges];
          const visible = allBadges.slice(0, maxBadges);
          const overflow = Math.max(allBadges.length - maxBadges, 0);

          return (
            <div className="mt-1 flex flex-wrap gap-1 items-center">
              {visible.map((b, idx) => {
                if (b.type === "icon" && b.icon) {
                  return (
                    <img
                      key={`b-${idx}`}
                      src={b.icon}
                      alt={b.label || "event"}
                      title={b.label ? `${b.label}${b.start ? ` ${b.start}` : ""}` : ""}
                      className="h-5 w-5 object-contain"
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  );
                }
                // text fallback
                return (
                  <span
                    key={`b-${idx}`}
                    className="px-1 rounded bg-white/80 text-[10px] border border-gray-300"
                    title={b.label}
                  >
                    {b.label.slice(0, 4)}
                  </span>
                );
              })}
              {overflow > 0 && (
                <span
                  className="px-1 rounded bg-white/80 text-[10px] border border-gray-300"
                  title={`他 ${overflow} 件`}
                >
                  +{overflow}
                </span>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  const cells = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    cells.push(<div key={`empty-${i}`} className="border border-gray-200 min-h-[48px] sm:min-h-[64px]" />);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(renderDayCell(i));
  }

  return (
    <div className="mb-3 sm:mb-4 rounded-lg border border-gray-200 overflow-hidden bg-white">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-2 sm:p-3 border-b bg-white sticky top-0 z-10">
        <button
          className="p-2 rounded hover:bg-gray-100 active:scale-[0.98]"
          onClick={() => onMonthChange?.(-1)}
          aria-label="前の月へ"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <h2 className="text-base sm:text-lg font-semibold">
          {currentYear}年 {monthNames[currentMonth]}
        </h2>
        <button
          className="p-2 rounded hover:bg-gray-100 active:scale-[0.98]"
          onClick={() => onMonthChange?.(1)}
          aria-label="次の月へ"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
      </div>

      {/* 曜日行 */}
      <div className="grid grid-cols-7 text-center text-[11px] sm:text-xs font-medium text-gray-500 border-b bg-gray-50">
        {["日","月","火","水","木","金","土"].map((d) => (
          <div key={d} className="py-1.5 sm:py-2">{d}</div>
        ))}
      </div>

      {/* 本体 */}
      <div className="grid grid-cols-7">{cells}</div>
    </div>
  );
}