# Test Plan: matchmaker-round-score-backend

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier（同 B5／B6）：`unit`（核心套件 node；前端 `lib/**` happy-dom）、`hook`（`renderHook`＋mock `fetch` 與 `@/hooks/useSession`）、
> `integration`（`hono-pickball/test/**`，workerd＋D1）、`e2e`（`tests/e2e/user-data/**` 只在 `user-data` project；需 `.dev.vars`）。
> `hook` 為 `unit` 的細分（同為 Vitest），沿用 B5／B6 的標示以便派工。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **後端 API 授權覆蓋表**（每個端點三類測試；同一 it 以迴圈涵蓋多個端點時，迴圈內每個端點都 MUST 各自斷言）：
>
> | 端點 | 未登入 401 | 他人資料被拒 | auth 停用 404 |
> |------|-----------|--------------|---------------|
> | `GET /api/matchmaker/round` | 未登入呼叫回合、分槽與送出比分端點皆回 401 | B 看不到也改不到 A 的回合與分槽 | auth 停用且無 DB binding 時回合、分槽與送出比分端點皆回 404 |
> | `PUT /api/matchmaker/round` | 同上 | 同上 | 同上 |
> | `GET /api/matchmaker/slots` | 同上 | 同上 | 同上 |
> | `GET /api/matchmaker/slots/:matchId` | 同上 | 同上 | 同上 |
> | `PUT /api/matchmaker/slots/:matchId` | 同上 | 同上 | 同上 |
> | `POST /api/matchmaker/round/matches/:matchId/score` | 同上 | B 對 A 的場次送出比分回 409 且 A 的資料不變 | 同上 |
> | `POST /api/matchmaker/reset`（batch 擴充） | （B6 既有）未登入呼叫所有 /api/matchmaker 端點皆回 401 | 重置在同一 batch 內刪除本人的名單、回合、分槽與歷史（含另一位使用者不變的斷言） | （B6 既有）auth 停用且無 DB binding 時所有 /api/matchmaker 端點皆回 404 |

## user-data-sync

### Requirement: 多筆使用者資料的逐筆版本化契約（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）PlayerImportRequestSchema 要求至少一位且 id 不重複；PlayerListResponseSchema 以 PlayerSchema 驗證每一筆 | 共用的清單與匯入 schema | 原樣通過 | regression guard | unit |
| MatchSlotListResponseSchema 要求每筆分槽的 matchId 為字串 | 分槽清單 schema 要求 matchId 非 null | `matchId: null` 失敗；字串通過 | 前後端共用契約先定；模組不存在 → 紅 | unit |

### Requirement: 後端多表寫入以單一 batch 與整批守衛完成

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| batch 中影響 0 列的 UPDATE 不會使整批回滾 | 同名 | batch 不拋出、round 列已寫入 | 固定平台行為（B5 OQ1）；**表不存在時為紅（真紅），建表後即綠——行為本身是 D1 的，tasks 點名 characterization** | integration |
| 整批守衛的條件不成立時整批回滾且被分類為版本衝突 | 同名 | 條件假：拋出、分類為衝突、兩表皆無列；條件真：一列、守衛表空 | 本 change 核心決策的實證；`batch-guard.ts` 不存在 → 紅 | integration |
| 非守衛的資料庫錯誤不被分類為版本衝突 | 同名 | FK 錯誤 → 非衝突 | 防止 500 被吞成 409 | integration |

## backend-database

### Requirement: 對戰分配機回合、分槽、歷史與整批守衛資料表由 migration 建立

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| matchmaker_round、matchmaker_match_slots、matchmaker_history 與 sync_batch_guards 可由 migration 建立並寫入讀回 | 四張新表可寫入並讀回 | 各欄位讀回相同 | 表不存在 → 紅 | integration |
| 回合每位使用者一筆，分槽與歷史的 match_id 只在同一使用者內唯一 | 同名 | A 的重複插入失敗、B 成功 | 主鍵設計 | integration |
| sync_batch_guards 的 version 不可為 NULL | 守衛表的 version 不可為 NULL | NOT NULL 失敗 | 守衛機制的前提 | integration |
| 刪除使用者時其回合、分槽與歷史一併刪除 | 同名 | 三表筆數 0 | cascade | integration |
| （既有，B5）USER_DATA_TABLES 恰為 auth 以外的所有資料表；每張使用者資料表皆有 user_id… | B5 Scenario | 加表後先紅（清單未更新）→ 更新清單後綠 | 守衛本身就是 RED（tasks 3.1 點名） | integration |

