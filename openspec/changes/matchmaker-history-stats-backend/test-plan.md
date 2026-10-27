# Test Plan: matchmaker-history-stats-backend

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier（同 B5～B7）：`unit`（核心套件 node；前端 `lib/**`、元件 happy-dom）、`hook`（`renderHook`＋mock `fetch` 與 `@/hooks/useSession`；屬 unit 的細分）、
> `integration`（`hono-pickball/test/**`，workerd＋D1）、`e2e`（`tests/e2e/user-data/**` 只在 `user-data` project；需 `.dev.vars`）。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **後端 API 授權覆蓋表**（四類，`user-data-sync`「使用者資料 API 的路由、授權與停用閘門」；第四欄由 B7.5 的列舉測試統一覆蓋，本 change 只補樣本）：
>
> | 端點 | 未登入 401 | 他人資料被拒 | auth 停用 404 | 預期帳號缺少／不符 401 `ACCOUNT_MISMATCH` |
> |------|-----------|--------------|---------------|------------------------------------------|
> | `GET /api/matchmaker/history` | 未登入呼叫歷史端點回 401 | B 看不到 A 的歷史且 total 為 0 | auth 停用且無 DB binding 時歷史端點回 404 | `expected-user-guard.test.ts`「每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變」「缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變」（樣本表補 `GET /api/matchmaker/history`） |
>
> 後端新測試以 `hono-pickball/test/helpers/matchmaker-fixtures.ts` 的 `seedAndSignIn`／`request()`／`seedHistory`／`rowsOf` 登入、送請求（自動帶 `X-Expected-User-Id`）與 seed；
> 不得另抄一份 `seedAndSignIn`（B7 交接）。inline 請求須自行帶 `expectedUserHeader(cookie)`。

## match-history

### Requirement: 歷史頁唯讀消費既有紀錄（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）瀏覽與切換區間後 matchmaker:history:v1 內容不變；紀錄於 hydration 後顯示且無 console error | 前兩個 Scenario | 原樣通過 | regression guard（本機元件未改） | e2e |
| 登入時瀏覽歷史頁只發出 GET 且不改動本機歷史 | 歷史頁唯讀：登入時瀏覽歷史頁只發出 GET 且不寫入本機 | `/api/matchmaker/*` 皆 GET；本機 key 逐字相同 | 雲端唯讀保證 | e2e |

### Requirement: 損毀歷史紀錄的可見提示（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）有損毀歷史紀錄時顯示提示且其餘紀錄正常顯示；沒有損毀歷史紀錄時不顯示損毀提示 | 前兩個 Scenario | 原樣通過 | regression guard | e2e |
| 雲端回應的 droppedCount 大於 0 時顯示與本機相同的損毀提示 | 損毀提示：雲端回應的 droppedCount 大於 0 時顯示相同提示 | `role="alert"`、逐字文案；合法紀錄仍在 | 元件不存在 → 紅 | unit |

