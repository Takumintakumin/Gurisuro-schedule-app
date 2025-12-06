# Fairness API ロジック説明書

## 問題の概要

「最終:なし(未経験)」が常に表示される問題が発生していました。これは、`last_at`（最終確定日）と`gapDays`（経過日数）が正しく計算・返却されていないことが原因でした。

## 修正前の問題点

### 1. `last_date`の型処理が不十分
PostgreSQLから返される`last_date`の型が以下のいずれかになる可能性があります：
- 文字列（例: "2024-01-15"）
- Dateオブジェクト
- その他の型

修正前のコードでは、文字列とDateオブジェクトの両方に対応していましたが、型チェックが不十分で、一部のケースで正しく処理されない可能性がありました。

### 2. デバッグ情報の不足
`lastDecidedByUser`が正しく設定されているか、`gapDays`が正しく計算されているかを確認するためのログが不足していました。

## 修正後のロジック

### ステップ1: 最終確定日の取得（173-185行目）

```sql
SELECT s.username, MAX(COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS last_date
FROM selections s
JOIN events e ON e.id = s.event_id
WHERE s.username = ANY($1::text[])
  AND COALESCE(e.event_date, NULLIF(e.date, '')::date) IS NOT NULL
  AND COALESCE(e.event_date, NULLIF(e.date, '')::date) < $2::date
GROUP BY s.username
```

**説明:**
- 各応募者（`username`）について、**イベント日付より前**の確定履歴から、最も新しい日付を取得
- `event_date`が存在する場合はそれを使用、なければ`date`カラムを使用
- イベント日付より前のデータのみを対象（未来のイベントは除外）

### ステップ2: `lastDecidedByUser`オブジェクトの構築（222-244行目）

```javascript
const lastDecidedByUser = {};
for (const row of lastDecidedResult.rows) {
  if (row.last_date) {
    let lastDateStr;
    // 型に応じた処理
    if (typeof row.last_date === 'string') {
      lastDateStr = row.last_date.split('T')[0];  // "2024-01-15T00:00:00Z" → "2024-01-15"
    } else if (row.last_date instanceof Date) {
      lastDateStr = row.last_date.toISOString().split('T')[0];
    } else {
      // その他の型（PostgreSQLのdate型など）
      lastDateStr = String(row.last_date).split('T')[0];
    }
    
    // Dateオブジェクトに変換（UTC基準）
    const lastDateObj = new Date(lastDateStr + "T00:00:00Z");
    if (!isNaN(lastDateObj.getTime())) {
      lastDecidedByUser[row.username] = lastDateObj;
    }
  }
}
```

**改善点:**
1. **型チェックの強化**: 文字列、Dateオブジェクト、その他の型すべてに対応
2. **エラーハンドリング**: 無効な日付の場合はスキップ
3. **デバッグログ**: 各ユーザーの`last_at`設定状況をログ出力

### ステップ3: `gapDays`の計算（281-294行目）

```javascript
let gapDays = 9999;  // デフォルト値（経験なし）
if (lastDecidedByUser[username]) {
  try {
    // イベント日付 - 最終確定日 = 経過日数
    const daysDiff = Math.floor((eventDateObj - lastDecidedByUser[username]) / (1000 * 60 * 60 * 24));
    gapDays = Math.max(0, daysDiff);  // 負の値は0に
  } catch (e) {
    gapDays = 9999;  // エラー時は経験なしとして扱う
  }
}
```

**説明:**
- `lastDecidedByUser[username]`が存在する場合: イベント日付から最終確定日を引いて経過日数を計算
- 存在しない場合: `gapDays = 9999`（未経験として扱う）
- 計算結果が負の値になる場合は0に補正

### ステップ4: レスポンスの構築（333-363行目）

```javascript
for (const cand of driverCandidates) {
  driver.push({
    username: cand.username,
    kind: 'driver',
    times: cand.count60,
    last_at: lastDecidedByUser[cand.username] 
      ? lastDecidedByUser[cand.username].toISOString()  // ISO形式の文字列
      : null,  // 経験がない場合はnull
    gapDays: cand.gapDays,
    // ...
  });
}
```

**説明:**
- `last_at`: `lastDecidedByUser`に存在する場合はISO形式の文字列、なければ`null`
- `gapDays`: 計算された経過日数（経験なしの場合は9999）

## フロントエンドでの表示ロジック

`AdminDashboard.js`（1474-1480行目、1551-1557行目）:

```javascript
最終: {u.last_at ? toLocalYMD(u.last_at) : "なし"}
{u.gapDays !== undefined && u.gapDays !== 9999 && (
  <span className="ml-2 text-gray-400">(経過: {u.gapDays}日)</span>
)}
{u.gapDays === 9999 && (
  <span className="ml-2 text-gray-400">(未経験)</span>
)}
```

**表示ルール:**
1. `last_at`が存在する場合: `toLocalYMD(u.last_at)`で日付を表示
2. `last_at`が`null`の場合: "なし"と表示
3. `gapDays`が9999の場合: "(未経験)"と表示
4. `gapDays`が9999以外の場合: "(経過: X日)"と表示

## 問題の根本原因

修正前は、以下のケースで`last_at`が正しく設定されない可能性がありました：

1. **型の不一致**: PostgreSQLから返される`last_date`の型が想定と異なる場合
2. **日付変換の失敗**: 無効な日付形式の場合にエラーが発生し、`lastDecidedByUser`に設定されない
3. **デバッグ情報の不足**: 問題が発生している箇所を特定できない

## 修正による改善

1. **堅牢な型処理**: あらゆる型の`last_date`に対応
2. **詳細なデバッグログ**: 各ステップでログを出力し、問題の特定が容易に
3. **エラーハンドリング**: 無効なデータでもエラーで停止せず、適切に処理

## デバッグログの確認方法

サーバーのコンソールで以下のログを確認できます：

1. `[fairness] lastDecidedResult count: X` - 取得した最終確定日の数
2. `[fairness] lastDecidedByUser count: X` - 正しく設定されたユーザー数
3. `[fairness] {username}: last_at set to {date}` - 各ユーザーの`last_at`設定
4. `[fairness] {username}: gapDays calculated = {days}` - 各ユーザーの`gapDays`計算結果
5. `[fairness] all drivers with count60:` - レスポンスに含まれる全データ

これらのログにより、問題が発生している箇所を特定できます。