## round-lifecycle

### Requirement: 比分送出的完成流程（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）`round.test.ts` 八個 it | 前八個 Scenario | 原樣通過 | regression guard（純函式未改） | unit |
| 送出比分在單一 batch 內更新評分、回合與歷史並刪除該場分槽 | 雲端送出比分在單一 batch 內… | 200；回合 v4、四人 rating 等於核心結果、gamesPlayed +1、version +1；歷史一筆；分槽刪除 | golden path；端點不存在 → 紅 | integration |
| 計時回合的平局在雲端送出後 winner 為 draw 且評分以 S 等於 0.5 計算 | 雲端計時回合平局完整保留 draw 語意 | 回合與歷史 `winner: "draw"`；rating 等於核心 `updateRatings("draw")` | M15 不可回退 | integration |
| roundVersion 不符時回 409 且名單、回合、歷史與分槽皆不變 | 回合版本不符時整批不寫入 | 409；四表逐列相同 | 端點層的版本保護 | integration |
| 計算後任一參與球員版本變動時整批守衛使 batch 不寫入任何資料 | 參與球員的版本在計算後被改動… | repository 回衝突；四表無本次寫入 | **整批守衛的直接證據**（`afterRead` 鉤子） | integration |
| 計算後回合被刪除時整批守衛使 batch 不寫入任何資料 | 回合在計算後被刪除… | 衝突；歷史與名單無本次寫入 | 0 列 UPDATE 不回滾的情境必須由守衛擋下 | integration |

### Requirement: 回合與歷史的持久化與損壞降級（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）`useRoundStore.test.tsx`「重新掛載後還原目前回合與歷史」與 `round-storage.test.ts` 六個 it | 前七個 Scenario | 原樣通過 | regression guard（本機 hook 本體未改） | unit |
| 雲端模式下產生對戰不寫入本機回合與歷史 | 雲端模式不寫入本機回合與歷史 | 兩個 key 不存在；PUT 一次 | 選擇器不存在 → 紅 | hook |

### Requirement: 回合與送出比分的雲端 API

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| auth 停用且無 DB binding 時回合、分槽與送出比分端點皆回 404 | 同名 | 六端點逐一 404 | D4；**路由不存在時也是 404，預期先綠 → regression guard**（tasks 點名） | integration |
| 未登入呼叫回合、分槽與送出比分端點皆回 401 | 同名 | 六端點逐一 401＋body | B6 sub-app 已有 `requireSession`，未知路徑可能也回 401——**若先綠則點名標 regression guard** | integration |
| B 看不到也改不到 A 的回合與分槽 | 他人的回合與分槽不可見也不可改 | B 的 GET 皆空；兩個 PUT 409；A 不變 | 授權第二關 | integration |
| B 對 A 的場次送出比分回 409 且 A 的資料不變 | 他人無法對本人的場次送出比分 | 409；A 不變 | 授權第二關 | integration |
| 回合依單筆契約建立、更新並在版本不符時回 409 | 回合的單筆版本化讀寫 | `null/0` → v1 → v2 → 409 | 契約 golden path | integration |
| 回合 PUT 改變場次完成狀態或已完成場次內容時回 400 | 回合 PUT 不得改變場次的完成狀態 | 三種輸入皆 400；回合不變 | 後端權威的延伸 | integration |
| 回合 PUT 刪除不屬於新回合的分槽且衝突時分槽仍與雲端回合一致 | 同名 | m1 留、m2 刪；409 時一致 | 不變式由伺服器維護 | integration |
| 分槽只能為目前回合中未完成的場次建立 | 同名 | m1 200 v1；m2、m9 409 | 建立前置條件 | integration |
| 分槽依版本更新並可單筆或整份讀取 | 分槽的逐筆版本化更新與讀取 | v2、409、兩個 GET 一致、排序 | 契約 | integration |
| 分槽的 matchId 與 path 不一致或資料不合法時回 400 | 不合法的分槽寫入 | 三者 400 | 錯誤路徑 | integration |
| 送出比分的格式錯誤回 400、場次不存在或已完成回 409，且皆不寫入 | 比分格式錯誤回 400、場次狀態不符回 409 | 4×400、2×409；無寫入 | 失敗碼對應 | integration |
| 同一場次重複送出時回 409 且歷史只有一筆 | 同一場次重複送出只寫入一筆歷史 | 409；歷史 1 筆；gamesPlayed 只加一次 | 雙重防線 | integration |
| 重置在同一 batch 內刪除本人的名單、回合、分槽與歷史 | 重置刪除名單、回合、分槽與歷史 | 204；四表空；他人不變 | reset 擴充 | integration |
| SubmitScoreRequestSchema 要求兩個比分字串與正整數 roundVersion | 共用的回合與送出比分 schema | 只有合法輸入通過 | 契約先定 | unit |

