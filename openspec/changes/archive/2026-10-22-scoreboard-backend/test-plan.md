# Test Plan: scoreboard-backend

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：
> - `unit`：純函式（核心套件 node 環境；前端 `lib/sync/**` 於 happy-dom）。
> - `hook`：`@testing-library/react` 的 `renderHook`，mock `fetch` 與 `@/hooks/useSession`。
> - `integration`：`hono-pickball/test/**`，workerd＋D1，經 `exports.default.fetch` 或 `app.request(path, init, env)`。
> - `type`：以 `// @ts-expect-error` 寫在測試檔，由 `pnpm --filter ./hono-pickball typecheck` 判定（vitest 不做型別檢查）。
> - `e2e`：Playwright。`tests/e2e/user-data/**` 只在 `user-data` project 執行（需 `.dev.vars` 齊備）；`tests/e2e/specs/**` 在既有五個 project 執行。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **後端 API 授權覆蓋表**（每個使用者資料端點三類測試）：
>
> | 端點 | 未登入 401 | 他人資料被拒 | auth 停用 404 |
> |------|-----------|--------------|---------------|
> | `GET /api/scoreboard/current` | 未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401 | B 的 cookie 讀不到 A 的計分板且寫入不影響 A | auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404 |
> | `PUT /api/scoreboard/current` | 同上（同一 it 涵蓋兩個方法） | 同上（B 的 PUT 不影響 A） | 同上 |

## user-data-sync

### Requirement: 使用者資料 API 的路由、授權與停用閘門

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404 | auth 停用時使用者資料 API 回 404 且不觸碰 D1 | `app.request` 注入 `{ ...env, ENVIRONMENT: undefined, DB: undefined }`，GET 與 PUT（合法 body）皆 404 | D4 正式站零變更的核心；路由不存在時也是 404，**真紅燈需與下一列一起看**——本列先寫時會因 404 而綠，誠實標為 regression guard（見 tasks 3.2 註記） | integration |
| 未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401 | 未登入呼叫使用者資料 API 回 401 | 兩者 status 401、body `{ error: "UNAUTHORIZED" }` | 路由與 middleware 尚不存在 → 404 ≠ 401，真紅燈 | integration |
| B 的 cookie 讀不到 A 的計分板且寫入不影響 A | 只能存取本人的資料 | A PUT 5:3 → B GET `{ null, 0 }` → B PUT v0 成功 → A GET 仍 5:3 與原 version | 授權的第二道關卡：session 本人以外的資料不可見 | integration |
| （型別）未掛 requireSession 的 handler 讀 c.var.user 為型別錯誤 | 未經 requireSession 的 handler 讀取 user 為型別錯誤 | `@ts-expect-error` 標註的那行在拆型別前不是錯誤 → typecheck 報「Unused '@ts-expect-error' directive」；拆型別後 typecheck exit 0 | B2 給 Wave 2 的建議；先鎖住型別保證再重構 | type |
| （regression guard）既有 auth-gating／auth-me／auth-session 全部 it | （auth capability 既有 Scenario） | 移出 `localAuth` 後全數原樣通過 | 搬移 middleware 的行為零變更證明 | integration |

