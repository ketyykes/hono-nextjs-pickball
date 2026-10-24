# Overview: matchmaker-round-score-backend（B7）

## Scope

登入後，對戰分配機的目前回合（含計時、目標分數、臨時換人）與各場地的計分板進度改存在雲端，換裝置可續打；
送出比分改由後端一次寫完「評分＋回合＋歷史＋清除該場計分板」，任何一個版本對不上就整批不寫。訪客完全不變。

**Size**: large — 影響 9 個 capability，tasks 46 項，跨前端／後端／核心套件，並定案 batch 內版本保護的通用寫法。
**Frontend involved**: yes — 對戰頁同步提示與載入失敗畫面；場地卡進入計分板前先建立雲端分槽。
**DB schema touched**: yes — 新增四張表與 migration `0003`。
**Data migration**: no — 本機回合不搬移（B9 匯入），雲端從無回合開始。
**Cross-component flow**: yes — 命令佇列（單一在途、重新套用）、送出比分的多表 batch、名單 port 回寫。

---

## What Changes

- 後端：`/api/matchmaker/round`（GET／PUT）、`/api/matchmaker/slots`（GET 清單、GET／PUT 單筆）、`/round/matches/:id/score`（POST）、`/reset` 擴充
- D1：`matchmaker_round`、`matchmaker_match_slots`、`matchmaker_history`、`sync_batch_guards`
- 核心套件：`api/round.ts`；`USER_DATA_TABLES` 加四張表
- 前端：`useRemoteRoundStore`（命令佇列）、`useRemoteMatchSlotStore`、`round-api.ts`、`round-command-queue.ts`；
  `useRoundStore`／`useScoreboardStore` 選擇器擴充；名單 port `applyRemotePlayers`／`reloadRemotePlayers`
- 頁面：對戰頁（雲端分槽、回填、鎖定）、`CourtCard`（先建立分槽再導向）、資料頁 JSON 匯出的回合來源

```
=== Before (B6 後，登入時) ===
名單            --> D1 matchmaker_players
回合 / 歷史     --> localStorage（與訪客共用 key）
場次分槽        --> localStorage scoreboard:matches:v1
送出比分        --> 前端算 -> 回合/歷史寫本機 + 四人各 PUT 一次

=== After (B7，登入時) ===
名單            --> D1 matchmaker_players
回合            --> D1 matchmaker_round
場次分槽        --> D1 matchmaker_match_slots
歷史（寫入）    --> D1 matchmaker_history（讀取仍本機，B8）
送出比分        --> POST -> 後端算 -> 單一 batch 寫四表
```

## UI Mockups

```
=== State 1: 對戰頁，雲端載入中 ===
┌──────────────────────────────────────────────┐
│ 對戰分配機   [對戰] [參賽者] [統計] [資料]    │
├──────────────────────────────────────────────┤
│ ⟳ 正在載入雲端資料…                          │ ← data-sync-status=loading
└──────────────────────────────────────────────┘
        │ GET round + GET slots 皆成功
        ▼
=== State 2: 已同步 ===
┌──────────────────────────────────────────────┐
│ 第 3 輪  目標 [11 ▼]░░░░ 本輪已開始計分…     │ ← 鎖定依雲端分槽判定
│ ┌ 場地 1 ───────────┐ ┌ 場地 2 ───────────┐  │
│ │ 王小明 / 李大華    │ │ 陳一 / 林二        │  │
│ │ vs 張三 / 吳四     │ │ vs 黃五 / 周六     │  │
│ │ [__] : [__] [送出] │ │ 已完成 11 : 7      │  │
│ │ [開啟計分板]       │ │                    │  │
│ └────────────────────┘ └────────────────────┘  │
└──────────────────────────────────────────────┘
        │ 按 [開啟計分板]
        ▼
=== State 3: 建立雲端分槽中（PUT v0）===
  成功或已存在 → 導向 /scoreboard?match=<id>
  其他失敗     → 卡片內顯示「無法建立計分板，請稍後再試」，不導向
        │ 另一裝置已送出同一場
        ▼
=== State 4: 衝突 ===
┌──────────────────────────────────────────────┐
│ ⚠ 資料已在其他裝置更新，已重新載入最新資料   │ ← data-sync-status=conflict
│ （場地 1 顯示另一裝置送出的比分）            │
└──────────────────────────────────────────────┘

=== State 5: 雲端載入失敗 ===
┌──────────────────────────────────────────────┐
│ ✕ 無法載入雲端資料，請重新整理頁面           │ ← 不顯示產生對戰按鈕
└──────────────────────────────────────────────┘
```