### Requirement: 登入時歷史以雲端為準

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| auth 停用且無 DB binding 時歷史端點回 404 | 雲端歷史：auth 停用時歷史端點回 404 | 404 | D4；**路由不存在時也是 404，預期先綠 → regression guard** | integration |
| 未登入呼叫歷史端點回 401 | 雲端歷史：未登入時歷史端點回 401 | 401＋body | sub-app 已有 `requireSession`，**若先綠則點名標 regression guard** | integration |
| B 看不到 A 的歷史且 total 為 0 | 雲端歷史：他人的歷史不可見 | 空 items、total 0 | 授權第二關 | integration |
| 預設依 played_at 由新到舊且同時間依插入順序，asc 為由舊到新 | 雲端歷史：預設由新到舊、同時間依插入順序 | 兩種順序逐筆比對 | 與 `filterHistoryByRange` 的穩定排序一致 | integration |
| from 含、to 不含地篩選 played_at，total 仍為全部筆數 | 雲端歷史：依 from 與 to 篩選且 total 不受篩選影響 | 只有 200；total 3 | 半開區間 | integration |
| from、to 或 order 不合法時回 400 | 雲端歷史：不合法的查詢參數 | 五者 400（含 `from=` 空字串；§1 查證 `z.coerce.number()` 對空字串得 0） | 錯誤路徑 | integration |
| data 不是合法 JSON 的歷史列同樣被略過並計數而不使端點失敗 | 雲端歷史：data 不是合法 JSON 的列同樣被略過並計數 | 200；items 只有合法那筆；droppedCount 1；total 2；原始文字不變 | apply §3 Stage 2 實測：drizzle json mode 讀取時 `JSON.parse` 拋錯 → 整個端點 500 → 紅 | integration |
| （既有，B7.5，改樣本表）每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變；缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變 | 雲端歷史：預期帳號缺少或不符時歷史端點回 401 且不回傳歷史 | `SAMPLES` 補 `GET /api/matchmaker/history` 後兩個 it 對該路由逐變體 401＋快照不變 | 守衛在 sub-app 層；**路由不存在時 sub-app 的 `use("*")` 仍先回 401，預期先綠 → regression guard** | integration |
| （既有，B7.5，**授權修改**）列舉出的使用者資料路由恰與守衛樣本表一致 | 同上 AND | 列舉＝樣本鍵；`toHaveLength(13)` 改 14 | 樣本先補、路由未加 → 列舉 13 ≠ 樣本 14 → **真紅** | integration |
| 不合 schema 的歷史列被略過並計入 droppedCount 且不被刪除 | 雲端歷史：損毀列被略過並計數但不刪除 | 兩次 GET 一致；表仍兩列 | 雲端降級與本機的差異點 | integration |
| rangeBounds 與 rangeOfTime 對任意時間判定一致 | 雲端歷史：同名 | 全部樣本一致 | 區間定義只有一份的證據；函式不存在 → 紅 | unit |
| 五個區間的 rangeBounds 首尾相接且兩端無界 | 雲端歷史：五個區間的界線首尾相接 | 四個等式＋兩個 null | 互斥且完整覆蓋 | unit |
| HistoryQuerySchema 要求 from 小於 to 且 HistoryListResponseSchema 接受平局紀錄 | 雲端歷史：共用的歷史查詢與回應 schema | 前者失敗、後兩者通過、轉數字 | 契約先定；平局不可回退 | unit |
| 歷史 API 包裝以正確的查詢字串呼叫 requestJson | 雲端歷史：歷史 API 包裝的請求形狀 | 三個路徑；每次 `expectedUserId` 皆為第一參數 `"user-a"` | 路徑集中一處 | unit |
| 依 range 以 rangeBounds 的界線載入雲端歷史並在 range 改變時重新載入 | 雲端歷史：依區間載入雲端歷史 | 兩次 GET 的界線與 `X-Expected-User-Id: user-a`；狀態序列 | hook golden path | hook |
| range 快速切換時只採用最後一次請求的結果 | 雲端歷史：只採用最後一次請求的結果 | items 為第二次回應 | 競態 | hook |
| GET 失敗時為 load-failed，401 時呼叫 onUnauthorized，停用時不發請求 | 雲端歷史：載入失敗、401 與停用 | 同名；`enabled: false` 與 `userId: null` 皆不發請求 | 失敗分支 | hook |
| userId 變更時以新帳號重新載入歷史且不顯示前一帳號的歷史 | 雲端歷史：換帳號時以新帳號重新載入且不顯示前一帳號的歷史 | rerender 當下 `items` 空、`total` 0、`loading`；新 GET 帶 `user-b`；A 晚到回應被忽略 | B7.5 帳號世代；hook 不存在 → 紅 | hook |
| total 為 0 時顯示引導型空狀態，否則顯示區間空狀態 | 雲端歷史：兩種空狀態 | 兩種 EmptyHistory | 空狀態語意不可回退 | unit |
| 登入後完成的對戰由雲端顯示在歷史頁且不寫入本機 | 雲端歷史：登入後完成的對戰出現在歷史頁 | 今日顯示該場；本機 key 不存在 | 端到端 golden path | e2e |
| 雲端歷史載入失敗時歷史頁顯示錯誤提示 | 雲端歷史：載入失敗時歷史頁顯示錯誤 | 錯誤文案；無篩選 | 頁面接線 | e2e |

## player-stats

### Requirement: 統計依區間篩選（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）切換區間後排行榜只反映該區間的歷史紀錄 | 既有 Scenario | 原樣通過 | regression guard | e2e |
| （既有，draw-followups）`player-stats.test.ts`「平局紀錄計為和局而非雙方各一敗場」「出場數、勝場與敗場依歷史紀錄正確加總」「出場數為零時勝率為零而非 NaN」；`PlayerStatsTable.test.tsx`「勝負和欄依序顯示勝場敗場與和局三個數字」 | `出場、勝負與勝率的計算`、`統計頁的路由與呈現`（未修改） | 原樣通過 | **平局統計不可回退的守衛**（tasks 點名執行） | unit |
| 登入時計時回合的平局在統計頁計為和局 | 統計區間：同名 | 勝負和 0、0、1；出場 1 | 雲端路徑的平局端到端證據 | e2e |