### Requirement: 版本化讀寫契約

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| versionedEnvelopeSchema 接受 data null 與非負整數 version | 共用契約 schema 的邊界 | `{data:null,version:0}`、`{data:{n:1},version:3}` 成功；`version:-1`、`1.5` 失敗 | 前後端共用的契約先定，模組不存在 → 紅 | unit |
| versionedWriteSchema 拒絕 null data 與負數或非整數 version | 共用契約 schema 的邊界 | `data:null`、`version:-1`、`version:1.5` 皆失敗；合法輸入成功 | 同上 | unit |
| 尚無資料時 GET 回 data null 與 version 0 | 尚無資料時 GET 回 data null 與 version 0 | 200、`{ data: null, version: 0 }` | golden path 起點；「不回 404」是契約重點 | integration |
| 以 version 0 首次寫入成功並回 version 1 | 以 version 0 首次寫入 | PUT 200 `version: 1`；GET 取回相同 data | 建立路徑 | integration |
| 以目前 version 寫入成功並遞增 version，GET 取回相同資料 | 以目前版本更新 | PUT v1 → 200 `version: 2`；GET 新比分 | 更新路徑 | integration |
| version 不符時回 409 VERSION_CONFLICT 且資料不變 | 版本不符時回 409 且資料不變 | v2 時送 v1 與 v3 皆 409 `{error:"VERSION_CONFLICT"}`；GET 仍 v2 | D3 核心；兩個方向都要擋 | integration |
| 已有資料時以 version 0 寫入回 409 | 已有資料時以 version 0 寫入回 409 | 409；資料與版本不變 | `onConflictDoNothing` 分支的邊界 | integration |
| body 不符 schema 或 content-type 非 JSON 時回 400 INVALID_BODY | body 不合法時回 400 | 四種輸入皆 400 `{error:"INVALID_BODY"}`；之後 GET 仍 `{null,0}` | 錯誤路徑；`text/plain` 驗證 CSRF 防線之一 | integration |
| data.matchId 非 null 時回 400 INVALID_BODY | （scoreboard「登入時獨立計分板以雲端為準」：current 只存獨立計分板） | `matchId: "m1"` 的合法狀態 PUT → 400 | 防止分槽資料誤寫入 current（Decision 1） | integration |

### Requirement: 使用者資料表的命名與欄位慣例

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| USER_DATA_TABLES 恰為 auth 以外的所有資料表 | USER_DATA_TABLES 與實際資料表一致 | 過濾後的 `sqlite_master` 排序後 `toEqual` 排序後的清單；長度 ≥ 1 | 清單模組與表皆不存在 → 紅；之後每張新表都靠它守住 E2E 清空 | integration |
| 每張使用者資料表皆有 user_id、version 與 updated_at 且 user_id 參照 user 並 cascade | 每張使用者資料表符合欄位慣例 | `pragma_table_info` 三欄 `notnull=1`；`pragma_foreign_key_list` 的 `table='user'`、`to='id'`、`on_delete='CASCADE'` | 慣例由工具強制，B6～B8 不必靠審查 | integration |

### Requirement: 前端依 session 選擇儲存模式

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 只有 session 就緒、auth 啟用且有 user 時為 remote | 只有就緒、啟用且已登入時為 remote | 四種快照只有最後一種為 `"remote"` | 訪客零迴歸的唯一開關 | unit |

### Requirement: 前端 API 請求的結果分類

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 2xx 且回應符合 schema 時為 ok | 成功回應通過 schema 時為 ok | `{kind:"ok", value}`；204 時 value 為 undefined | golden path | unit |
| 409 為 conflict、401 為 unauthorized | 409 與 401 各自分類 | 對應 kind | 衝突與登出的分流依據 | unit |
| 其餘 4xx 為 rejected 並帶狀態碼 | 其餘 4xx 為 rejected | 400、404 → `{kind:"rejected", status}` | 不可重試的錯誤不能進重試迴圈 | unit |
| 5xx、網路錯誤或回應不符 schema 時為 failed 且不 throw | 可重試的失敗不 throw | 四種情況皆 `failed`，`await` 不 reject | edge：永不 throw 是 hook 簡化的前提 | unit |
| GET 帶 keepalive，有 body 時帶 JSON content-type，皆為 same-origin 憑證 | 請求帶正確的 fetch 選項 | 檢查 `fetch` mock 收到的 init | WebKit console 錯誤教訓與 CSRF 契約 | unit |