## Data Model

```
=== Before ===
user ─┬─< scoreboard_current (user_id PK)
      └─< matchmaker_players (user_id, id) PK

=== After ===
user ─┬─< scoreboard_current     (user_id PK)
      ├─< matchmaker_players     (user_id, id) PK
      ├─< matchmaker_round       (user_id PK) data=Round
      ├─< matchmaker_match_slots (user_id, match_id) PK
      │                          data=ScoreboardState
      ├─< matchmaker_history     (user_id, match_id) PK
      │                          played_at ms, data=Entry
      └─< sync_batch_guards      (user_id PK) 平時恆為空
全部：version NOT NULL、updated_at、FK user.id cascade
```

## Architecture

```
 前端 (Next.js)                            後端 (Hono on Workers)
┌───────────────────────────┐             ┌────────────────────────────┐
│ app/matchmaker/page       │             │ routes/matchmaker.ts       │
│  ├ useRosterStore ──port──┐│  /api/...   │  ├ round-repository        │
│  │  applyRemotePlayers    ││ ──────────> │  ├ slots-repository        │
│  └ useRoundStore (選擇器) ││             │  ├ score-repository ─┐     │
│     └ useRemoteRoundStore ││             │  │  core submitScore │     │
│        └ round-command-   ││             │  │  batch-guard      │     │
│          queue ───────────┘│             │  └ players-repository│     │
│ CourtCard -> PUT slot v0   │             │         (reset)      ▼     │
│ /scoreboard?match=         │             │       D1 batch()           │
│  └ useRemoteMatchSlotStore │             └────────────────────────────┘
└───────────────────────────┘
          共用：@pickball/core（submitScore、schemas、api/round）
```

## Sequence Diagram

```
使用者   對戰頁/佇列        API(score)            D1
  │ 送出 11:7 │                │                   │
  │──────────>│ 預先驗證(core) │                   │
  │<─ ok ─────│ 樂觀顯示完成   │                   │
  │           │ POST score(v3) │                   │
  │           │───────────────>│ 讀 round+players  │
  │           │                │──────────────────>│
  │           │                │ core submitScore  │
  │           │                │ batch:            │
  │           │                │  1 guard(v3,pv*)  │
  │           │                │  2 insert history │
  │           │                │  3 update round   │
  │           │                │  4 update players │
  │           │                │  5 delete slot    │
  │           │                │  6 delete guard   │
  │           │                │──────────────────>│
  │           │                │   (guard 失敗則    │
  │           │                │    整批回滾 -> 409)│
  │           │<─ 200 round v4,│                   │
  │           │   players,entry│                   │
  │           │ applyRemotePlayers(不發請求)        │
  │           │ 下一個命令以 v4 重新套用後 PUT      │
```

## Task Tree

```
§1 對齊 main＋Context7＋實測 (4)
 └─ §2 核心 api/round.ts (2)
     └─ §3 資料表＋整批守衛 (4)
         └─ §4 回合與分槽 API (3)
             └─ §5 送出比分與重置 (3)
                 └─ §6 API 包裝＋命令佇列＋名單 port (6)
                     └─ §7 useRemoteRoundStore＋選擇器 (5)
                         └─ §8 分槽 hook＋計分板選擇器＋歸屬清單 (6)
                             └─ §9 資料頁 (2)
                                 └─ §10 E2E＋頁面接線 (3)
                                     └─ §11 文件＋總驗收 (8)
```

## Cross-Cutting Impact

- **權威位置**：評分、完成狀態、歷史在雲端模式只由後端寫入；回合 PUT 不得改變完成狀態（400）。
- **既有測試**：允許動的只有四個 it（B5 一個刪除、B6 三個改寫）；本機 hook 本體一行不改。
- **B8／B9 依賴**：`matchmaker_history.played_at`、整批守衛、分槽不變式、`resetLocalMatchProgress()` 的去留。
- **過渡期**：登入時歷史頁與統計頁仍讀本機（統計頁在雲端模式為空），B8 消除；本批不 push。
- **相依**：無新增第三方套件。