### Requirement: 空狀態的呈現（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）完全沒有歷史紀錄時顯示引導型空狀態 | 既有 Scenario | 原樣通過 | regression guard | e2e |
| 雲端 total 為 0 時顯示引導型空狀態，否則顯示排行榜 | 統計空狀態：雲端 total 為 0 時統計頁顯示引導型空狀態 | 兩種分支 | 元件不存在 → 紅 | unit |

### Requirement: 統計頁的可用性、無障礙與唯讀保證（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）排行榜表格於支援寬度下限不造成整頁橫向溢出；瀏覽統計頁不改動任何持久化資料 | 前兩個 Scenario | 原樣通過 | regression guard | e2e |
| 登入時瀏覽統計頁只發出名單與歷史的讀取請求 | 統計頁唯讀：登入時瀏覽統計頁只發出讀取請求 | 方法皆 GET；matchmaker 路徑只有名單與歷史 | 不掛回合 store 的證據 | e2e |

## player-roster

### Requirement: 重置名單與二次確認（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）確認重置、取消重置、重置只移除列舉的四個 key、resetRoster 送出前停止所有參賽者的待送與重試中變更、resetRoster 失敗、登入時重置名單清空雲端名單並保留本機訪客名單、登入時重置名單後雲端回合與分槽一併清除 | 對應 Scenario | 原樣通過 | regression guard | unit |
| （指令）`rg resetLocalMatchProgress nextjs-pickball` 無輸出 | resetLocalMatchProgress 只清除本次活動的進度（沿用標題、內容改寫為函式已刪除） | 無輸出 | 刪除 B7 的 `storage.test.ts` it 後，此 Scenario 由指令守住 | 指令 |
| resetRoster 成功後清空名單且不清除任何本機資料 | 登入時重置名單 | 五個本機 key 皆保留 | **改寫 B7 的 it**；舊實作會移除歷史 key → 紅 | hook |

## data-transfer

### Requirement: 登入時的資料工具頁（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雲端備份快照的參賽者、回合與歷史皆取自雲端 | 雲端備份快照的來源 | 三者雲端；history 以 `order=asc` 請求；任一失敗回錯誤 | **改寫 B7 的 it**；舊實作 history 取本機 → 紅 | unit |
| 雲端歷史 CSV 以雲端歷史依完成順序產生 | 登入資料工具：雲端歷史 CSV 的資料來源 | 等於 `historyToCsv(雲端兩筆)`；失敗回錯誤 | 函式不存在 → 紅 | unit |
| 雲端歷史匯出的每個請求帶呼叫端給的帳號且 401 時標示未授權 | 登入資料工具：歷史匯出帶呼叫端給的帳號且 401 時標示未授權 | 備份三個 GET 與 CSV 的 GET 皆 `user-a`；歷史 401 → `unauthorized: true`；500 不帶 | 一次性雲端操作；CSV 函式不存在 → 紅 | unit |
| （既有，B7.5，**授權修改**）雲端匯入與備份的每個請求都帶呼叫端給的帳號 | `user-data-sync`「帳號世代：一次性雲端操作以觸發當下的帳號送出」 | 備份段 fetch mock 補歷史回應、呼叫次數 2→3、帳號清單多一個 `user-a`；匯入段不動 | 備份多一個歷史 GET 的必然結果（斷言語意不變） | unit |
| 登入時歷史 CSV 匯出的內容來自雲端 | 登入資料工具：登入時歷史 CSV 匯出來自雲端 | 檔案含雲端姓名、不含訪客 | 元件接線 | e2e |
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
| C6 | （E2E） | 前後以 `lsof`＋`ps` 清殘留；依 project 分開跑 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p>`：chromium、firefox、mobile-chrome、user-data 各一次，webkit 與 mobile-safari 各 `--shard=1/3`～`3/3`（不用 `test:e2e --`） | 既有 test 全數原樣通過；user-data 新增 6 條（`history-sync.spec.ts`）全 passed；無因缺帳密 skip |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate matchmaker-history-stats-backend --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列
- [x] 每個 Scenario 至少一列（既有 Scenario 以「（既有）」列合併）
- [x] 新端點四類授權測試皆列於覆蓋表（第四類為 B7.5 列舉測試＋樣本）
- [x] 平局統計的既有守衛已明列並要求執行
- [x] 允許改寫／刪除的既有 it 只有五個：三個 B7 改寫過的 B6 it，加兩個 B7.5 it（守衛列舉的路由數、備份請求數），皆標明原因
