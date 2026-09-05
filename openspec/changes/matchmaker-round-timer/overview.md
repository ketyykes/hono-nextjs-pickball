# Overview: matchmaker-round-timer

## Scope

讓主持人不必自己看手錶：每輪可選擇不計時或設定 10／15／20 分鐘倒數，開始計時後對戰頁
持續顯示剩餘時間，時間到時以大字＋提示音告知「該換場了」。時間到**不會**自動判定勝負或
結束任何場次——那是提示，不是裁決；平局怎麼判是下一個 milestone（M15）的範圍。

**規模判定：large。** 影響 3 個 capability（`round-lifecycle` MODIFIED＋ADDED、
`match-stage` MODIFIED＋ADDED、`pickleball-guide-page` MODIFIED），依規模表「影響
2-3 capabilities」單獨已達 medium 門檻；但本 change 新增 4 個檔案（`round-timer.ts`、
`round-timer-sound.ts`、`useRoundTimer.ts`、`RoundTimerBanner.tsx`）與其測試、修改 6 個
既有檔案，tasks.md 共 13 群組、約 60 項 task，依規模表「tasks > 20 即為 large」取最大
命中判定為 **large**（與 M9 `matchmaker-visual-export` 同一判定邏輯：capability 數不多，
但純函式＋hook＋元件＋E2E 四層各自都要走完整 TDD 三步，task 數自然超過門檻）。

條件式區塊判定：

| 條件 | 判定 | 理由 |
|---|---|---|
| 前端需求 → UI Mockups | ✅ 有 | 計時選項、開始計時按鈕、倒數顯示、時間到大字與提示、鎖定狀態全是視覺與互動 |
| 資料庫結構 → Data Model | ❌ 無 | 計時器為 LocalStorage-only 的既有回合物件新增一個 `.nullable().default(null)` 欄位，不涉及任何後端 schema 或資料庫 |
| 資料遷移 → Data Migration | ❌ 無 | 不搬移、不轉換任何既有資料；向後相容策略是「缺欄位時預設 null」，不是遷移 |
| 跨元件流程 → Sequence Diagram | ✅ 有 | 「開始計時」到「時間到」是順序敏感的非同步多步流程（每秒 tick → 到期判定 → 顯示切換 → 播放提示音，且只播一次），與純同步 CRUD 不同 |

## What Changes

- 每輪設定新增「計時」：不計時／10／15／20 分鐘，預設不計時，鎖定條件與目標分數共用
  `isTargetScoreLocked`
- `Round.timer` 新增欄位（`.nullable().default(null)`，不 bump storage key）
- 新增純函式 `round-timer.ts`（`remainingSeconds`／`isExpired`／`formatRemaining`）與
  `round.ts` 的 `setTimerDuration`／`startTimer` 兩個狀態轉換
- 新增唯一呼叫 `setInterval`／`new Date()` 的 hook `useRoundTimer.ts`
- 新增顯示元件 `RoundTimerBanner.tsx`：倒數 mm:ss、時間到大字＋`role="alert"`＋Web Audio
  提示音（零音檔、零相依），視覺呈現為靜態文字（不閃爍）
- 時間到不自動結束任何場次；重排不重置計時；產生新一輪一律給全新 timer
- `pickleball-guide-page` 的 hooks 歸屬清單新增一行 `useRoundTimer` → `round-lifecycle`

前後對照（純文字，不含 UI 細節）：

```
=== Before ===

  每輪設定       : 對戰方式 / 場地數 / 目標分數
  這一場什麼時候算完 : 只有「打到目標分數」一種依據
  主持人怎麼知道該換場 : 自己看手錶喊停
  package.json    : 無任何計時或音效相關相依

=== After ===

  每輪設定       : 對戰方式 / 場地數 / 目標分數 / 計時（不計時／10／15／20 分鐘）
  這一場什麼時候算完 : 打到目標分數，或（若設定計時）時間到提示換場
  主持人怎麼知道該換場 : 對戰頁大字「時間到」+ 提示音，重整頁面倒數續跑
  package.json    : 仍無任何相依 <- 刻意維持（Web Audio 為瀏覽器內建 API）
```

## UI Mockups

