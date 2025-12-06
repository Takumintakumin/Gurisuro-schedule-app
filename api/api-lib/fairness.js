// /api-lib/fairness.js
import { query } from "./_db.js";

export default async function handler(req, res) {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

    // パラメータ
    const url = new URL(req.url, `http://${req.headers.host}`);
    const eventId = url.searchParams.get("event_id");
    if (!eventId) return res.status(400).json({ error: "event_id が必要です" });

    // W=60: 直近60日間の履歴を使用
    const W_DAYS = 60;

    // 1. イベントの日付を取得
    const eventResult = await query(
      `SELECT COALESCE(event_date, NULLIF(date, '')::date) AS event_date, date AS date_text
       FROM events WHERE id = $1`,
      [eventId]
    );
    if (!eventResult.rows || eventResult.rows.length === 0) {
      return res.status(404).json({ error: "イベントが見つかりません" });
    }
    const eventDate = eventResult.rows[0].event_date || eventResult.rows[0].date_text;
    if (!eventDate) {
      return res.status(400).json({ error: "イベントの日付が取得できません" });
    }

    // 日付をDateオブジェクトに変換（UTC基準で扱う）
    // eventDateが既にDateオブジェクトの場合はそのまま使用、文字列の場合は変換
    let eventDateStr = eventDate;
    if (eventDate instanceof Date) {
      eventDateStr = eventDate.toISOString().split('T')[0];
    } else if (typeof eventDate === 'string') {
      // 既にYYYY-MM-DD形式の場合はそのまま使用
      eventDateStr = eventDate.split('T')[0];
    } else {
      return res.status(400).json({ error: "イベントの日付の形式が不正です" });
    }
    
    const eventDateObj = new Date(eventDateStr + "T00:00:00Z");
    if (isNaN(eventDateObj.getTime())) {
      return res.status(400).json({ error: `イベントの日付が無効です: ${eventDateStr}` });
    }
    
    const windowStartDate = new Date(eventDateObj);
    windowStartDate.setUTCDate(windowStartDate.getUTCDate() - W_DAYS);
    
    if (isNaN(windowStartDate.getTime())) {
      return res.status(400).json({ error: "ウィンドウ開始日の計算に失敗しました" });
    }

    // 2. 応募者リストを取得
    const applicantsResult = await query(
      `SELECT a.id, a.username, a.kind, a.created_at
       FROM applications a
       WHERE a.event_id = $1
       ORDER BY a.kind, a.created_at ASC`,
      [eventId]
    );

    // 応募者がいない場合は早期リターン
    if (!applicantsResult.rows || applicantsResult.rows.length === 0) {
      return res.status(200).json({ event_id: Number(eventId), driver: [], attendant: [] });
    }

    // 3. 各応募者の直近60日間の確定履歴を取得（イベント日付より前のみ）
    // decided_atがNULLの場合はevent_dateを使用（後方互換性のため）
    // まず、decided_atがNULLの既存データを更新（一度だけ実行される想定）
    try {
      await query(
        `UPDATE selections s
         SET decided_at = COALESCE(s.decided_at, 
             (SELECT COALESCE(e.event_date, NULLIF(e.date, '')::date)::timestamp 
              FROM events e WHERE e.id = s.event_id))
         WHERE s.decided_at IS NULL`
      );
    } catch (e) {
      // 更新エラーは無視（既に更新済みの可能性がある）
      console.log('[fairness] decided_at update skipped:', e.message);
    }
    
    // デバッグ用：応募者リストをログ出力
    const applicantUsernames = applicantsResult.rows.map(r => r.username);
    console.log(`[fairness] ===== START =====`);
    console.log(`[fairness] event_id: ${eventId}`);
    console.log(`[fairness] eventDate: ${eventDateStr}`);
    console.log(`[fairness] windowStart: ${windowStartDate.toISOString().split('T')[0]}`);
    console.log(`[fairness] applicants:`, applicantUsernames);
    console.log(`[fairness] applicant count: ${applicantUsernames.length}`);
    
    // まず、全応募者のselectionsデータを確認（デバッグ用）
    // 重要：effective_dateは「イベントの日付（event_date）」を使用
    const allSelectionsCheck = await query(
      `SELECT s.username, s.kind, s.decided_at, e.event_date, e.date AS date_text,
              COALESCE(e.event_date, NULLIF(e.date, '')::date) AS effective_date,
              COALESCE(e.event_date, NULLIF(e.date, '')::date) < $2::date AS is_before_event,
              COALESCE(e.event_date, NULLIF(e.date, '')::date) >= $3::date AS is_within_60days
       FROM selections s
       JOIN events e ON e.id = s.event_id
       WHERE s.username = ANY($1::text[])
       ORDER BY s.username, COALESCE(e.event_date, NULLIF(e.date, '')::date) DESC`,
      [applicantUsernames, eventDateStr, windowStartDate.toISOString().split('T')[0]]
    );
    console.log(`[fairness] all selections for applicants (before date filter):`, allSelectionsCheck.rows.length);
    if (allSelectionsCheck.rows.length > 0) {
      console.log(`[fairness] sample selection:`, JSON.stringify(allSelectionsCheck.rows[0], null, 2));
      console.log(`[fairness] all selections with date check:`, allSelectionsCheck.rows.map(r => ({
        username: r.username,
        kind: r.kind,
        effective_date: r.effective_date,
        is_before_event: r.is_before_event,
        is_within_60days: r.is_within_60days,
        eventDateStr: eventDateStr,
        windowStart: windowStartDate.toISOString().split('T')[0]
      })));
    } else {
      console.log(`[fairness] WARNING: No selections found for any applicant`);
    }
    
    // 60日以内の確定履歴を取得（イベント日付より前のみ）
    // 重要：60日以内の判定は「イベントの日付（event_date）」で行う
    // decided_atは確定した日時なので、イベントの日付とは異なる可能性がある
    const historyResult = await query(
      `SELECT s.username, s.kind, e.event_date, e.date AS date_text, s.decided_at,
              COALESCE(e.event_date, NULLIF(e.date, '')::date) AS effective_date
       FROM selections s
       JOIN events e ON e.id = s.event_id
       WHERE s.username = ANY($1::text[])
         AND COALESCE(e.event_date, NULLIF(e.date, '')::date) IS NOT NULL
         AND COALESCE(e.event_date, NULLIF(e.date, '')::date) < $2::date
         AND COALESCE(e.event_date, NULLIF(e.date, '')::date) >= $3::date
       ORDER BY s.username, COALESCE(e.event_date, NULLIF(e.date, '')::date) DESC`,
      [
        applicantUsernames,
        eventDateStr,
        windowStartDate.toISOString().split('T')[0]
      ]
    );
    
    // デバッグ用：クエリパラメータをログ出力
    console.log(`[fairness] historyResult query params:`, {
      applicantUsernames: applicantUsernames.length,
      eventDateStr,
      windowStart: windowStartDate.toISOString().split('T')[0],
      daysDiff: Math.floor((new Date(eventDateStr + "T00:00:00Z") - windowStartDate) / (1000 * 60 * 60 * 24))
    });
    
    // デバッグ用：取得した履歴数をログ出力
    console.log(`[fairness] historyCount (within 60 days): ${historyResult.rows.length}`);
    if (historyResult.rows.length > 0) {
      console.log(`[fairness] sample history row:`, JSON.stringify(historyResult.rows[0], null, 2));
      console.log(`[fairness] all history rows:`, historyResult.rows.map(r => ({
        username: r.username,
        kind: r.kind,
        decided_at: r.decided_at,
        event_date: r.event_date,
        date_text: r.date_text,
        effective_date: r.effective_date
      })));
    } else {
      console.log(`[fairness] WARNING: No history found within 60 days`);
    }

    // 4. 各応募者の最終確定日を取得（全期間、イベント日付より前のみ）
    // 重要：最終確定日は「イベントの日付（event_date）」で判定する
    const lastDecidedResult = await query(
      `SELECT s.username, MAX(COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS last_date
       FROM selections s
       JOIN events e ON e.id = s.event_id
       WHERE s.username = ANY($1::text[])
         AND COALESCE(e.event_date, NULLIF(e.date, '')::date) IS NOT NULL
         AND COALESCE(e.event_date, NULLIF(e.date, '')::date) < $2::date
       GROUP BY s.username`,
      [
        applicantsResult.rows.map(r => r.username),
        eventDateStr
      ]
    );

    // 5. 特徴量を計算
    const historyByUser = {};
    for (const row of historyResult.rows) {
      const username = row.username;
      if (!historyByUser[username]) {
        historyByUser[username] = { driver: [], attendant: [] };
      }
      historyByUser[username][row.kind].push(row);
    }
    
    // デバッグ用：各ユーザーの履歴数をログ出力
    const debugHistory = {};
    for (const username in historyByUser) {
      debugHistory[username] = {
        driver: historyByUser[username].driver.length,
        attendant: historyByUser[username].attendant.length,
        total: historyByUser[username].driver.length + historyByUser[username].attendant.length
      };
    }
    console.log(`[fairness] historyByUser:`, JSON.stringify(debugHistory, null, 2));

    const lastDecidedByUser = {};
    for (const row of lastDecidedResult.rows) {
      if (row.last_date) {
        const lastDateStr = typeof row.last_date === 'string' ? row.last_date.split('T')[0] : row.last_date;
        const lastDateObj = new Date(lastDateStr + "T00:00:00Z");
        if (!isNaN(lastDateObj.getTime())) {
          lastDecidedByUser[row.username] = lastDateObj;
        }
      }
    }

    // 6. 各応募者に特徴量とスコアを付与
    const candidates = [];
    for (const app of applicantsResult.rows) {
      const username = app.username;
      const kind = app.kind;
      const history = historyByUser[username] || { driver: [], attendant: [] };
      
      // count60: 直近60日で確定した回数（driver+attendant合算）
      const driverCount = (history.driver || []).length;
      const attendantCount = (history.attendant || []).length;
      const count60 = driverCount + attendantCount;
      
      // roleCount60: 直近60日でその役割で確定した回数
      const roleCount60 = (history[kind] || []).length;
      
      // デバッグ用：全応募者のカウントをログ出力（0でも出力）
      console.log(`[fairness] ${username} (${kind}): count60=${count60}, roleCount60=${roleCount60}, driver=${driverCount}, attendant=${attendantCount}`);
      if (count60 === 0 && roleCount60 === 0) {
        // 0の場合、なぜ0なのかを詳しく調べる
        const allSelectionsForUser = allSelectionsCheck.rows.filter(r => r.username === username);
        console.log(`[fairness] ${username}: all selections count=${allSelectionsForUser.length}`, allSelectionsForUser.map(r => ({
          kind: r.kind,
          effective_date: r.effective_date,
          is_before_event: r.is_before_event,
          is_within_60days: r.is_within_60days
        })));
      }
      
      // gapDays: 最後に確定した日からの経過日数（経験なしは9999）
      let gapDays = 9999;
      if (lastDecidedByUser[username]) {
        try {
          const daysDiff = Math.floor((eventDateObj - lastDecidedByUser[username]) / (1000 * 60 * 60 * 24));
          gapDays = Math.max(0, daysDiff);
        } catch (e) {
          console.error(`[fairness] Error calculating gapDays for ${username}:`, e);
          gapDays = 9999;
        }
      }
      
      // スコア計算
      const score = 10 * count60 + 3 * roleCount60 - gapDays;
      
      candidates.push({
          username,
          kind,
        applied_at: app.created_at,
        count60,
        roleCount60,
        gapDays,
        score,
      });
    }

    // 7. 役割ごとにソート（スコア最小、同点時は優先順位に従う）
    const compareCandidates = (a, b) => {
      // 1. スコアが小さい順
      if (a.score !== b.score) return a.score - b.score;
      // 2. roleCount60が少ない順
      if (a.roleCount60 !== b.roleCount60) return a.roleCount60 - b.roleCount60;
      // 3. count60が少ない順
      if (a.count60 !== b.count60) return a.count60 - b.count60;
      // 4. gapDaysが大きい順（最後に確定してから長い順）
      if (a.gapDays !== b.gapDays) return b.gapDays - a.gapDays;
      // 5. 五十音順（usernameで比較）
      return a.username.localeCompare(b.username, 'ja');
    };

    const driver = [];
    const attendant = [];
    let driverRank = 1;
    let attendantRank = 1;

    // 役割ごとにソート
    const driverCandidates = candidates.filter(c => c.kind === 'driver').sort(compareCandidates);
    const attendantCandidates = candidates.filter(c => c.kind === 'attendant').sort(compareCandidates);

    for (const cand of driverCandidates) {
      driver.push({
        username: cand.username,
        kind: 'driver',
        times: cand.count60, // 互換性のため
        last_at: lastDecidedByUser[cand.username] ? lastDecidedByUser[cand.username].toISOString() : null,
        applied_at: cand.applied_at,
        rank: driverRank++,
        // デバッグ用（必要に応じて）
        count60: cand.count60,
        roleCount60: cand.roleCount60,
        gapDays: cand.gapDays,
        score: cand.score,
      });
    }

    for (const cand of attendantCandidates) {
      attendant.push({
        username: cand.username,
        kind: 'attendant',
        times: cand.count60, // 互換性のため
        last_at: lastDecidedByUser[cand.username] ? lastDecidedByUser[cand.username].toISOString() : null,
        applied_at: cand.applied_at,
        rank: attendantRank++,
        // デバッグ用（必要に応じて）
        count60: cand.count60,
        roleCount60: cand.roleCount60,
        gapDays: cand.gapDays,
        score: cand.score,
      });
    }

    const response = { event_id: Number(eventId), driver, attendant };
    
    // デバッグ用：レスポンスの内容をログ出力
    console.log(`[fairness] ===== RESPONSE =====`);
    console.log(`[fairness] driver count: ${driver.length}, attendant count: ${attendant.length}`);
    console.log(`[fairness] all drivers with count60:`, driver.map(d => ({ 
      username: d.username, 
      count60: d.count60, 
      roleCount60: d.roleCount60,
      times: d.times,
      last_at: d.last_at,
      hasCount60: d.count60 !== undefined,
      hasRoleCount60: d.roleCount60 !== undefined
    })));
    console.log(`[fairness] all attendants with count60:`, attendant.map(a => ({ 
      username: a.username, 
      count60: a.count60, 
      roleCount60: a.roleCount60,
      times: a.times,
      last_at: a.last_at,
      hasCount60: a.count60 !== undefined,
      hasRoleCount60: a.roleCount60 !== undefined
    })));
    if (driver.length > 0) {
      console.log(`[fairness] first driver full:`, JSON.stringify(driver[0], null, 2));
    }
    if (attendant.length > 0) {
      console.log(`[fairness] first attendant full:`, JSON.stringify(attendant[0], null, 2));
    }
    console.log(`[fairness] ===== END =====`);
    
    return res.status(200).json(response);
  } catch (err) {
    console.error("[/api/fairness] Error:", err);
    return res.status(500).json({ error: "Server Error: " + err.message });
  }
}