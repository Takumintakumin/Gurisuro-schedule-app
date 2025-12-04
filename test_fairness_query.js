// fairness APIのクエリをテストするためのスクリプト
// このファイルは参考用です。実際にはAPIエンドポイントを呼び出してください。

// テスト用のSQLクエリ（NeonのSQLエディタで実行）
const testQuery = `
-- 特定のイベントIDの応募者とその確定履歴を確認
WITH event_info AS (
  SELECT 
    id,
    COALESCE(event_date, NULLIF(date, '')::date) AS event_date,
    date AS date_text
  FROM events
  WHERE id = 1  -- ここに確認したいイベントIDを入力
),
applicants AS (
  SELECT DISTINCT username
  FROM applications
  WHERE event_id = 1  -- ここに確認したいイベントIDを入力
),
window_info AS (
  SELECT 
    event_date,
    event_date - INTERVAL '60 days' AS window_start
  FROM event_info
)
SELECT 
  s.username,
  s.kind,
  s.decided_at,
  e.event_date,
  e.date AS event_date_text,
  COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS effective_date,
  wi.event_date AS target_event_date,
  wi.window_start,
  CASE 
    WHEN COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) < wi.event_date THEN 'before'
    ELSE 'after_or_equal'
  END AS before_event,
  CASE 
    WHEN COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) >= wi.window_start THEN 'within_60days'
    ELSE 'outside_60days'
  END AS within_60days_status
FROM selections s
JOIN events e ON e.id = s.event_id
CROSS JOIN window_info wi
WHERE s.username IN (SELECT username FROM applicants)
ORDER BY s.username, effective_date DESC;
`;

console.log('上記のSQLクエリをNeonのSQLエディタで実行してください。');