### Requirement: 最新優先的雲端儲存與自動重試

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 同時只送一個請求，在途期間再存只保留最新一份 | 同時只送一個請求且只保留最新一份 | `send` 依序收到 A、C；B 未送 | 逐球計分的核心保證 | unit |
| failed 時依 1、2、4、8 秒後每 8 秒重試，成功後停止 | 失敗時以退避間隔重試 | fake timers 逐段推進；呼叫時點與 `onResult("retrying")`；成功後 `saved` | 重試 Scenario 為 runbook 明文要求 | unit |
| conflict、unauthorized、rejected 時停止並丟棄待送資料 | 不可重試的結果停止佇列 | 三種結果各一輪：不再呼叫 send、推進時間仍不呼叫 | edge：防止對衝突資料無限重送 | unit |
| 重試等待期間的新資料取代待送值且不重置等待時間 | 重試等待期間的新資料取代待送值 | 1 秒時送出 B | edge：最新優先在重試中也成立 | unit |
| dispose 後取消重試並忽略在途結果 | dispose 後不再送出 | 兩情境皆無後續呼叫 | 卸載後 setState 警告與幽靈請求 | unit |

### Requirement: 同步狀態與提示

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| local、synced、saving 不顯示提示，其餘狀態各有固定文案 | 只有需要使用者注意的狀態才有文案 | 八種狀態逐字比對 | 文案是 E2E 與使用者的共同契約 | unit |
| 訪客模式下計分板不渲染同步提示與 data-sync-status | 訪客的計分板不渲染同步元素 | 得分後 `[data-sync-status]` 計數 0、五種文案皆不存在 | 訪客 DOM 零變更 | e2e |

## scoreboard

### Requirement: localStorage 持久化（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雲端模式下 dispatch 不寫入 scoreboard:current:v1 | 登入且未綁定場次時不寫入本機獨立槽 | dispatch 後 `localStorage.getItem("scoreboard:current:v1")` 為 null | 防止登出後訪客看到登入時的比賽 | hook |
| 已登入但帶 matchId 時仍走本機分槽且 syncStatus 為 local | 登入但帶 matchId 時仍走本機分槽 | `bound`、`local`、分槽被寫入、fetch 未以 `/api/scoreboard` 呼叫 | Decision 1 的邊界 | hook |
| （regression guard）`storage.test.ts`、`match-slots.test.ts`、既有 `useScoreboardStore.test.tsx` 15 個 it、既有計分板 E2E | 既有 Scenario | 原樣通過 | 本機實作一行不動的證明 | unit／hook／e2e |

### Requirement: 登入時獨立計分板以雲端為準

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 已登入且未帶 matchId 時改用雲端並回傳 syncStatus | 選擇器在已登入且未綁定場次時改用雲端 | 最終 scores 4:2、`synced` | 選擇器 golden path；第四個回傳值不存在 → 紅 | hook |
| session 載入中或訪客時走本機且 syncStatus 為 local | 訪客或 session 載入中時走本機 | 兩種 session 各一輪：`local`、寫入本機槽、無 `/api/scoreboard` 請求 | R3：載入中不得等待 | hook |
| 啟用後 GET 成功即 HYDRATE 並回報 synced，且不立即寫回 | 雲端載入成功即還原且不立即寫回 | scores 7:5；狀態序列含 `loading`→`synced`；無 PUT | 模組不存在 → 紅 | hook |
| 雲端無資料時維持初始狀態，第一次儲存帶 version 0 | 雲端尚無資料時以初始狀態起手 | state 等於 `createInitialState()`；PUT body `version: 0` | 首次使用者的路徑 | hook |
| dispatch 後以目前 version PUT 新狀態，成功後沿用回應的 version | 計分後以目前版本儲存 | 兩次 PUT 的 version 為 2、3 | 版本鏈不可斷 | hook |
| PUT 回 409 時重新 GET 並以雲端狀態取代，狀態為 conflict | 版本衝突時重新載入雲端狀態 | scores 9:9、`conflict`、下一次 PUT `version: 5` | D3 | hook |
| GET 失敗時狀態為 load-failed 且不送出任何 PUT | 載入失敗時不寫入 | `load-failed`；無 PUT | edge：不知版本時寫入只會衝突或覆蓋 | hook |
| GET 或 PUT 回 401 時呼叫 onUnauthorized 且不再送出 | 401 時交回 session 處理 | 兩情境各呼叫一次；之後 fetch 次數不變 | 登出／過期的回復路徑 | hook |
| enabled 為 false 時不發出任何請求 | 停用時不發請求 | fetch 未被呼叫 | 訪客零請求 | hook |
| 登入後計分在重新整理後由雲端還原且不寫入本機 | 登入後計分可在重新整理後還原 | reload 後 3:0；`localStorage` 無該 key | 端到端整合（proxy、cookie、D1） | e2e |
| 另一個瀏覽器 context 載入同一份雲端比分 | 另一個裝置看到同一場比賽 | B 顯示 2:0 | 換裝置是本功能的目的 | e2e |
| 另一裝置先寫入時顯示衝突提示並載入最新比分 | 另一裝置先寫入時顯示衝突並載入最新比分 | B 顯示衝突文案、比分等於 A | D3 端到端 | e2e |
| 儲存失敗時顯示重試提示並於恢復後自動送出 | 儲存失敗時提示並自動重試 | 重試文案出現 → 消失 → `synced`；reload 保留 | runbook 要求的重試 Scenario | e2e |
| 雲端載入失敗時顯示錯誤提示且不顯示計分畫面 | 雲端載入失敗時不顯示計分畫面 | 文案存在；得分按鈕不存在 | 不顯示不可信比分 | e2e |