以下依使用順序列出六個 state。`←` 之後為註解，不是畫面文字。

第一組是計時設定本身：尚無回合時的選項，與已有回合、尚未鎖定時的「開始計時」入口。

```
=== State 1: 尚無回合時的計時設定（預設不計時）===

┌─ /matchmaker ─────────────────────────────────────────────┐
│ 對戰方式 (●)單打 ( )雙打   場地數 [-] 1 [+]                │
│ 目標分數 (●)11 ( )15 ( )21                                 │
│ 計時    (●)不計時 ( )10分 ( )15分 ( )20分   ← 新增一列     │
│ [產生本輪對戰]                                             │
└───────────────────────────────────────────────────────────┘

=== State 2: 已產生回合、選了 10 分鐘但尚未開始計時 ===

┌─ /matchmaker ─────────────────────────────────────────────┐
│ 計時    ( )不計時 (●)10分 ( )15分 ( )20分                 │
│ [開始計時]                          ← 只在此狀態顯示       │
│ [重設 / 再排]                                              │
├───────────────────────────────────────────────────────────┤
│ 第 1 場地              第 1 局到 11                        │
└───────────────────────────────────────────────────────────┘
```

按下「開始計時」後進入倒數，倒數期間仍可看到比分輸入等既有操作。

```
                    │  [開始計時]
                    ▼

=== State 3: 倒數中 ===

┌─ /matchmaker ─────────────────────────────────────────────┐
│ 計時    ( )不計時 (●)10分 ( )15分 ( )20分  ░░░░ ← disabled │
│         本輪已開始計分，計時設定不可更改    ← 鎖定原因，   │
│                                                僅在已開始   │
│                                                計分後出現   │
├───────────────────────────────────────────────────────────┤
│              ┌───────────────────┐                        │
│              │      09:56        │  ← RoundTimerBanner，   │
│              └───────────────────┘     每秒遞減，靜態文字  │
│ 第 1 場地              第 1 局到 11                        │
└───────────────────────────────────────────────────────────┘
```

時間到時切換為大字提示，並觸發一次提示音；場次狀態完全不受影響。

```
                    │  倒數至 00:00
                    ▼

=== State 4: 時間到 ===

┌─ /matchmaker ─────────────────────────────────────────────┐
│              ┌───────────────────┐                        │
│              │      時間到       │  ← 大字、role="alert"、 │
│              │  時間到：領先者勝，  │     靜態（不閃爍）、    │
│              │  平手請再打一球     │     同時播放一次提示音  │
│              └───────────────────┘                        │
│ 第 1 場地              第 1 局到 11    ← 場次狀態不變，    │
│                                          仍可手動送出比分   │
└───────────────────────────────────────────────────────────┘
```

計分板一側，目標分數已開始計分時的鎖定狀態沿用既有樣式，計時的鎖定樣式與其對稱。

```
=== State 5: 本輪已開始計分（目標分數與計時同時鎖定）===

│ 目標分數 (●)11░ ( )15░ ( )21░   本輪已開始計分，目標分數   │
│                                  不可更改                  │
│ 計時    ( )不計時░ (●)10分░ ( )15分░ ( )20分░              │
│         本輪已開始計分，計時設定不可更改                   │
```

不計時模式下（預設值），對戰頁完全不出現任何計時相關的額外元素。

```
=== State 6: 不計時（預設）時畫面不出現任何計時元素 ===

┌─ /matchmaker ─────────────────────────────────────────────┐
│ 計時    (●)不計時 ( )10分 ( )15分 ( )20分                 │
│                                       ← 無「開始計時」按鈕 │
│ 第 1 場地              第 1 局到 11  ← 無倒數 / 時間到區塊 │
└───────────────────────────────────────────────────────────┘
```

## Architecture

重點是**唯一的計時進度來源是 `Round.timer`**，`useRoundTimer` 是唯一碰
`setInterval`／`new Date()` 的位置，提示音是唯一碰 `AudioContext` 的位置。

