# Overview: matchmaker-scoreboard-team-labels

## Scope

由對戰頁的「進入計分板」入口進入計分板時，兩隊面板不再只顯示「我方」／「對方」，而是同時
顯示該隊球員的真實姓名與雙色漸層色塊（單打各 1 人、雙打各 2 人），讓主持人在多場地並行時
一眼看出自己正在計哪幾位球員的分。獨立開啟 `/scoreboard`（不帶 `match` 參數）不受影響。

**Size**: large — 影響 2 個 capability（`scoreboard`、`match-stage`，符合 medium 的
「2-3 capabilities」區間），但 tasks.md 實際落地為 27 項，超過規模表「tasks >20」的 large
判定門檻；依規模表「取最大命中」，task 數量的訊號蓋過 capability 數量的訊號，判為 large。
（本文件原預估為 medium、tasks 落在 9～20 區間；實際落地後 task 數偏高的主因是 §1 前置確認
的 8 項讀取記錄與既有 `scoreboard-binding.test.ts` 六個既有呼叫點需逐一核對更新，而非功能
本身複雜。因規模改判為 large，下方依規模表補上 Task Tree 與 Cross-Cutting Impact 兩個
large 起必含的區塊。）

**Frontend involved**: yes — 計分板兩隊面板的名稱行新增可見內容，且需重新確認多 viewport
零捲動版面。

**DB schema touched**: no — 本專案為 LocalStorage-only 純前端功能，無資料庫；`ScoreboardStateSchema`
的欄位新增沿用既有的 zod 向後相容策略（`.nullable().default(null)`），細節見 design.md 的
Migration Plan，不另立 Data Model 區塊。

**Data migration**: no — 不搬移、不轉換任何既有資料，新欄位以預設值補齊即可。

**Cross-component flow**: no — 「建立 seed → 導向 → hydrate → 渲染」全程同步、單向，不含
非同步任務、webhook 或多服務協作；下方以 Architecture 區塊呈現模組間的資料流向即足夠，不需要
另立時序圖。

---

## What Changes

- 對戰頁「進入計分板」入口建立 seed 時，一併把兩隊球員的姓名與雙色漸層色塊寫入新欄位
  `teamPlayers`（前景文字色於此端算好存入）。
- 計分板 `ScoreboardStateSchema` 新增 `teamPlayers`（`.nullable().default(null)`），並隨
  `mode`／`firstServer`／`targetScore`／`matchId`／`courtNumber` 一併於 UNDO／RESET／HYDRATE
  時保留。
- `TeamPanel.tsx` 的既有名稱行在 `teamPlayers` 非 `null` 時渲染球員姓名色塊；為 `null` 時
  （獨立計分板、或本次變更前的舊分槽）維持既有的「我方」／「對方」純文字，零行為變更。
- 名單中找不到球員（該員已被移除）時，以替代文字「已離開名單」與中性灰色呈現，不拋錯、不使該
  隊少一筆。

Before / after 對照（純文字、無 UI 細節）：

```
=== Before ===

  計分板面板標籤   : 我方 / 對方（固定文字，任何場次皆同）
  多場地辨識手段   : 僅場地標示（「場地 3」）+ 目標分數
  seed 內容        : matchId / targetScore / mode / firstServer / courtNumber

=== After ===

  計分板面板標籤   : 我方 王小明 / 對方 陳小華（球員姓名 + 雙色漸層色塊）
  多場地辨識手段   : 場地標示 + 目標分數 + 球員姓名色塊
  seed 內容        : matchId / targetScore / mode / firstServer / courtNumber
                      / teamPlayers（新增）
  獨立計分板       : 不變 -- 仍是我方 / 對方純文字
```

---

## UI Mockups

以下依使用順序列出四個 state。`←` 之後為註解，不是畫面文字。

```
=== State 1: 獨立 /scoreboard（未帶 match 參數，行為零變更） ===

┌─ /scoreboard ─────────────────────────────────────────────┐
│ [雙打 ▼] [先發：我方 ▼] ( )11 (●)15 ( )21          [進入專注模式] │
├───────────────────────────────────────────────────────────┤
│         我方 · 15 分制         │        對方 · 15 分制      │
│              7                 │             5              │
│         [贏這球 +]             │         [贏這球 +]         │
└───────────────────────────────────────────────────────────┘
                                                    ← 與本次變更前逐字相同


=== State 2: 由對戰頁進入，綁定場次（單打） ===

┌─ /scoreboard?match=abc ───────────────────────────────────┐
│ 場地 2        [先發：我方 ▼]     本輪 15 分制   [返回對戰] │
├───────────────────────────────────────────────────────────┤
│    我方 [王小明] · 15 分制     │   對方 [陳小華] · 15 分制  │
│              7                 │             5              │
│         [贏這球 +]             │         [贏這球 +]         │
└───────────────────────────────────────────────────────────┘
                              ↑
                    [王小明] 為雙色漸層色塊 + 姓名文字，
                    背景取該員 colorFrom→colorTo，
                    文字色為 seed 已算好的 foreground


=== State 3: 綁定場次（雙打，兩隊各 2 位球員） ===

┌─ /scoreboard?match=xyz ───────────────────────────────────┐
│ 場地 1                          本輪 11 分制   [返回對戰] │
├───────────────────────────────────────────────────────────┤
│ 我方 [王小明][李小華] · 11 分制│對方[陳小華][林阿吉]·11分制│
│              4                 │             2              │
│         [贏這球 +]             │         [贏這球 +]         │
└───────────────────────────────────────────────────────────┘
                              ← 雙打每隊 2 個色塊，寬度仍在
                                390px 最小支援寬度內


=== State 4: 該隊某球員已被移除名單 ===

┌─ /scoreboard?match=def ───────────────────────────────────┐
│ 場地 3                          本輪 21 分制   [返回對戰] │
├───────────────────────────────────────────────────────────┤
│  我方 [王小明][已離開名單]     │      對方 [陳小華] · ...   │
│              0                 │             0              │
└───────────────────────────────────────────────────────────┘
                    ↑
          灰色中性色塊 + 「已離開名單」文字，
          不跳過該格、不拋錯，其餘球員照常顯示
```

