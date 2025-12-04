-- selectionsテーブルの全データを確認
SELECT 
  s.id,
  s.event_id,
  s.username,
  s.kind,
  s.decided_at,
  e.date AS event_date_text,
  e.event_date,
  COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS effective_date
FROM selections s
LEFT JOIN events e ON e.id = s.event_id
ORDER BY s.decided_at DESC NULLS LAST, e.event_date DESC NULLS LAST, e.date DESC
LIMIT 50;

-- 特定のユーザーのselectionsデータを確認
-- SELECT 
--   s.event_id,
--   s.username,
--   s.kind,
--   s.decided_at,
--   e.date AS event_date_text,
--   e.event_date,
--   COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS effective_date
-- FROM selections s
-- LEFT JOIN events e ON e.id = s.event_id
-- WHERE s.username = 'ユーザー名'  -- ここに確認したいユーザー名を入力
-- ORDER BY COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) DESC;

-- decided_atがNULLのデータを確認
SELECT 
  s.event_id,
  s.username,
  s.kind,
  s.decided_at,
  e.date AS event_date_text,
  e.event_date
FROM selections s
LEFT JOIN events e ON e.id = s.event_id
WHERE s.decided_at IS NULL
ORDER BY e.event_date DESC NULLS LAST, e.date DESC;

-- 最近60日以内の確定データを確認（例：今日を基準に）
SELECT 
  s.username,
  s.kind,
  s.decided_at,
  e.event_date,
  e.date AS event_date_text,
  COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS effective_date,
  CURRENT_DATE - COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS days_ago
FROM selections s
LEFT JOIN events e ON e.id = s.event_id
WHERE COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) IS NOT NULL
  AND COALESCE(s.decided_at::date, COALESCE(e.event_date, NULLIF(e.date, '')::date)) >= CURRENT_DATE - INTERVAL '60 days'
ORDER BY effective_date DESC;

-- selectionsテーブルの統計情報
SELECT 
  COUNT(*) AS total_selections,
  COUNT(DISTINCT username) AS unique_users,
  COUNT(DISTINCT event_id) AS unique_events,
  COUNT(CASE WHEN decided_at IS NULL THEN 1 END) AS null_decided_at_count,
  COUNT(CASE WHEN decided_at IS NOT NULL THEN 1 END) AS has_decided_at_count
FROM selections;