### Requirement: 登入時回合與場次分槽以雲端為準

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 回合 API 包裝以正確的方法、路徑與 body 呼叫 requestJson | 回合 API 包裝的請求形狀 | mock `requestJson` 逐一比對 | 路徑集中一處；模組不存在 → 紅 | unit |
| 單一在途且連續的回合變更合併為一次 PUT，送出比分不合併 | 命令佇列單一在途並合併… | 第二個請求為一次 PUT（A、B 套用後）；之後才 POST | 佇列核心語意 | unit |
| 排隊中的回合變更以最新已確認回合重新套用，不覆蓋送出比分的結果 | 命令以最新已確認回合重新套用 | T 的 PUT 資料中 m1 為 completed、version 為回應值 | Decision 6 的理由本身 | unit |
| 衝突、未授權與拒絕時清空佇列，網路失敗時依退避表重試 | 命令佇列的失敗分類 | 三者清空；failed 以假時鐘依 1/2/4/8 秒重試 | 失敗分支 | unit |
| 已登入時改用雲端回合並回傳 syncStatus 與雲端分槽 | 已登入時改用雲端回合 | round、remoteMatchSlots、synced、history 空 | 選擇器 golden path | hook |
| session 載入中或訪客時走本機回合且 syncStatus 為 local | 訪客或 session 載入中時走本機回合 | local、null、本機 key 有值、無請求 | 訪客零迴歸；本機斷言可能先綠（tasks 點名） | hook |
| generateRound 樂觀顯示並在回合 PUT 成功後才結算休息次數 | 雲端產生對戰後休息次數… | 同步成功；updatePlayer 僅在 ok 後；409 時不呼叫 | 休息次數與回合的一致性 | hook |
| submitScore 以 POST 送出並以回應更新回合與名單，不逐人 PUT 評分 | 雲端送出比分以回應更新… | POST body；applyRemotePlayers 一次；updatePlayer 0 次；無名單 PUT | B6 Risk 3 的修正 | hook |
| submitScore 預先驗證失敗時同步回傳錯誤且不送出請求 | 雲端送出比分的預先驗證失敗時不送出 | `empty-field`；無 POST | 錯誤路徑 | hook |
| 同一場次的送出在佇列中時不重複排入 | 同一場次重複送出只排入一次 | POST 一次 | 回填 effect 會重複觸發 | hook |
| 回合 PUT 或送出比分回 409 時清空佇列、重新載入並回報 conflict | 雲端回合衝突時整份重新載入 | 重新載入值、conflict、reloadRemotePlayers 一次 | 衝突處理 | hook |
| 載入失敗時回報 load-failed 且不送出，401 時呼叫 onUnauthorized | 雲端回合載入失敗與 401 | 同名 | 失敗分支 | hook |
| enabled 為 false 時不發出任何回合請求 | 停用時不發回合請求 | fetch 0 次 | 訪客零請求 | hook |
| 登入後產生的回合在重新整理與另一個 context 中由雲端還原 | 同名 | 兩 context 同組合；本機 key 不存在 | 端到端 golden path | e2e |
| 登入時經計分板完成的場次由雲端寫入評分並清除分槽 | 登入時經計分板完成的場次… | 已完成；勝方強度上升；分槽清單不含該場 | 回填 pipeline 在雲端仍為同一入口 | e2e |
| 另一裝置先送出同一場比分時顯示衝突提示並載入最新回合 | 同名 | 衝突文案；比分為 A 的 | D3 | e2e |
| 雲端回合載入失敗時對戰頁顯示錯誤提示 | 同名 | 錯誤文案；無產生按鈕 | 頁面接線 | e2e |

