# Test Plan: matchmaker-roster-backend

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier（同 B5）：`unit`（核心套件 node；前端 `lib/**` happy-dom）、`hook`（`renderHook`＋mock `fetch` 與 `@/hooks/useSession`）、
> `integration`（`hono-pickball/test/**`，workerd＋D1）、`e2e`（`tests/e2e/user-data/**` 只在 `user-data` project；需 `.dev.vars`）。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **後端 API 授權覆蓋表**（每個端點三類測試；同一 it 以迴圈涵蓋多個端點時，迴圈內每個端點都 MUST 各自斷言）：
>
> | 端點 | 未登入 401 | 他人資料被拒 | auth 停用 404 |
> |------|-----------|--------------|---------------|
> | `GET /api/matchmaker/players` | 未登入呼叫所有 /api/matchmaker 端點皆回 401 | B 看不到 A 的參賽者，且以相同 id 的 PUT 與 DELETE 不影響 A | auth 停用且無 DB binding 時所有 /api/matchmaker 端點皆回 404 |
> | `PUT /api/matchmaker/players/:id` | 同上 | 同上 | 同上 |
> | `DELETE /api/matchmaker/players/:id` | 同上 | 同上 | 同上 |
> | `POST /api/matchmaker/players/import` | 同上 | B 的匯入與重置不影響 A 的名單 | 同上 |
> | `POST /api/matchmaker/reset` | 同上 | B 的匯入與重置不影響 A 的名單 | 同上 |

## user-data-sync

### Requirement: 多筆使用者資料的逐筆版本化契約

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| PlayerImportRequestSchema 要求至少一位且 id 不重複 | 共用的清單與匯入 schema | 空陣列、重複 id 失敗；兩筆相異 id 成功 | 前後端共用契約先定；模組不存在 → 紅 | unit |
| PlayerListResponseSchema 以 PlayerSchema 驗證每一筆 | 共用的清單與匯入 schema | 含 `rating: 99` 的一筆使整份失敗；合法清單成功 | 同上 | unit |

## player-roster

### Requirement: 參賽者雲端 API

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| auth 停用且無 DB binding 時所有 /api/matchmaker 端點皆回 404 | auth 停用時所有端點回 404 | 五個端點逐一 404 | D4；**路由不存在時也是 404，預期先綠 → regression guard**（tasks 3.2 點名） | integration |
| 未登入呼叫所有 /api/matchmaker 端點皆回 401 | 未登入時所有端點回 401 | 五個端點逐一 401＋body | 路由不存在 → 404 ≠ 401，真紅 | integration |
| B 看不到 A 的參賽者，且以相同 id 的 PUT 與 DELETE 不影響 A | 他人的參賽者不可見也不可改 | B GET 不含 p1、B PUT 409、B DELETE 204、A 仍有 p1 v1 | 授權第二關 | integration |
| B 的匯入與重置不影響 A 的名單 | 他人的匯入與重置不影響本人 | B 匯入相同 id 成功；B 重置後 A 仍為兩位 | 複合主鍵與 reset 的 `user_id` 條件 | integration |
| 尚無參賽者時 GET 回空的 items | 尚無參賽者時回空清單 | `{ items: [] }` | golden path 起點 | integration |
| 以 version 0 建立參賽者並依建立順序列出 | 建立參賽者並依建立順序列出 | 兩者 v1；順序 p2、p1 | `sort_order` 語意 | integration |
| 以目前 version 更新參賽者並遞增 version | 依版本更新參賽者 | v2、新名字、順序不變 | 更新路徑 | integration |
| 參賽者 version 不符時回 409 且資料不變 | 參賽者版本不符 | v1、v3 皆 409；資料仍 v2 | D3 | integration |
| 參賽者已存在時以 version 0 寫入回 409 | 參賽者已存在時以 version 0 寫入 | 409；資料不變 | `ON CONFLICT DO NOTHING` 分支 | integration |
| path id 與 data.id 不一致或資料不合 PlayerSchema 時回 400 | 不合法的參賽者寫入 | 三種輸入皆 400；GET 為空 | 錯誤路徑 | integration |
| 刪除參賽者回 204 且重複刪除仍回 204 | 刪除冪等 | 兩次 204；GET 不含 | Decision 2 | integration |
| 匯入的參賽者附加在既有名單之後並各自為 version 1 | 匯入附加在既有名單之後 | 回應 items 與 GET 順序 | 匯入 golden path | integration |
| 匯入時任一 id 已存在則整份不寫入並回 409 | 匯入整份原子性 | 409；GET 只有 p1 | D1 batch 回滾的實證（Decision 2） | integration |
| 匯入清單為空或含重複 id 時回 400 | 不合法的匯入請求 | 兩者 400；無寫入 | 錯誤路徑 | integration |
| 重置刪除本人全部參賽者並回 204 | 重置刪除本人全部參賽者 | 204；GET 空 | reset golden path | integration |