## backend-database

### Requirement: 計分板目前比賽資料表由 migration 建立

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| scoreboard_current 可由 migration 建立並寫入讀回 | scoreboard_current 可寫入並讀回 | 讀回三欄相同 | 設定層的覆蓋義務；表不存在 → 紅 | integration |
| 同一使用者在 scoreboard_current 只能有一列 | 同一使用者只能有一列 | 第二次 insert rejects `/UNIQUE|PRIMARY KEY/`；COUNT 為 1 | 約束測試 | integration |
| scoreboard_current 的 user_id 必須參照既有使用者 | user_id 必須參照既有使用者 | insert rejects `/FOREIGN KEY/` | 約束測試 | integration |
| 刪除使用者時其 scoreboard_current 一併刪除 | 刪除使用者時連帶刪除其計分板 | COUNT 為 0 | cascade 約束測試 | integration |

## dev-workflow

### Requirement: E2E 登入夾具（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 清空使用者資料後仍為登入態且雲端為初始比分 | 清空使用者資料不影響登入態 | 先 PUT 一筆 → clear → 開頁為 0:0 且 `synced` | D6 的「不刪 user／session」保證 | e2e |

## pickleball-guide-page

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）hooks 目錄下每支 hook 都能在規格的歸屬清單中找到 | （既有 Scenario） | 新增 `useRemoteScoreboardStore.ts` 後轉紅，同步主 spec 那一句後轉綠 | 守衛測試本身就是 RED（B3 先例） | unit |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint` | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm test` | 三組皆綠；前端＝基線＋新增、後端＝基線＋新增、核心＝基線＋新增（數字寫在 tasks 4.x） |
| C4 | （建置） | `pnpm build` | exit 0，含 Total Upload |
| C5 | （migration） | `pnpm --filter ./hono-pickball db:generate` 後 `git status --porcelain hono-pickball/drizzle` 為空；`pnpm --filter ./hono-pickball db:migrate:local` | 無新檔；套用 `0001` 或「No migrations to apply」 |
| C6 | 使用者資料 spec 只在 user-data project 執行；既有 project 維持訪客 | `playwright test --list`；閱讀 `playwright.config.ts` | 見 dev-workflow Scenario |
| C7 | （E2E 零迴歸＋新功能） | `.dev.vars` 齊備，依 project 分開：chromium／firefox／mobile-chrome／user-data 各一次 `--workers=1`；webkit／mobile-safari 各 `--shard=i/3` | 既有 test 全數原樣通過；新增：訪客 spec 5 條（每 project 1）、user-data 6 條全 passed，沒有因缺帳密 skip |
| C8 | （規格） | `DO_NOT_TRACK=1 openspec validate scoreboard-backend --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列
- [x] 每個後端端點三類授權測試已列於覆蓋表
- [x] 可能先綠的測試（停用 404）已預告為 regression guard，不以 mutation 偽造紅燈
- [x] 本機實作一行不動，既有測試全數為 regression guard
