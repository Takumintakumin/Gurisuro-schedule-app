# スケジュール管理システム 自動選出ロジック説明

## 概要

このシステムは、イベントへの応募者を公平に選出するための自動選出機能を実装しています。主に2つのAPIがあります：

1. **Fairness API** (`/api/fairness`): 応募者を公平性スコアでランキング
2. **自動選出 API** (`/api/decide_auto`): 定員に合わせて自動選出（幕張ベイタウンに詳しくない人同士の組み合わせを避ける）

---

## 自動選出ロジックの処理手順

### Step1: 確定済み確認

すでに確定済みの役割はそのまま採用し、空きがある役割のみ自動選出を実行します。

**実装箇所**: `api/api-lib/index.js` の `decide_auto` エンドポイント

```javascript
// 公平ランキングを取得（確定回数（selections）で計算）
// 既に確定済みの人はselectionsテーブルに存在するため、
// applicationsテーブルから取得する応募者リストには含まれない
```

---

### Step2: 直近60日（W=60）で実績を集計

**実装箇所**: `api/api-lib/fairness.js`

各応募者について、以下の3つの特徴量を計算します：

#### 1. count60（直近60日間の確定回数）

```javascript
// count60: 直近60日で確定した回数（driver+attendant合算）
const driverCount = (history.driver || []).length;
const attendantCount = (history.attendant || []).length;
const count60 = driverCount + attendantCount;
```

- 運転手として確定した回数 + 添乗員として確定した回数の合計
- 直近60日間のデータのみを使用

#### 2. roleCount60（直近60日間の役割別確定回数）

```javascript
// roleCount60: 直近60日でその役割で確定した回数
const roleCount60 = (history[kind] || []).length;
```

- 今回応募している役割（運転手または添乗員）での確定回数
- 直近60日間のデータのみを使用

#### 3. gapDays（最後の確定からの経過日数）

```javascript
// gapDays: 最後に確定した日からの経過日数（経験なしは9999）
let gapDays = 9999;
if (lastDecidedByUser[username]) {
  try {
    const daysDiff = Math.floor((eventDateObj - lastDecidedByUser[username]) / (1000 * 60 * 60 * 24));
    gapDays = Math.max(0, daysDiff);
  } catch (e) {
    gapDays = 9999;
  }
}
```

- イベント日付から最後の確定日を引いた日数
- 未経験の場合は9999

**最終確定日の取得SQL**:

```sql
SELECT s.username, MAX(COALESCE(e.event_date, NULLIF(e.date, '')::date)) AS last_date
FROM selections s
JOIN events e ON e.id = s.event_id
WHERE s.username = ANY($1::text[])
  AND COALESCE(e.event_date, NULLIF(e.date, '')::date) IS NOT NULL
  AND COALESCE(e.event_date, NULLIF(e.date, '')::date) < $2::date
GROUP BY s.username
```

---

### Step3: スコア計算

**実装箇所**: `api/api-lib/fairness.js` 297行目

```javascript
// スコア計算
const score = 10 * count60 + 3 * roleCount60 - gapDays;
```

**スコアの意味:**
- `count60`（×10）: 全体の実績に大きな重み
- `roleCount60`（×3）: 役割別の実績に中程度の重み
- `gapDays`（−）: 最後の確定からの経過日数（大きいほどスコアが下がる）

**スコアが小さいほど優先度が高い**

**例:**
- `count60=2, roleCount60=1, gapDays=22` → `score = 10×2 + 3×1 - 22 = 1`
- `count60=0, roleCount60=0, gapDays=9999` → `score = 10×0 + 3×0 - 9999 = -9999`（最優先）

---

### Step4: 運転手 → 添乗員の順で選出

**実装箇所**: `api/api-lib/index.js` 1051-1055行目

#### 4-1. 運転手をスコア順に並べ、定員分選出

```javascript
// 運転手を公平ランキング順に選出
const driverCandidates = capD == null ? driverRank : driverRank.slice(0, Math.max(0, capD));
for (const driver of driverCandidates) {
  pickedDriver.push(driver.username);
}
```

- 全応募者をスコア順にソート
- 運転手として応募している人を抽出
- 定員（`capacity_driver`）分まで選出

#### 4-2. 二重確定防止

```javascript
// 既に運転手として選出されている人は添乗員から除外
const pickedDriverSet = new Set(pickedDriver);
```

- 運転手として選出された人は、添乗員の候補から除外
- 同じ人が両方の役割に選ばれることを防ぐ

---

### Step5: 添乗員を残り候補から選出

**実装箇所**: `api/api-lib/index.js` 1065-1094行目

```javascript
for (const attendant of attendantRank) {
  if (pickedAttendant.length >= maxAttendants) break;
  
  // 既に運転手として選出されている人は添乗員から除外
  if (pickedDriverSet.has(attendant.username)) {
    continue;
  }
  
  // 選出された運転手と組み合わせた時に、両方"unfamiliar"にならないかチェック
  const attendantIsFamiliar = attendant.familiar === 'familiar';
  
  // 運転手が選出されている場合
  if (pickedDriver.length > 0) {
    // 少なくとも1人の運転手が詳しい、またはこの添乗員が詳しい場合はOK
    const hasFamiliarDriver = pickedDriver.some(driverUsername => 
      driverFamiliarMap[driverUsername] === true
    );
    
    if (hasFamiliarDriver || attendantIsFamiliar) {
      // 組み合わせ可能
      pickedAttendant.push(attendant.username);
    } else if (pickedAttendant.length < maxAttendants) {
      // 全員詳しくない場合でも、定員に満たない場合は最小限許容
      pickedAttendant.push(attendant.username);
    }
  } else {
    // 運転手が選出されていない場合は、そのまま選出
    pickedAttendant.push(attendant.username);
  }
}
```