```
   app/matchmaker/page.tsx           ← 既有, 本 change 只追加掛載與 prop 傳遞
     │  取得 round（含 round.timer）
     │
     ├──renders──► RoundControls.tsx          (integration)
     │               │  計時設定 radiogroup + 開始計時按鈕
     │               ├─► setTimerDuration ──► lib/matchmaker/round.ts (純函式)
     │               ├─► startTimer       ──► lib/matchmaker/round.ts (純函式)
     │               └─► isTargetScoreLocked（重用，來自 scoreboard-binding.ts）
     │
     └──renders──► RoundTimerBanner.tsx        (integration)
                     │  props: { timer: round.timer }
                     │
                     ├─► hooks/useRoundTimer.ts   (唯一 setInterval / new Date())
                     │     └─► lib/matchmaker/round-timer.ts
                     │           remainingSeconds / isExpired / formatRemaining
                     │           （純函式，unit test，零 I/O）
                     │
                     └─► lib/matchmaker/round-timer-sound.ts （例外層，唯一 AudioContext）
                           playTimerExpiredChime()

   hooks/useRoundStore.ts             ← 既有, 新增 setTimerDuration／startTimer 兩個動作
     │  比照既有 setTargetScore 的「呼叫純函式 → 判 ok → dispatch」形態
     ▼
   持久化至 matchmaker:round:v1（既有 write effect，欄位隨 Round 物件一併寫入）

  外部相依（皆唯讀取用，本 change 不修改）:
    round-lifecycle 既有 : round-types.ts 的 schema 模式、round.ts 的既有函式風格
    match-stage 既有     : RoundControls.tsx 的目標分數選擇器（結構對照範本）
  npm 相依: 零新增（Web Audio 為瀏覽器內建 API）
```

## Sequence Diagram

倒數與時間到是本 change 唯一的非同步多步流程；重點是**只播放一次提示音**與**時間到不
觸碰任何場次狀態**。

```
使用者     RoundControls    useRoundStore   round.ts    RoundTimerBanner  useRoundTimer  瀏覽器
  │             │                 │            │              │               │           │
  │ [開始計時]  │                 │            │              │               │           │
  ├────────────►│                 │            │              │               │           │
  │             │ startTimer()    │            │              │               │           │
  │             ├────────────────►│            │              │               │           │
  │             │                 │ startTimer(round, now)     │               │           │
  │             │                 ├───────────►│              │               │           │
  │             │                 │◄───────────┤ { ok, round: │               │           │
  │             │                 │             │   timer 已寫入 startedAt }   │           │
  │             │                 │ dispatch    │              │               │           │
  │             │                 ├──┐          │              │               │           │
  │             │                 │◄─┘ 持久化到 matchmaker:round:v1            │           │
  │             │                 │            │              │  (round.timer prop 變動)   │
  │             │                 │            │              ├──────────────►│           │
  │             │                 │            │              │               │ setInterval│
  │             │                 │            │              │               │ tick/1s   │
  │             │                 │            │              │◄──────────────┤ remainingSeconds
  │             │                 │            │              │ 顯示 mm:ss    │ (每秒遞減) │
  │             │                 │            │              │               │           │
  │             │                 │            │              │◄──────────────┤ isExpired  │
  │             │                 │            │              │   = true      │ = true 那刻│
  │             │                 │            │              │ 切換為「時間到」大字        │
  │             │                 │            │              │ role="alert"  │           │
  │             │                 │            │              ├──────────────────────────►│
  │             │                 │            │              │ playTimerExpiredChime()   │
  │             │                 │            │              │ (round-timer-sound.ts)    │
  │             │                 │            │              │               │  提示音    │
  │             │                 │            │              │ hasPlayedRef=true          │
  │             │                 │            │              │ (之後重新渲染 不再重播)     │
  │  聽到 / 看到「時間到」，各場地卡片狀態完全不受影響，仍可手動送出比分       │           │
```

## Task Tree

tasks.md 的分群與相依。§2～§7 是純函式與 hook 群，彼此依 § 順序推進；§8 是 hooks 清單守衛
的立即修復；§9～§11 是接線與元件群；§12 才碰真實頁面與 E2E。

