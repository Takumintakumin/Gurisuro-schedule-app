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
    const eventIdNum = Number(eventId); // 数値に変換

    // W=30: 直近30日間の履歴を使用
    const W_DAYS = 30;

    // 1. イベントの日付を取得
    const eventResult = await query(
      `SELECT COALESCE(event_date, NULLIF(date, '')::date) AS event_date, date AS date_text
       FROM events WHERE id = $1`,
      [eventIdNum]
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

    // 2. 応募者リストを取得（applicationsテーブルから）
    const applicantsResult = await query(
      `SELECT a.id, a.username, a.kind, a.created_at
       FROM applications a
       WHERE a.event_id = $1
       ORDER BY a.kind, a.created_at ASC`,
      [eventIdNum]
    );

    // 3. 確定済みユーザーリストを取得（selectionsテーブルから、applicationsに存在しないユーザーも含める）
    // 重要：確定済みユーザーもallApplicantsに含めることで、last_atを取得できるようにする
    const confirmedResult = await query(
      `SELECT DISTINCT s.username, s.kind, COALESCE(s.decided_at, NOW()) AS created_at
       FROM selections s
       WHERE s.event_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM applications a 
           WHERE a.event_id = s.event_id 
             AND a.username = s.username 
             AND a.kind = s.kind
         )
       ORDER BY s.kind, COALESCE(s.decided_at, NOW()) ASC`,
      [eventIdNum]
    );

    // 応募者と確定済みユーザーを結合
    const allApplicants = [
      ...(applicantsResult.rows || []),
      ...(confirmedResult.rows || []).map(row => ({
        id: null,
        username: row.username,
        kind: row.kind,
        created_at: row.created_at || new Date().toISOString()
      }))
    ];
    

    // 応募者がいない場合は早期リターン
    if (!allApplicants || allApplicants.length === 0) {
      return res.status(200).json({ event_id: Number(eventId), driver: [], attendant: [] });
    }

    // 4. 各応募者の直近30日間の確定履歴を取得（イベント日付より前のみ）
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
    const applicantUsernames = allApplicants.map(r => r.username);
    console.log(`[fairness] ===== START =====`);
      console.log(`[fairness] event_id: ${eventIdNum}`);
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
    
    // 30日以内の確定履歴を取得（イベント日付より前のみ）
    // 重要：30日以内の判定は「イベントの日付（event_date）」で行う
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
    console.log(`[fairness] historyCount (within 30 days): ${historyResult.rows.length}`);
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
      console.log(`[fairness] WARNING: No history found within 30 days`);
    }

    // 5. 各応募者の最終確定日を取得（全期間、イベント日付より前のみ）
    // 重要：最終確定日は「イベントの日付（event_date）」で判定する
    // 現在のイベントIDは除外する（現在のイベントの確定日は「最終確定日」としてカウントしない）
    const applicantUsernames = [...new Set(allApplicants.map(r => r.username))]; // 重複を除去
    
    // 全ユーザーについて、個別にlast_atを取得（確実に取得するため）
    const lastDecidedByUser = {};
    
    // 全ユーザーについて、個別にlast_atを取得（確実に取得するため）
    // 並列処理で高速化
    const lastAtPromises = applicantUsernames.map(async (username) => {
      try {
        // 現在のイベントIDを除外し、過去のイベントでの最終確定日を取得
        // イベントに日付が未設定の場合は決定日時(decided_at)を代用
        // 日付比較はCASTで厳密に行う
        const userLastDateResult = await query(
          `SELECT MAX(COALESCE(
                     e.event_date,
                     NULLIF(e.date, '')::date,
                     s.decided_at::date
                   )) AS last_date
           FROM selections s
           JOIN events e ON e.id = s.event_id
           WHERE s.username = $1
             AND s.event_id != $2
             AND COALESCE(e.event_date, NULLIF(e.date, '')::date, s.decided_at::date) IS NOT NULL
             AND COALESCE(e.event_date, NULLIF(e.date, '')::date, s.decided_at::date)::date < $3::date`,
          [username, eventIdNum, eventDateStr]
        );
        
        if (userLastDateResult.rows && userLastDateResult.rows.length > 0 && userLastDateResult.rows[0].last_date) {
          const row = userLastDateResult.rows[0];
          let lastDateStr;
          if (typeof row.last_date === 'string') {
            lastDateStr = row.last_date.split('T')[0];
          } else if (row.last_date instanceof Date) {
            lastDateStr = row.last_date.toISOString().split('T')[0];
          } else {
            lastDateStr = String(row.last_date).split('T')[0];
          }
          const lastDateObj = new Date(lastDateStr + "T00:00:00Z");
          if (!isNaN(lastDateObj.getTime())) {
            return { username, lastDate: lastDateObj };
          }
        }
      } catch (e) {
        // エラーが発生した場合はnullを返す
      }
      return { username, lastDate: null };
    });
    
    const lastAtResults = await Promise.all(lastAtPromises);
    for (const result of lastAtResults) {
      if (result.lastDate) {
        lastDecidedByUser[result.username] = result.lastDate;
      }
    }

    // 6. 特徴量を計算
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
    
    // lastDecidedByUserに含まれていないユーザーについて、個別にlast_atを取得
    // バッチクエリで一度に取得する方が効率的
    const missingUsers = allApplicants.filter(app => !lastDecidedByUser[app.username]);
    if (missingUsers.length > 0) {
      console.log(`[fairness] Missing last_at for users:`, missingUsers.map(u => u.username));
      try {
        const missingUsernames = [...new Set(missingUsers.map(u => u.username))];
        const missingLastDateResult = await query(
          `SELECT s.username, MAX(COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS last_date
           FROM selections s
           JOIN events e ON e.id = s.event_id
           WHERE s.username = ANY($1::text[])
             AND s.event_id != $2
             AND COALESCE(e.event_date, NULLIF(e.date, '')::date) IS NOT NULL
             AND COALESCE(e.event_date, NULLIF(e.date, '')::date) < $3::date
           GROUP BY s.username`,
          [missingUsernames, eventIdNum, eventDateStr]
        );
        
        for (const row of missingLastDateResult.rows) {
          if (row.last_date) {
            let lastDateStr;
            if (typeof row.last_date === 'string') {
              lastDateStr = row.last_date.split('T')[0];
            } else if (row.last_date instanceof Date) {
              lastDateStr = row.last_date.toISOString().split('T')[0];
            } else {
              lastDateStr = String(row.last_date).split('T')[0];
            }
            const lastDateObj = new Date(lastDateStr + "T00:00:00Z");
            if (!isNaN(lastDateObj.getTime())) {
              lastDecidedByUser[row.username] = lastDateObj;
              console.log(`[fairness] ${row.username}: last_at set to ${lastDateStr} (batch query)`);
            }
          }
        }
      } catch (e) {
        console.error(`[fairness] Error fetching last_at for missing users:`, e);
        // フォールバック：個別に取得
        for (const app of missingUsers) {
          try {
            const userLastDateResult = await query(
              `SELECT MAX(COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS last_date
               FROM selections s
               JOIN events e ON e.id = s.event_id
               WHERE s.username = $1
                 AND s.event_id != $2
                 AND COALESCE(e.event_date, NULLIF(e.date, '')::date) IS NOT NULL
                 AND COALESCE(e.event_date, NULLIF(e.date, '')::date) < $3::date`,
              [app.username, eventIdNum, eventDateStr]
            );
            
            if (userLastDateResult.rows && userLastDateResult.rows.length > 0 && userLastDateResult.rows[0].last_date) {
              const row = userLastDateResult.rows[0];
              let lastDateStr;
              if (typeof row.last_date === 'string') {
                lastDateStr = row.last_date.split('T')[0];
              } else if (row.last_date instanceof Date) {
                lastDateStr = row.last_date.toISOString().split('T')[0];
              } else {
                lastDateStr = String(row.last_date).split('T')[0];
              }
              const lastDateObj = new Date(lastDateStr + "T00:00:00Z");
              if (!isNaN(lastDateObj.getTime())) {
                lastDecidedByUser[app.username] = lastDateObj;
                console.log(`[fairness] ${app.username}: last_at set to ${lastDateStr} (individual query)`);
              }
            }
          } catch (e2) {
            console.error(`[fairness] Error fetching last_at for ${app.username}:`, e2);
          }
        }
      }
    }
    
    // デバッグ用：lastDecidedByUserの内容をログ出力
    console.log(`[fairness] lastDecidedByUser count: ${Object.keys(lastDecidedByUser).length}`);
    console.log(`[fairness] lastDecidedByUser:`, Object.keys(lastDecidedByUser).map(u => ({
      username: u,
      last_at: lastDecidedByUser[u].toISOString()
    })));

    // 7. 各応募者に特徴量とスコアを付与
    const candidates = [];
    for (const app of allApplicants) {
      const username = app.username;
      const kind = app.kind;
      const history = historyByUser[username] || { driver: [], attendant: [] };
      
      // count60: 直近30日で確定した回数（driver+attendant合算）
      const driverCount = (history.driver || []).length;
      const attendantCount = (history.attendant || []).length;
      const count60 = driverCount + attendantCount;
      
      // roleCount60: 直近30日でその役割で確定した回数
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
          console.log(`[fairness] ${username}: gapDays calculated = ${gapDays} (eventDate: ${eventDateStr}, lastDate: ${lastDecidedByUser[username].toISOString().split('T')[0]})`);
        } catch (e) {
          console.error(`[fairness] Error calculating gapDays for ${username}:`, e);
          gapDays = 9999;
        }
      } else {
        console.log(`[fairness] ${username}: gapDays = 9999 (no lastDecidedByUser)`);
      }
      
      // スコア計算
      const score = 4 * count60 + 1 * roleCount60 - 3 * gapDays;
      
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

    // 8. 役割ごとにソート（スコア最小、同点時は優先順位に従う）
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
      // last_atを確実に取得（lastDecidedByUserから取得、なければ再度取得を試みる）
      let lastAt = null;
      if (lastDecidedByUser[cand.username]) {
        lastAt = lastDecidedByUser[cand.username].toISOString();
      } else {
        // lastDecidedByUserに含まれていない場合、再度取得を試みる
        try {
          const userLastDateResult = await query(
            `SELECT MAX(COALESCE(
                     e.event_date,
                     NULLIF(e.date, '')::date,
                     s.decided_at::date
                   )) AS last_date
             FROM selections s
             JOIN events e ON e.id = s.event_id
             WHERE s.username = $1
               AND s.event_id != $2
               AND COALESCE(e.event_date, NULLIF(e.date, '')::date, s.decided_at::date) IS NOT NULL
               AND COALESCE(e.event_date, NULLIF(e.date, '')::date, s.decided_at::date)::date < $3::date`,
            [cand.username, eventIdNum, eventDateStr]
          );
          
          if (userLastDateResult.rows && userLastDateResult.rows.length > 0 && userLastDateResult.rows[0].last_date) {
            const row = userLastDateResult.rows[0];
            let lastDateStr;
            if (typeof row.last_date === 'string') {
              lastDateStr = row.last_date.split('T')[0];
            } else if (row.last_date instanceof Date) {
              lastDateStr = row.last_date.toISOString().split('T')[0];
            } else {
              lastDateStr = String(row.last_date).split('T')[0];
            }
            const lastDateObj = new Date(lastDateStr + "T00:00:00Z");
            if (!isNaN(lastDateObj.getTime())) {
              lastAt = lastDateObj.toISOString();
              lastDecidedByUser[cand.username] = lastDateObj;
            }
          }
        } catch (e) {
          // エラーが発生した場合はnullのまま
        }
      }
      
      driver.push({
        username: cand.username,
        kind: 'driver',
        times: cand.count60, // 互換性のため
        last_at: lastAt,
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
      // last_atを確実に取得（lastDecidedByUserから取得、なければ再度取得を試みる）
      let lastAt = null;
      if (lastDecidedByUser[cand.username]) {
        lastAt = lastDecidedByUser[cand.username].toISOString();
      } else {
        // lastDecidedByUserに含まれていない場合、再度取得を試みる
        try {
          const userLastDateResult = await query(
            `SELECT MAX(COALESCE(
                     e.event_date,
                     NULLIF(e.date, '')::date,
                     s.decided_at::date
                   )) AS last_date
             FROM selections s
             JOIN events e ON e.id = s.event_id
             WHERE s.username = $1
               AND s.event_id != $2
               AND COALESCE(e.event_date, NULLIF(e.date, '')::date, s.decided_at::date) IS NOT NULL
               AND COALESCE(e.event_date, NULLIF(e.date, '')::date, s.decided_at::date)::date < $3::date`,
            [cand.username, eventIdNum, eventDateStr]
          );
          
          if (userLastDateResult.rows && userLastDateResult.rows.length > 0 && userLastDateResult.rows[0].last_date) {
            const row = userLastDateResult.rows[0];
            let lastDateStr;
            if (typeof row.last_date === 'string') {
              lastDateStr = row.last_date.split('T')[0];
            } else if (row.last_date instanceof Date) {
              lastDateStr = row.last_date.toISOString().split('T')[0];
            } else {
              lastDateStr = String(row.last_date).split('T')[0];
            }
            const lastDateObj = new Date(lastDateStr + "T00:00:00Z");
            if (!isNaN(lastDateObj.getTime())) {
              lastAt = lastDateObj.toISOString();
              lastDecidedByUser[cand.username] = lastDateObj;
            }
          }
        } catch (e) {
          // エラーが発生した場合はnullのまま
        }
      }
      
      attendant.push({
        username: cand.username,
        kind: 'attendant',
        times: cand.count60, // 互換性のため
        last_at: lastAt,
        applied_at: cand.applied_at,
        rank: attendantRank++,
        // デバッグ用（必要に応じて）
        count60: cand.count60,
        roleCount60: cand.roleCount60,
        gapDays: cand.gapDays,
        score: cand.score,
      });
    }

    const response = { event_id: eventIdNum, driver, attendant };
    
    // デバッグ用：レスポンスの内容をログ出力
    console.log(`[fairness] ===== RESPONSE =====`);
    console.log(`[fairness] driver count: ${driver.length}, attendant count: ${attendant.length}`);
    console.log(`[fairness] all drivers with count60:`, driver.map(d => ({ 
      username: d.username, 
      count60: d.count60, 
      roleCount60: d.roleCount60,
      times: d.times,
      last_at: d.last_at,
      gapDays: d.gapDays,
      hasCount60: d.count60 !== undefined,
      hasRoleCount60: d.roleCount60 !== undefined,
      hasLastAt: d.last_at !== null && d.last_at !== undefined
    })));
    console.log(`[fairness] all attendants with count60:`, attendant.map(a => ({ 
      username: a.username, 
      count60: a.count60, 
      roleCount60: a.roleCount60,
      times: a.times,
      last_at: a.last_at,
      gapDays: a.gapDays,
      hasCount60: a.count60 !== undefined,
      hasRoleCount60: a.roleCount60 !== undefined,
      hasLastAt: a.last_at !== null && a.last_at !== undefined
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