**処理内容:**
1. 運転手として選出された人を除外
2. 残りの添乗員候補をスコア順にソート
3. 定員（`capacity_attendant`）分まで選出
4. **幕張ベイタウンに詳しくない人同士の組み合わせを避ける**

**組み合わせ判定ルール:**
- 運転手に1人以上詳しい人がいる → ✅ 選出OK
- 添乗員が詳しい → ✅ 選出OK
- 全員詳しくない場合 → ⚠️ 定員に満たない場合のみ許容

---

## 同点処理（優先順位）

**実装箇所**: `api/api-lib/fairness.js` 311-322行目

スコアが同じ場合の判定順：

```javascript
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
```

**優先順位:**
1. **スコアが小さい順**（最優先）
2. `roleCount60`が少ない順
3. `count60`が少ない順
4. `gapDays`が大きい順（最後に確定してから長い順）
5. 五十音順

---

## 公平ランキング（自動選出API用）

**実装箇所**: `api/api-lib/index.js` 983-1015行目

自動選出APIでは、全期間の履歴を使用してランキングを計算します：

```sql
WITH decided_count AS (
  SELECT username, kind, COUNT(*) AS times, MAX(decided_at) AS last_at
  FROM selections
  GROUP BY username, kind
),
appl AS (
  SELECT a.id, a.event_id, a.username, a.kind, a.created_at,
         COALESCE(dc.times, 0) AS times,
         dc.last_at,
         COALESCE(u.familiar, 'unknown') AS familiar
  FROM applications a
  LEFT JOIN decided_count dc ON dc.username = a.username AND dc.kind = a.kind
  LEFT JOIN users u ON u.username = a.username
  WHERE a.event_id = $1
),
ranked AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY kind
           ORDER BY times ASC,
                    COALESCE(last_at, 'epoch') ASC,
                    created_at ASC
         ) AS rnk
  FROM appl
)
SELECT * FROM ranked ORDER BY kind, rnk;
```

**ランキング基準:**
1. `times`（確定回数）が少ない順
2. `last_at`（最終確定日）が古い順（`null`は最古として扱う）
3. `created_at`（応募日時）が古い順

**Fairness APIとの違い:**
- Fairness API: 直近60日間の履歴を使用（`count60`, `roleCount60`, `gapDays`）
- 自動選出API: 全期間の履歴を使用（`times`, `last_at`）

---

## 幕張ベイタウンに詳しくない人同士の組み合わせ回避

**実装箇所**: `api/api-lib/index.js` 1060-1094行目

### 運転手の詳しさ情報をマップ化

```javascript
const driverFamiliarMap = Object.fromEntries(
  driverCandidates.map(d => [d.username, d.familiar === 'familiar'])
);
```

### 組み合わせ判定

| 運転手の状態 | 添乗員の状態 | 判定 | 理由 |
|------------|------------|------|------|
| 1人以上が`familiar` | 任意 | ✅ **選出OK** | 運転手に詳しい人がいる |
| 全員`unfamiliar` | `familiar` | ✅ **選出OK** | 添乗員が詳しい |
| 全員`unfamiliar` | `unfamiliar` | ⚠️ **条件付きOK** | 定員に満たない場合のみ許容 |
| 全員`unfamiliar` | `unfamiliar` | ❌ **選出NG** | 定員が満たされている場合は除外 |

**重要なポイント:**
- 運転手は公平性ランキング順に選出（`familiar`は考慮しない）
- 添乗員は運転手との組み合わせを考慮して選出
- 原則として「全員詳しくない組み合わせ」は避ける
- 定員に満たない場合は最小限許容する

---

## データフロー全体

```
1. ユーザーがイベントに応募
   ↓
2. 管理者が「公平性を確認」をクリック
   ↓
3. Fairness APIが呼び出される
   ├─ 直近60日間の確定履歴を取得
   ├─ 最終確定日を取得
   ├─ count60, roleCount60, gapDaysを計算
   ├─ スコアを計算
   └─ ランキング順にソート
   ↓
4. 管理者が「自動選出」をクリック
   ↓
5. 自動選出APIが呼び出される
   ├─ 全期間の確定履歴を取得
   ├─ 公平性ランキングを計算
   ├─ 運転手をランキング順に選出
   ├─ 添乗員をランキング順に選出（ただし詳しくない人同士の組み合わせを避ける）
   └─ 選出結果を返す
   ↓
6. 管理者が「確定」をクリック
   ↓
7. selectionsテーブルに保存
```

---

## コードファイル

- **Fairness API**: `api/api-lib/fairness.js`
- **自動選出API**: `api/api-lib/index.js` (963-1109行目)

---

## まとめ

このシステムは、以下の2つの主要な機能を提供します：

1. **Fairness API**: 応募者を公平性スコアでランキング（直近60日間の履歴を使用）
2. **自動選出**: 定員に合わせて自動選出（幕張ベイタウンに詳しくない人同士の組み合わせを避ける）

両方の機能は、公平性を保ちながら、実用的な制約（幕張ベイタウンに詳しくない人同士の組み合わせを避ける）を考慮しています。
```

ChatGPTに送りやすい形式のロジック説明を作成しました。コードの主要部分を引用し、処理の流れを説明しています。この内容をChatGPTに送って、コードレビューや改善提案、説明の補足などを依頼できます。


