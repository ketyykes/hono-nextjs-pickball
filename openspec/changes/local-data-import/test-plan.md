# Test Plan: local-data-import

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier（同 B5～B8）：`unit`（核心套件 node；前端 `lib/**` happy-dom）、`integration`（`hono-pickball/test/**`，workerd＋D1）、
> `e2e`（`tests/e2e/user-data/**` 只在 `user-data` project；需 `.dev.vars`）。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **後端 API 授權覆蓋表**：
>
> | 端點 | 未登入 401 | 他人資料被拒 | auth 停用 404 |
> |------|-----------|--------------|---------------|
> | `POST /api/import` | 未登入呼叫匯入端點回 401 | B 的匯入不受 A 的資料影響且不改動 A | auth 停用且無 DB binding 時匯入端點回 404 |

## user-data-sync

### Requirement: 本機資料匯入雲端的 API

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| auth 停用且無 DB binding 時匯入端點回 404 | auth 停用時匯入端點回 404 | 404 | D4；**路由不存在時也是 404，預期先綠 → regression guard** | integration |
| 未登入呼叫匯入端點回 401 | 未登入時匯入端點回 401 | 401＋body | 新 sub-app；路由不存在 → 404 ≠ 401，真紅 | integration |
| B 的匯入不受 A 的資料影響且不改動 A | 匯入只寫入本人且不受他人資料影響 | B 200；A 逐列不變 | 守衛條件與插入皆帶 `user_id` | integration |
| 匯入五段資料後各自為 version 1 且保留原順序 | 匯入五段資料並保留順序 | `imported` 值；五個 GET 的內容與順序；version 1 | golden path；B8 排序的前提 | integration |
| 四張對戰分配機表任一有資料時回 409 且整份不寫入 | 雲端已有對戰分配機資料時整份不寫入 | 四情境 409；含獨立計分板皆未寫入 | **使用者定案的拒絕規則**；守衛的直接證據 | integration |
| 同一份資料重複匯入時第二次回 409 且歷史不重複 | 重複匯入同一份資料 | 200 → 409；歷史筆數不變 | 冪等 | integration |
| 雲端已有獨立計分板時略過該段且不覆寫 | 雲端已有獨立計分板時略過該段 | `skipped`；原值與 version 4；名單已寫入 | 拒絕範圍的界線 | integration |
| 重複 id、孤兒分槽、空匯入或版本不符的請求回 400 且不寫入 | 不合法的匯入請求 | 七者 400；無寫入 | 錯誤路徑 | integration |
| 300 位參賽者與 2000 筆歷史可一次匯入 | 大量資料以常數個陳述式匯入 | 200；筆數相符 | 100 參數上限下逐筆展開必失敗——`json_each` 的證據 | integration |
| LocalImportRequestSchema 拒絕重複 id、孤兒分槽與空匯入 | 共用的匯入請求 schema | 只有合法請求通過 | 契約先定；模組不存在 → 紅 | unit |

## data-transfer

### Requirement: 登入時的資料工具頁（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有，B6～B8）雲端備份快照的參賽者、回合與歷史皆取自雲端；雲端歷史 CSV 以雲端歷史依完成順序產生；登入時歷史 CSV 匯出的內容來自雲端；登入時 JSON 匯出的參賽者來自雲端 | 對應 Scenario | 原樣通過 | regression guard | unit |
| 登入時以 JSON 備份匯入到空的雲端且不寫入本機 | 登入時以 JSON 備份匯入到空的雲端 | 成功訊息；參賽者頁 2 位；本機名單不變 | 取代 B6 的「JSON 還原停用」（tasks 授權刪除該 test） | e2e |

### Requirement: 登入後匯入本機資料到雲端

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| buildLocalImportPayload 讀取本機五個 key 並略過孤兒分槽與重複歷史 | 匯入內容讀取本機五個 key… | payload 各段（只含未完成場次的分槽）；summary 重複歷史數；本機 key 逐字不變 | 組成規則；模組不存在 → 紅 | unit |
| 本機沒有資料時回報 isEmpty，任一段超過上限時回報 oversize | 本機沒有資料或資料過大 | 兩個旗標 | 邊界 | unit |
| importLocalData 依回應分類為已匯入、雲端已有資料、未授權或失敗且不改動本機 | 匯入結果的分類 | 四種分類；本機不變 | 文案分支的依據；**使用者定案的「保留本機」** | unit |
| JSON 備份轉為匯入請求時計分板為空 | JSON 備份轉為匯入請求 | `scoreboard` 為空 | JSON 還原的轉換 | unit |
| hasImportableLocalData 只在任一 key 有資料時為 true | 判斷本機是否有可匯入的資料 | false、true、true | 參賽者頁提示的條件 | unit |
| 登入後匯入本機資料到空的雲端並保留本機資料 | 同名 | 三頁顯示匯入資料；本機五 key 逐字相同 | 端到端 golden path | e2e |
| 重複匯入時顯示雲端已有資料且歷史不重複 | 重複匯入被拒絕且不產生重複歷史 | 拒絕文案；歷史筆數不變 | 冪等的端到端證據 | e2e |
| 雲端名單為空且本機有資料時參賽者頁顯示匯入提示 | 同名 | 第一次顯示、匯入後不顯示 | 入口 | e2e |
| 本機沒有資料時匯入區塊不提供匯入按鈕 | 本機沒有資料時不提供匯入按鈕 | 說明文字；無按鈕 | 空狀態 | e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint` | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm test` | 三組皆綠；數字寫在 tasks |
| C4 | （建置） | `pnpm build` | exit 0 |
| C5 | （migration） | `db:generate` 後 `git status --porcelain hono-pickball/drizzle` 為空 | 無新檔（本 change 不改 schema） |
| C6 | （E2E） | 依 runbook「每開一個新 change 的標準流程」第 4 步的 E2E 指令執行（含 user-data project） | 既有 test 全數原樣通過（扣除授權刪除的 1 條）；user-data 新增 5 條（`local-import.spec.ts`）全 passed；無因缺帳密 skip |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate local-data-import --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列
- [x] 每個 Scenario 至少一列（既有 Scenario 以「（既有）」列合併）
- [x] 新端點三類授權測試皆列於覆蓋表
- [x] 使用者定案（保留本機、拒絕不覆寫不合併、冪等）各有至少一個 integration 與一個 e2e 守住
- [x] 允許刪除的既有 test 只有一條（B6 的 JSON 還原停用），標明原因