---

## Architecture

重點是**單向相依維持不變**：`teamPlayers` 的內容（含前景色）只在 matchmaker 側算好，
`scoreboard` 側只讀不算，兩個 capability 之間沒有任何反向 import。

```
  match-stage capability                    scoreboard capability
  (nextjs-pickball/lib/matchmaker/)          (nextjs-pickball/lib/scoreboard/)

  CourtCard.tsx
    │ round, match, players
    ▼
  buildMatchSlotSeed(round, match, players)
    │  uses ──► colors.ts 的 pickTextColor()
    │           （唯一計算前景色之處）
    ▼
  ScoreboardState { ..., teamPlayers }  ──writeMatchSlot──►  scoreboard:matches:v1
                                                                    │
                                                                    │ readScoreboard(matchId)
                                                                    ▼
                                                          useScoreboardStore()
                                                                    │ HYDRATE
                                                                    ▼
                                                          reducer.ts
                                                          （createInitialState /
                                                           settingsOf 帶入 teamPlayers，
                                                           UNDO / RESET / HYDRATE 皆保留）
                                                                    │
                                                                    ▼
                                                          TeamPanel.tsx
                                                          （teamPlayers 非 null 時渲染
                                                           姓名色塊；為 null 時維持
                                                           我方／對方純文字）

  單向相依：lib/scoreboard/ 不 import lib/matchmaker/（沿用既有 design Decision，
  本 change 不新增任何跨 capability import，只新增一個純資料欄位）
```

---

## Task Tree

tasks.md 的分群與相依（5 個群組、27 項 task）。§2～§4 為序列相依：先讓 schema／reducer 能
承載 `teamPlayers`，再讓 seed 建立端算出它，最後才讓渲染端讀取它。

```
§1 前置確認（不寫任何產品程式碼：核對 M11 是否已合併、記錄四份既有檔案的實際簽章）
 │
 └─ §2 計分板 schema／reducer 擴充（teamPlayers 欄位；2 個新 unit it + 1 個 match-slots it）
      │
      └─ §3 計分板 seed 的球員顯示資訊（scoreboard-binding.ts 與 CourtCard.tsx 接線）
           depends §2；3 個新 unit it + 既有 6 個呼叫點補第三參數
           │
           └─ §4 計分板面板渲染與 E2E 驗收（TeamPanel.tsx 既有名稱行 + 2 個新 e2e test）
                depends §2 §3
                │
                └─ §5 收尾驗證
                      （lint / tsc / unit / 全套 e2e --workers=1 /
                       validate --strict / python 計數法 / lock 零變動）
```

## Cross-Cutting Impact

| 檔案／模組 | 動作 | 影響面 |
|---|---|---|
| `lib/scoreboard/types.ts` | 修改 | 新增 `PlayerBadgeSchema`／`TeamPlayersSchema`，`ScoreboardStateSchema` 與 `MatchSettings` 新增 `teamPlayers` 欄位 |
| `lib/scoreboard/reducer.ts` | 修改 | `createInitialState`／`settingsOf` 帶入 `teamPlayers`，使其在 UNDO／RESET／HYDRATE 後保留 |
| `lib/matchmaker/scoreboard-binding.ts` | 修改 | `buildMatchSlotSeed` 新增必填 `players` 第三參數，新增私有的球員解析與替代文字邏輯 |
| `components/matchmaker/CourtCard.tsx` | 修改 | `handleEnterScoreboard` 呼叫處補上既有 `players` prop 作第三參數，色塊本身姓名／顏色呈現邏輯零改動 |
| `components/scoreboard/TeamPanel.tsx` | 修改 | 既有名稱行在 `teamPlayers` 非 `null` 時渲染球員姓名色塊，`null` 時渲染路徑逐字不變 |
| `lib/scoreboard/reducer.test.ts`、`match-slots.test.ts` | 修改 | 各補一個涵蓋 `teamPlayers` 保留／向後相容的 it |
| `lib/matchmaker/scoreboard-binding.test.ts` | 修改 | 既有六個 `buildMatchSlotSeed(round, match)` 呼叫點補第三參數（斷言不變），新增三個 it |
| `tests/e2e/specs/scoreboard-binding.spec.ts` | 修改 | 新增兩個 test（面板顯示球員姓名、綁定模式含姓名色塊時零捲動） |
| `nextjs-pickball/CLAUDE.md` | 修改 | 視既有描述是否已涵蓋，補記計分板顯示球員姓名與隊色 |
| `package.json`／`pnpm-lock.yaml` | **不動** | 零新增相依，收尾驗證機械確認 `git diff` 為空 |
| `hooks/` | **不動** | 不新增任何 hook |
| `lib/matchmaker/export-scene.ts` | **不動（唯讀參考）** | 替代文字與中性色的措辭、色碼沿用其既有慣例，但不 import（design Decision 3） |
| `hono-pickball/**` | **不動** | matchmaker／scoreboard 皆為 LocalStorage-only 純前端功能 |