### Requirement: 登入時名單以雲端為準

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 名單 API 包裝以正確的方法、路徑與 body 呼叫 requestJson | 名單 API 包裝的請求形狀 | mock `requestJson`，五個包裝的參數逐一比對 | 路徑字串集中一處；模組不存在 → 紅 | unit |
| 已登入時改用雲端名單並回傳 syncStatus | 選擇器在已登入時改用雲端名單 | players 為 GET 結果、`synced` | 選擇器 golden path；`syncStatus` 不存在 → 紅 | hook |
| session 載入中或訪客時走本機且 syncStatus 為 local | 訪客或 session 載入中時走本機 | `local`、寫入本機 key、無 `/api/matchmaker` 請求 | 訪客零迴歸；若本機斷言先綠，`syncStatus` 斷言仍紅（tasks 點名） | hook |
| 啟用後 GET 成功即載入名單並回報 synced，且不立即寫回 | 雲端名單載入後不立即寫回 | players、狀態序列、無 PUT／DELETE | 模組不存在 → 紅 | hook |
| addPlayer 以注入的 id 送出 version 0 的 PUT | 新增參賽者以 version 0 建立 | `crypto.randomUUID` stub；PUT 路徑與 body | 建立路徑 | hook |
| updatePlayer 與 togglePlayerActive 以該參賽者目前 version 送出 PUT，成功後沿用回應的 version | 編輯與切換出場以目前版本儲存 | 兩次 PUT version 3、4 | 版本鏈 | hook |
| removePlayer 送出 DELETE 並立即自畫面移除 | 刪除參賽者 | players 不含 p1；DELETE 路徑 | 樂觀刪除 | hook |
| 同一參賽者連續變更時只送最新一份 | 同一參賽者連續變更只送最新 | PUT 兩次，第二次為最終值 | 逐人最新優先 | hook |
| 任一 PUT 回 409 時停止所有儲存、重新載入名單並回報 conflict | 任一筆衝突時整份重新載入 | players 為重載結果；p2 待送值未送 | D3 | hook |
| GET 失敗時回報 load-failed 且變更操作不送出請求 | 載入失敗時不送出變更 | `load-failed`；名單不變；無寫入 | edge | hook |
| GET 或寫入回 401 時呼叫 onUnauthorized | 401 交回 session 處理 | 兩情境各一次；之後無請求 | 登出／過期 | hook |
| enabled 為 false 時不發出任何請求 | 停用時不發請求 | fetch 未呼叫 | 訪客零請求 | hook |
| 登入後新增的參賽者在重新整理後由雲端還原且不寫入本機 | 登入後新增的參賽者由雲端還原 | reload 後仍在；本機 key 不存在 | 端到端整合 | e2e |
| 另一個瀏覽器 context 看到相同名單 | 另一個裝置看到相同名單 | B 看到兩位 | 換裝置 | e2e |
| 另一裝置先編輯同一位參賽者時顯示衝突提示並載入最新名單 | 另一裝置先編輯同一位參賽者 | B 衝突文案＋A 的名字 | D3 端到端 | e2e |
| 刪除參賽者後重新整理不再出現 | 刪除後重新整理不再出現 | reload 後不存在 | DELETE 端到端 | e2e |
| 登入時送出比分後評分寫入雲端名單 | 送出比分的評分寫回雲端名單 | 勝方升、敗方降（reload 後） | `updatePlayer` port 在雲端模式的整合 | e2e |
| 雲端名單載入失敗時參賽者頁顯示錯誤提示 | 雲端名單載入失敗 | 文案存在；表單不存在 | 不顯示不可信名單 | e2e |

### Requirement: 重置名單與二次確認（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| resetLocalMatchProgress 只移除回合、歷史與分槽，保留名單與獨立計分板 | resetLocalMatchProgress 只清除本次活動的進度 | 三個 key 移除、兩個 key 保留 | 函式不存在 → 紅 | unit |
| resetRoster 成功後清空名單並只清除本機回合、歷史與分槽 | 登入時重置名單 | POST 一次；players 空、`synced`；本機 key 狀態 | 雲端重置路徑 | hook |
| resetRoster 失敗時名單不變並回報 rejected | 登入時重置失敗不動名單 | players 不變、`rejected`、本機 key 皆在 | 非樂觀更新的理由 | hook |
| 登入時重置名單清空雲端名單並保留本機訪客名單 | 登入時重置名單清空雲端並保留本機訪客名單 | reload 後空白；本機 key 不變 | 端到端 | e2e |
| （regression guard）既有 `storage.test.ts` 6 個 it、`player-roster.spec.ts` 重置相關 test | 既有 Scenario | 原樣通過 | 訪客重置行為一行不動 | unit／e2e |

