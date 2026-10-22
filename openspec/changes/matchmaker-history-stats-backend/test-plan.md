# Test Plan: matchmaker-history-stats-backend

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier（同 B5～B7）：`unit`（核心套件 node；前端 `lib/**`、元件 happy-dom）、`hook`（`renderHook`＋mock `fetch` 與 `@/hooks/useSession`；屬 unit 的細分）、
> `integration`（`hono-pickball/test/**`，workerd＋D1）、`e2e`（`tests/e2e/user-data/**` 只在 `user-data` project；需 `.dev.vars`）。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **後端 API 授權覆蓋表**：
>
> | 端點 | 未登入 401 | 他人資料被拒 | auth 停用 404 |
> |------|-----------|--------------|---------------|
> | `GET /api/matchmaker/history` | 未登入呼叫歷史端點回 401 | B 看不到 A 的歷史且 total 為 0 | auth 停用且無 DB binding 時歷史端點回 404 |

## match-history

### Requirement: 歷史頁唯讀消費既有紀錄（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）瀏覽與切換區間後 matchmaker:history:v1 內容不變；紀錄於 hydration 後顯示且無 console error | 前兩個 Scenario | 原樣通過 | regression guard（本機元件未改） | e2e |
| 登入時瀏覽歷史頁只發出 GET 且不改動本機歷史 | 同名 | `/api/matchmaker/*` 皆 GET；本機 key 逐字相同 | 雲端唯讀保證 | e2e |

### Requirement: 損毀歷史紀錄的可見提示（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）有損毀歷史紀錄時顯示提示且其餘紀錄正常顯示；沒有損毀歷史紀錄時不顯示損毀提示 | 前兩個 Scenario | 原樣通過 | regression guard | e2e |
| 雲端回應的 droppedCount 大於 0 時顯示與本機相同的損毀提示 | 雲端回應的 droppedCount 大於 0 時顯示相同提示 | `role="alert"`、逐字文案；合法紀錄仍在 | 元件不存在 → 紅 | unit |

### Requirement: 登入時歷史以雲端為準

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| auth 停用且無 DB binding 時歷史端點回 404 | auth 停用時歷史端點回 404 | 404 | D4；**路由不存在時也是 404，預期先綠 → regression guard** | integration |
| 未登入呼叫歷史端點回 401 | 未登入時歷史端點回 401 | 401＋body | sub-app 已有 `requireSession`，**若先綠則點名標 regression guard** | integration |
| B 看不到 A 的歷史且 total 為 0 | 他人的歷史不可見 | 空 items、total 0 | 授權第二關 | integration |
| 預設依 played_at 由新到舊且同時間依插入順序，asc 為由舊到新 | 預設由新到舊、同時間依插入順序 | 兩種順序逐筆比對 | 與 `filterHistoryByRange` 的穩定排序一致 | integration |
| from 含、to 不含地篩選 played_at，total 仍為全部筆數 | 依 from 與 to 篩選… | 只有 200；total 3 | 半開區間 | integration |
| from、to 或 order 不合法時回 400 | 不合法的查詢參數 | 四者 400（§1 決定是否加空字串樣本） | 錯誤路徑 | integration |
| 不合 schema 的歷史列被略過並計入 droppedCount 且不被刪除 | 損毀列被略過並計數但不刪除 | 兩次 GET 一致；表仍兩列 | 雲端降級與本機的差異點 | integration |
| rangeBounds 與 rangeOfTime 對任意時間判定一致 | 同名 | 全部樣本一致 | 區間定義只有一份的證據；函式不存在 → 紅 | unit |
| 五個區間的 rangeBounds 首尾相接且兩端無界 | 五個區間的界線首尾相接 | 四個等式＋兩個 null | 互斥且完整覆蓋 | unit |
| HistoryQuerySchema 要求 from 小於 to 且 HistoryListResponseSchema 接受平局紀錄 | 共用的歷史查詢與回應 schema | 前者失敗、後兩者通過、轉數字 | 契約先定；平局不可回退 | unit |
| 歷史 API 包裝以正確的查詢字串呼叫 requestJson | 歷史 API 包裝的請求形狀 | 三個路徑 | 路徑集中一處 | unit |
| 依 range 以 rangeBounds 的界線載入雲端歷史並在 range 改變時重新載入 | 依區間載入雲端歷史 | 兩次 GET 的界線；狀態序列 | hook golden path | hook |
| range 快速切換時只採用最後一次請求的結果 | 只採用最後一次請求的結果 | items 為第二次回應 | 競態 | hook |
| GET 失敗時為 load-failed，401 時呼叫 onUnauthorized，停用時不發請求 | 雲端歷史的失敗、401 與停用 | 同名 | 失敗分支 | hook |
| total 為 0 時顯示引導型空狀態，否則顯示區間空狀態 | 雲端歷史的兩種空狀態 | 兩種 EmptyHistory | 空狀態語意不可回退 | unit |
| 登入後完成的對戰由雲端顯示在歷史頁且不寫入本機 | 登入後完成的對戰出現在歷史頁 | 今日顯示該場；本機 key 不存在 | 端到端 golden path | e2e |
| 雲端歷史載入失敗時歷史頁顯示錯誤提示 | 同名 | 錯誤文案；無篩選 | 頁面接線 | e2e |

