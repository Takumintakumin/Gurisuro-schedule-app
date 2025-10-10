// src/components/Calendar.js
import React from "react";

/**
 * ■ 変更点（UIのみ）
 * - 指タップしやすい最小高さ/余白（min-hを拡大、行間/ボタンを大きく）
 * - 高コントラスト配色（背景と文字のコントラストを強化）
 * - 月移動ボタンを大きく、タップ領域も拡大（40px以上）
 * - 今日/選択日の視認性UP（太枠＋濃色リング）
 * - アイコン/バッジ表示は従来通り（最大4件）だが、文字は大きめ・読みやすい太さ
 * - アクセシビリティ対応：aria-labelやrole、キーボード操作（Enter/Space）対応
 * - 週行ヘッダ固定（スクロールしても曜日が見える）
 *
 * ※ 受け取るpropsの形は一切変更していません
 */

const monthNames = [
  "1月","2月","3月","4月","5月","6月",
  "7月","8月","9月","10月","11月","12月"
];

// タイムゾーンのズレ防止：常にローカルの年月日でキー生成
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
}) {
  // events を日付キーごとの配列に正規化（安全に）
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

  // キー操作（← → PgUp PgDn Enter/Space）
  const gridRef = React.useRef(null);
  const handleKeyDown = (e) => {
    if (!selectedDate) return;
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","PageUp","PageDown","Home","End"].includes(e.key)) {
      e.preventDefault();
    }
    const d = new Date(selectedDate);
    switch (e.key) {
      case "ArrowLeft": d.setDate(d.getDate() - 1); onDateSelect?.(d); break;
      case "ArrowRight": d.setDate(d.getDate() + 1); onDateSelect?.(d); break;
      case "ArrowUp": d.setDate(d.getDate() - 7); onDateSelect?.(d); break;
      case "ArrowDown": d.setDate(d.getDate() + 7); onDateSelect?.(d); break;
      case "PageUp": onMonthChange?.(-1); break;
      case "PageDown": onMonthChange?.(1); break;
      case "Home": d.setDate(1); onDateSelect?.(d); break;
      case "End": d.setDate(new Date(currentYear, currentMonth + 1, 0).getDate()); onDateSelect?.(d); break;
      default: break;
    }
  };

  const renderBadges = (dayEvents, tags) => {
    if ((!dayEvents || dayEvents.length === 0) && (!tags || tags.length === 0)) return null;

    const maxBadges = 4;
    const eventBadges = (dayEvents || []).map((ev) =>
      ev && ev.icon
        ? { type: "icon", icon: ev.icon, label: ev.label, start: ev.start_time }
        : { type: "text", label: ev?.label || "" }
    );
    const tagBadges = (tags || []).map((t) => ({ type: "text", label: t?.label || t?.key || "" }));
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
                className="h-6 w-6 object-contain" /* ← 少し大きく */
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            );
          }
          return (
            <span
              key={`b-${idx}`}
              className="px-1.5 rounded bg-white text-[12px] border border-gray-300 font-medium"
              title={b.label}
            >
              {b.label.slice(0, 5)}
            </span>
          );
        })}
        {overflow > 0 && (
          <span
            className="px-1.5 rounded bg-white text-[12px] border border-gray-300 font-medium"
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
    const isSel = selectedDate && selectedDate.toDateString() === date.toDateString();

    const userAvail = availability[key];
    const assigned = assignedSchedule?.[key]?.length > 0;
    const unfilled = unfilledDates.has(key);
    const tags = eventTagsByDate?.[key] || [];
    const dayEvents = eventsByDate[key] || [];

    // ベースは大きめ・高コントラスト・余白広め
    let base =
      "relative p-2 sm:p-3 border border-gray-300 cursor-pointer transition-colors duration-150 " +
      "text-gray-900 min-h-[64px] sm:min-h-[80px] overflow-hidden rounded-md " +
      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/60";

    // 優先度: 登録イベント > 運休(unfilled) > 割当 > 可用
    if (dayEvents.length > 0 || (tags && tags.length > 0)) base += " bg-amber-100 hover:bg-amber-200";
    else if (unfilled) base += " bg-red-100 hover:bg-red-200";
    else if (assigned) base += " bg-blue-100 hover:bg-blue-200";
    else if (userAvail) base += " bg-emerald-100 hover:bg-emerald-200";
    else base += " hover:bg-gray-50 bg-white";

    // 選択中は太いリング＋強調
    if (isSel) base += " ring-4 ring-blue-500/70";
    // 今日には濃いめの枠
    if (isToday(date)) base += " outline outline-2 outline-blue-600";

    const ariaLabel = `${currentYear}年${currentMonth + 1}月${i}日。` +
      (dayEvents.length ? `イベント${dayEvents.length}件。` : "") +
      (userAvail ? "自分の可用あり。" : "") +
      (assigned ? "割り当てあり。" : "") +
      (unfilled ? "未充足あり。" : "");

    const onClick = () => onDateSelect?.(date);
    const onKeyUp = (e) => {
      if (e.key === "Enter" || e.key === " ") onDateSelect?.(date);
    };

    return (
      <div
        key={`day-${i}`}
        className={base}
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        onClick={onClick}
        onKeyUp={onKeyUp}
      >
        {/* 日付ラベル（大きめ・太字） */}
        <div className="flex items-start justify-between mb-1">
          <span className="text-base sm:text-lg font-extrabold leading-none">{i}</span>
          {isToday(date) && (
            <span className="text-[12px] sm:text-sm text-blue-700 font-bold">今日</span>
          )}
        </div>

        {/* バッジ（アイコン/テキスト） */}
        {renderBadges(dayEvents, tags)}
      </div>
    );
  };

  const cells = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    cells.push(
      <div
        key={`empty-${i}`}
        className="border border-gray-200 bg-gray-50 min-h-[64px] sm:min-h-[80px] rounded-md"
        aria-hidden="true"
      />
    );
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(renderDayCell(i));
  }

  const gotoToday = () => {
    const t = new Date();
    // 月だけ変更、選択日は親側で保持しているので onDateSelect も呼ぶ
    onMonthChange?.( (t.getFullYear() - currentYear) * 12 + (t.getMonth() - currentMonth) );
    onDateSelect?.(t);
  };

  return (
    <div className="mb-4 sm:mb-6 rounded-xl border border-gray-300 overflow-hidden bg-white">
      {/* ヘッダー（大きめボタン＋現在月） */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3 border-b bg-white sticky top-0 z-10">
        <button
          className="px-3 py-2 sm:px-4 sm:py-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:scale-[0.98] text-lg font-bold"
          onClick={() => onMonthChange?.(-1)}
          aria-label="前の月へ"
        >
          ←
        </button>

        <div className="flex flex-col items-center">
          <h2 className="text-lg sm:text-2xl font-extrabold tracking-wide">
            {currentYear}年 {monthNames[currentMonth]}
          </h2>
          <button
            onClick={gotoToday}
            className="mt-1 text-sm sm:text-base text-blue-700 underline"
            aria-label="今日へ移動"
          >
            今日へ
          </button>
        </div>

        <button
          className="px-3 py-2 sm:px-4 sm:py-3 rounded-lg bg-gray-100 hover:bg-gray-200 active:scale-[0.98] text-lg font-bold"
          onClick={() => onMonthChange?.(1)}
          aria-label="次の月へ"
        >
          →
        </button>
      </div>

      {/* 曜日行（固定/太字/見やすい） */}
      <div className="grid grid-cols-7 text-center text-[13px] sm:text-base font-bold text-gray-800 border-b bg-gray-100 sticky top-[54px] sm:top-[64px] z-10">
        {["日","月","火","水","木","金","土"].map((d) => (
          <div key={d} className="py-2 sm:py-2.5">{d}</div>
        ))}
      </div>

      {/* カレンダー本体（キーボード操作も可） */}
      <div
        ref={gridRef}
        className="grid grid-cols-7 gap-1 p-2 sm:p-3"
        onKeyDown={handleKeyDown}
        role="grid"
        aria-label={`${currentYear}年${currentMonth + 1}月のカレンダー`}
      >
        {cells}
      </div>

      {/* 凡例（高コントラスト・文字大きめ） */}
      <div className="border-t bg-white p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 sm:gap-4 text-[12px] sm:text-sm">
          <Legend colorClass="bg-amber-200" label="募集あり" />
          <Legend colorClass="bg-red-200" label="未充足" />
          <Legend colorClass="bg-blue-200" label="割り当てあり" />
          <Legend colorClass="bg-emerald-200" label="自分の可用" />
          <Legend borderClass="outline outline-2 outline-blue-600" label="今日" boxOnly />
          <Legend ringClass="ring-4 ring-blue-500/70" label="選択中" boxOnly />
        </div>
      </div>
    </div>
  );
}

function Legend({ colorClass, ringClass, borderClass, label, boxOnly = false }) {
  const boxCls =
    "inline-block w-4 h-4 rounded-sm border border-gray-400 " +
    (colorClass || "") + " " + (ringClass || "") + " " + (borderClass || "");
  return (
    <span className="inline-flex items-center gap-2">
      <span className={boxCls} aria-hidden="true" />
      {!boxOnly && <span className="text-gray-800">{label}</span>}
      {boxOnly && <span className="text-gray-800">{label}</span>}
    </span>
  );
}