## match-history

### Requirement: 完成場次時寫入一筆歷史（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）`history.test.ts`、`round.test.ts` 四個 it | 前四個 Scenario | 原樣通過 | regression guard | unit |
| 雲端歷史的 data 等於回應的 historyEntry 且 played_at 為其毫秒值 | 同名 | 深度相等；`played_at` 相等；version 1 | B8 的查詢依賴 `played_at` 正確 | integration |
| 回合 PUT 不新增、不修改也不刪除任何歷史 | 雲端回合 PUT 不觸碰歷史 | 兩筆不變 | 重排不影響歷史 | integration |

## match-rating

### Requirement: 純函式契約與輸入驗證（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）`rating.test.ts` 七個 it | 前七個 Scenario | 原樣通過 | regression guard | unit |
| 雲端寫入的評分與核心 submitScore 的結果逐位相等並回報觸界 | 雲端送出比分的評分與核心純函式逐位一致 | 四個 rating 逐位相等；boundaryHits 相同 | 單一實作的證據 | integration |

## scoreboard

### Requirement: 本機模式的 localStorage 持久化（ADDED；以 REMOVED「localStorage 持久化」取代，見 design「apply §1 查證紀錄」）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）`storage.test.ts`、`match-slots.test.ts`、`scoreboard.spec.ts` 與 B5 的「雲端模式下 dispatch 不寫入 scoreboard:current:v1」 | 前十一個 Scenario | 原樣通過 | regression guard | unit |
| 已登入且帶 matchId 時改用雲端分槽且不寫入 scoreboard:matches:v1 | 登入且帶 matchId 時不寫入本機分槽 | 本機 key 不存在；PUT 一次 | 行為改變（取代 B5 的 it，tasks 授權刪除舊 it）；選擇器未分支 → 紅 | hook |

### Requirement: 登入時獨立計分板以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有，B5）`useRemoteScoreboardStore.test.tsx`、`useScoreboardStore.test.tsx`、`scoreboard-current.test.ts`、`scoreboard-sync.spec.ts` 的 it／test | B5 Scenario | 原樣通過 | regression guard | unit |
| 雲端分槽載入後為 bound 並以目前 version 儲存 | 同名 | pending → bound；PUT version 4；不立即寫回 | 模組不存在 → 紅 | hook |
| 雲端分槽不存在時 bindingStatus 為 missing 且不送出 PUT | 同名 | missing；無 PUT | 失效場次 | hook |
| 分槽 PUT 衝突後依重新載入結果轉為 missing 或 conflict | 雲端分槽衝突後已被送出時轉為 missing | 兩種分支 | 送出比分後分槽被刪的情境 | hook |
| 分槽 GET 回 401 時呼叫 onUnauthorized，enabled 為 false 時不發請求 | 雲端分槽的 401 與停用 | 同名 | 失敗分支 | hook |
| 登入時場次計分板的進度在重新整理後由雲端還原且不寫入本機 | 同名 | 2:0；本機 key 不存在 | 端到端 | e2e |

## player-roster