## player-stats

### Requirement: 統計依區間篩選（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）切換區間後排行榜只反映該區間的歷史紀錄 | 既有 Scenario | 原樣通過 | regression guard | e2e |
| （既有，draw-followups）`player-stats.test.ts`「平局紀錄計為和局而非雙方各一敗場」「出場數、勝場與敗場依歷史紀錄正確加總」「出場數為零時勝率為零而非 NaN」；`PlayerStatsTable.test.tsx`「勝負和欄依序顯示勝場敗場與和局三個數字」 | `出場、勝負與勝率的計算`、`統計頁的路由與呈現`（未修改） | 原樣通過 | **平局統計不可回退的守衛**（tasks 點名執行） | unit |
| 登入時計時回合的平局在統計頁計為和局 | 同名 | 勝負和 0、0、1；出場 1 | 雲端路徑的平局端到端證據 | e2e |

### Requirement: 空狀態的呈現（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）完全沒有歷史紀錄時顯示引導型空狀態 | 既有 Scenario | 原樣通過 | regression guard | e2e |
| 雲端 total 為 0 時顯示引導型空狀態，否則顯示排行榜 | 雲端 total 為 0 時統計頁顯示引導型空狀態 | 兩種分支 | 元件不存在 → 紅 | unit |

### Requirement: 統計頁的可用性、無障礙與唯讀保證（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）排行榜表格於支援寬度下限不造成整頁橫向溢出；瀏覽統計頁不改動任何持久化資料 | 前兩個 Scenario | 原樣通過 | regression guard | e2e |
| 登入時瀏覽統計頁只發出名單與歷史的讀取請求 | 同名 | 方法皆 GET；matchmaker 路徑只有名單與歷史 | 不掛回合 store 的證據 | e2e |

## player-roster

### Requirement: 重置名單與二次確認（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）確認重置、取消重置、重置只移除列舉的四個 key、resetRoster 失敗、登入時重置名單清空雲端名單並保留本機訪客名單、登入時重置名單後雲端回合與分槽一併清除 | 對應 Scenario | 原樣通過 | regression guard | unit |
| resetRoster 成功後清空名單且不清除任何本機資料 | 登入時重置名單 | 五個本機 key 皆保留 | **改寫 B7 的 it**；舊實作會移除歷史 key → 紅 | hook |

## data-transfer

### Requirement: 登入時的資料工具頁（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雲端備份快照的參賽者、回合與歷史皆取自雲端 | 雲端備份快照的來源 | 三者雲端；history 以 `order=asc` 請求；任一失敗回錯誤 | **改寫 B7 的 it**；舊實作 history 取本機 → 紅 | unit |
| 雲端歷史 CSV 以雲端歷史依完成順序產生 | 雲端歷史 CSV 的資料來源 | 等於 `historyToCsv(雲端兩筆)`；失敗回錯誤 | 函式不存在 → 紅 | unit |
| 登入時歷史 CSV 匯出的內容來自雲端 | 同名 | 檔案含雲端姓名、不含訪客 | 元件接線 | e2e |
| （既有）登入時 JSON 匯出的參賽者來自雲端；登入時 JSON 還原停用並顯示說明 | 對應 Scenario | 原樣通過 | regression guard | e2e |

## pickleball-guide-page

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）hooks 目錄下每支 hook 都能在規格的歸屬清單中找到 | （既有 Scenario） | 新增 `useRemoteHistory.ts` 後轉紅，同步主 spec 一句後轉綠 | B3／B5～B7 先例 | unit |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint` | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm test` | 三組皆綠；數字寫在 tasks |
| C4 | （建置） | `pnpm build` | exit 0 |
| C5 | （migration） | `db:generate` 後 `git status --porcelain hono-pickball/drizzle` 為空 | 無新檔（本 change 不改 schema） |
| C6 | （E2E） | 依 runbook「每開一個新 change 的標準流程」第 4 步的 E2E 指令執行（含 user-data project） | 既有 test 全數原樣通過；user-data 新增 6 條（`history-sync.spec.ts`）全 passed；無因缺帳密 skip |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate matchmaker-history-stats-backend --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列
- [x] 每個 Scenario 至少一列（既有 Scenario 以「（既有）」列合併）
- [x] 新端點三類授權測試皆列於覆蓋表
- [x] 平局統計的既有守衛已明列並要求執行
- [x] 允許改寫／刪除的既有 it 只有三個（皆為 B7 改寫過的 B6 it），皆標明原因