```
§1 前置確認 (Step 0 的延伸: 確認 M13 已合併、既有簽章與命名慣例)
 │
 ├─ §2 round-types.ts       (schema：durationMinutes 值域 + 向後相容, 2 it)
 ├─ §3 round-settings.ts    (每輪設定預設值, 1 it)
 └─ §4 round.ts             (createRound 擴充 + setTimerDuration + startTimer, 6 it)
      │
      ├─ §5 round-timer.ts       (倒數純函式, 3 it)          depends §2
      └─ §6 round-timer-sound.ts (Web Audio, 例外層無 RED)
           │
           └─ §7 useRoundTimer.ts hook (每秒 tick, 1 it)     depends §5
                │
                └─ §8 pickleball-guide-page hooks 清單同步（守衛測試轉紅即修）depends §7
                     │
      §9 useRoundStore 接線 (setTimerDuration／startTimer, 1 it)  depends §4
           │
           └─ §10 RoundControls.tsx (計時設定 + 開始計時按鈕, 5 it)
                    depends §2 §3 §4 §9
                 │
                 └─ §11 RoundTimerBanner.tsx (倒數 + 時間到 + 提示音, 3 it)
                          depends §7 §6
                       │
                       └─ §12 page.tsx 掛載 + E2E (2 it)  depends §10 §11
                                │
                                └─ §13 收尾驗證
                                      (lint / tsc / unit / e2e /
                                       spec 錨點核對 / validate)
```

## Cross-Cutting Impact

| 檔案／模組 | 動作 | 影響面 |
|---|---|---|
| `lib/matchmaker/round-types.ts` | 修改 | `Round.timer` schema、`ROUND_TIMER_DURATION_OPTIONS`；向後相容既有 `matchmaker:round:v1` |
| `lib/matchmaker/round-settings.ts` | 修改 | `RoundSettings.timerDurationMinutes`，預設 `null` |
| `lib/matchmaker/round.ts` | 修改 | `CreateRoundInput` 新欄位、`createRound()` 寫入 `timer`、新增 `setTimerDuration`／`startTimer` |
| `lib/matchmaker/round-timer.ts` + test | 新增 | 倒數與到期的純函式真相來源，`useRoundTimer` 與（間接）`RoundTimerBanner` 共用 |
| `lib/matchmaker/round-timer-sound.ts` | 新增 | **例外層**：`AudioContext` 唯一呼叫點，無單元測試，E2E／元件注入驗收 |
| `lib/matchmaker/labels.ts` | 修改 | 新增計時相關繁體中文文案常數 |
| `hooks/useRoundTimer.ts` + test | 新增 | 本 change 唯一 `setInterval`／`new Date()` 呼叫點 |
| `hooks/useRoundStore.ts` + test | 修改 | 新增 `setTimerDuration`／`startTimer` 兩個動作，比照既有 `setTargetScore` 接線形態 |
| `components/matchmaker/RoundControls.tsx` + test | 修改 | 新增計時設定 radiogroup 與「開始計時」按鈕；鎖定重用 `isTargetScoreLocked` |
| `components/matchmaker/RoundTimerBanner.tsx` + test | 新增 | 倒數顯示、時間到大字＋`role="alert"`＋提示音委派 |
| `app/matchmaker/page.tsx` | 修改 | 掛入 `RoundTimerBanner`，把 `setTimerDuration`／`startTimer` 傳給 `RoundControls` |
| `tests/e2e/specs/round-timer.spec.ts` | 新增 | 五個 browser project 皆跑；含 `page.clock` 快轉與 `AudioContext` stub |
| `openspec/specs/pickleball-guide-page/spec.md` | 修改 | hooks 歸屬清單新增 `useRoundTimer` → `round-lifecycle` |
| `package.json` | **不動** | 零新增相依，收尾驗證機械確認 |
| `app/globals.css` | **不動** | 時間到為靜態文字，不新增任何 CSS 規則（design Decision 7） |
| `components/matchmaker/MatchStage.tsx`／`CourtCard.tsx`／`RestingPanel.tsx` | **不動** | 計時器獨立掛載於 `page.tsx`，不進場地卡片（design Decision 8） |
| `lib/matchmaker/scoreboard-binding.ts` | **不動（唯讀重用）** | 只讀取既有 `isTargetScoreLocked`，不新增或修改其程式碼 |
| `hono-pickball/**` | **不動** | matchmaker 為 LocalStorage-only 純前端功能 |