### Requirement: 重置名單與二次確認（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）確認重置／取消重置／重置只移除列舉的四個 key／resetRoster 失敗時名單不變並回報 rejected／登入時重置名單清空雲端名單並保留本機訪客名單 | 對應 Scenario | 原樣通過 | regression guard | unit |
| resetLocalMatchProgress 只移除本機歷史，保留名單、回合、分槽與獨立計分板 | resetLocalMatchProgress 只清除本次活動的進度（沿用主 spec 標題、內容改寫） | 只有歷史 key 被移除 | **改寫 B6 的 it**；舊實作多移除兩個 key → 紅 | unit |
| resetRoster 成功後清空名單並只清除本機歷史 | 登入時重置名單 | 只有歷史 key 被移除 | **改寫 B6 的 it**；同上 → 紅 | hook |
| resetRoster 送出前停止所有參賽者的待送與重試中變更 | 登入時重置名單前停止所有待送與重試中的變更 | reset 後推進假時鐘超過退避表全長，p1 的 PUT 不再出現 | B6 Final 轉 B7 的待辦（`reset()` 前未 `disposeAll()`）；舊實作重試的 v0 PUT 會在 reset 後送出 → 紅 | hook |
| 登入時重置名單後雲端回合與分槽一併清除 | 登入時重置名單後對戰頁沒有回合 | 無場地卡；GET 為空 | reset batch 擴充的端到端證據 | e2e |

### Requirement: 登入時名單以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有，B6）`roster-api.test.ts`、`useRosterStore.test.tsx`、`useRemoteRosterStore.test.tsx`、`roster-sync.spec.ts` 的 it／test（含「登入時送出比分後評分寫入雲端名單」） | B6 Scenario | 原樣通過 | regression guard（送出比分的 E2E 觀察結果不變，機制改由後端） | unit |
| applyRemotePlayers 以回應取代參賽者與 version 且不送出請求 | 同名 | 無請求；rating 4.2；之後 PUT version 3 | 新 port；不存在 → 紅 | hook |
| applyRemotePlayers 遇到該參賽者有待送或在途變更時視同衝突並整份重新載入 | 同名 | 不再送出；重新載入；conflict | 避免帶舊 version 覆蓋評分 | hook |
| reloadRemotePlayers 停止佇列並以雲端名單取代 | 同名 | 新名單；synced | 回合衝突時的名單同步 | hook |

## data-transfer

### Requirement: 登入時的資料工具頁（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雲端備份快照的參賽者與回合取自雲端、歷史取自本機 | 雲端備份快照的來源 | players／currentRound 雲端、history 本機；回合讀取失敗回錯誤 | **改寫 B6 的 it**；舊實作 currentRound 取本機 → 紅 | unit |
| （既有，B6）登入時 JSON 匯出的參賽者來自雲端；登入時 JSON 還原停用並顯示說明 | 對應 Scenario | 原樣通過 | regression guard | e2e |

## pickleball-guide-page

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）hooks 目錄下每支 hook 都能在規格的歸屬清單中找到 | （既有 Scenario） | 新增兩支 hook 後轉紅，同步主 spec 一句後轉綠 | B3／B5／B6 先例 | unit |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint` | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm test` | 三組皆綠；數字寫在 tasks |
| C4 | （建置） | `pnpm build` | exit 0 |
| C5 | （migration） | `db:generate` 後 `git status --porcelain hono-pickball/drizzle` 為空；`db:migrate:local` | 無新檔；套用成功 |
| C6 | （E2E） | 依 runbook「每開一個新 change 的標準流程」第 4 步的 E2E 指令執行（含 user-data project） | 既有 test 全數原樣通過；user-data 新增 6 條（`round-sync.spec.ts`）全 passed；無因缺帳密 skip |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate matchmaker-round-score-backend --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列
- [x] 每個 Scenario 至少一列（既有 Scenario 以「（既有）」列合併）
- [x] 六個新端點三類授權測試皆列於覆蓋表；reset 擴充沿用 B6 的 401／404 it
- [x] 預期先綠者（停用 404、可能的 401、選擇器的本機斷言、D1 characterization、B5 守衛）已預告
- [x] 允許改寫的既有 it 只有四個（B5 一個刪除、B6 三個改寫），皆標明原因