### Requirement: LocalStorage 持久化與逐筆降級（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雲端模式下變更名單不寫入 matchmaker:roster:v1 | 雲端模式不寫入本機名單 | 新增後本機 key 為 null | 防止登出後訪客看到登入名單 | hook |
| （regression guard）既有 `useRosterStore.test.tsx` 8 個 it 與 `storage.test.ts` | 既有 Scenario | 原樣通過 | 本機實作一行不動 | hook／unit |

## data-transfer

### Requirement: 參賽者 CSV 匯入的預覽、附加寫入與整份原子性（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雲端 CSV 匯入以雲端現有名單計算並只送出新增的參賽者 | 雲端 CSV 匯入只送出新增的參賽者 | GET 先於 POST；POST body 恰為 3 位且 id 為注入值；回 ok | 模組不存在 → 紅 | unit |
| 雲端 CSV 匯入失敗時回傳錯誤且不視為成功 | 雲端 CSV 匯入失敗 | GET 失敗／POST 409／POST 500 皆回 `ok: false` 與中文訊息 | 錯誤路徑 | unit |
| 登入時 CSV 匯入的參賽者寫入雲端 | 登入時 CSV 匯入寫入雲端 | 參賽者頁出現 2 位；本機 key 不存在 | 端到端 | e2e |
| （regression guard）既有 `roster-csv.test.ts` 與 `matchmaker-data-transfer.spec.ts` | 既有 Scenario | 原樣通過 | 本機分支不動 | unit／e2e |

### Requirement: 登入時的資料工具頁

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雲端備份快照的參賽者取自雲端、回合與歷史取自本機 | 雲端備份快照的來源 | 三欄來源分別比對 | 模組不存在 → 紅 | unit |
| 登入時 JSON 匯出的參賽者來自雲端 | 登入時 JSON 匯出的參賽者來自雲端 | 下載檔 `players` 為雲端兩位 | 端到端 | e2e |
| 登入時 JSON 還原停用並顯示說明 | 登入時 JSON 還原停用 | 選檔按鈕不存在、說明文字存在 | 端到端 | e2e |

## backend-database

### Requirement: 對戰分配機參賽者資料表由 migration 建立

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| matchmaker_players 可由 migration 建立並寫入讀回 | matchmaker_players 可寫入並讀回 | 讀回四欄相同 | 表不存在 → 紅 | integration |
| 同一使用者的參賽者 id 不可重複，不同使用者可使用相同 id | 參賽者 id 只在同一使用者內唯一 | A 重複 rejects；B 成功 | 複合主鍵 | integration |
| matchmaker_players 的 user_id 必須參照既有使用者 | user_id 必須參照既有使用者 | rejects `/FOREIGN KEY/` | FK | integration |
| 刪除使用者時其 matchmaker_players 一併刪除 | 刪除使用者時連帶刪除其參賽者 | COUNT 0 | cascade | integration |
| （既有，B5）USER_DATA_TABLES 恰為 auth 以外的所有資料表；每張使用者資料表皆有 user_id… | B5 Scenario | 加表後先紅（清單未更新）→ 更新清單後綠 | 守衛本身就是 RED（tasks 3.1 點名） | integration |

## pickleball-guide-page

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）hooks 目錄下每支 hook 都能在規格的歸屬清單中找到 | （既有 Scenario） | 新增 `useRemoteRosterStore.ts` 後轉紅，同步主 spec 一句後轉綠 | B3／B5 先例 | unit |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint` | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm test` | 三組皆綠；數字寫在 tasks 7.x |
| C4 | （建置） | `pnpm build` | exit 0 |
| C5 | （migration） | `db:generate` 後 `git status --porcelain hono-pickball/drizzle` 為空；`db:migrate:local` | 無新檔；套用成功 |
| C6 | （E2E） | `.dev.vars` 齊備，依 project 分開：chromium／firefox／mobile-chrome／user-data 各一次 `--workers=1`；webkit／mobile-safari 各 `--shard=i/3` | 既有 test 全數原樣通過；user-data 新增 10 條全 passed；無因缺帳密 skip |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate matchmaker-roster-backend --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列
- [x] 五個端點三類授權測試皆列於覆蓋表
- [x] 預期先綠者（停用 404、選擇器的本機斷言、B5 守衛）已預告
- [x] 本機實作一行不動，既有測試全數為 regression guard
