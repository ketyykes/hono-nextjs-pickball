# Test Plan: user-data-version-monotonic

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`integration`＝`hono-pickball/test/**`（workerd＋D1，經 migration 建表）。本 change 沒有前端或核心套件的行為測試（核心只改 `USER_DATA_TABLES` 常數，由既有後端雙向比對測試覆蓋）。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。** 新測試檔 `hono-pickball/test/version-floor.test.ts` 的每個 it 使用各自不同的測試帳號（同檔共用一份 D1）。
>
> **後端 API 授權覆蓋表**：本 change **不新增端點**、不改任何路由檔與 middleware；既有端點的四類授權測試（未登入 401、他人資料、停用 404、預期帳號 401）維持原樣通過即可，列為 regression guard（C3）。
> 「下限只屬於本人」由「一位使用者的重置不影響其他使用者的建立版本」覆蓋。

## user-data-sync

### Requirement: 刪除後重建的使用者資料版本不得重複

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 重置後重建的回合版本大於重置前且持舊版本的 PUT 回 409 | 版本下限：重置後重建的回合不被持舊版本的裝置覆寫 | 回合 v2 → reset → `PUT {R2, 0}` 得 version 3；`PUT {R1′, 1}`、`PUT {R1′, 2}` 皆 409 `VERSION_CONFLICT`；GET 為 R2／3 | **ABA 的最小重現（design R1）**；現況重建得 1、`version: 1` 的 PUT 回 200 → 真紅 | integration |
| 重置後以 version 0 重建同 id 的參賽者版本大於重置前且持舊版本的 PUT 回 409 | 版本下限：重置後以 version 0 重建同 id 的參賽者 | p1 v3、p2 v1 → reset → `PUT p1 {…, 0}` 得 4；`PUT p1 {…, 3}` 409；GET 的 p1 為重建值／4 | `putPlayer` 建立路徑；現況得 1 → 真紅 | integration |
| 重置後批次附加同 id 的參賽者回應實際版本且持舊版本的 PUT 回 409 | 版本下限：重置後批次附加同 id 的參賽者 | p1 v2 → reset → `POST /players/import [p1, p2]` 回應 version `[3, 3]` 且等於 GET；`PUT p1` 以 1、2 皆 409 | `importPlayers` 建立路徑＋回應須為實際寫入值（現況 JS 寫死 1）→ 真紅 | integration |
| 重置後重建同場次的分槽版本大於重置前且持舊版本的 PUT 回 409 | 版本下限：重置後重建同場次的分槽 | 回合 v1（pending `m1`）、`m1` 分槽 v2 → reset → 回合 `PUT 0` 得 3、分槽 `PUT 0` 得 3；分槽以 1、2 PUT 皆 409；GET `/slots/m1` 為重建值 | `putSlot` 建立路徑；現況得 1 → 真紅 | integration |
| 重置後重新匯入同一份本機資料時持舊版本的寫入皆回 409 | 版本下限：重置後重新匯入同一份本機資料時持舊版本的寫入皆被拒 | 匯入 P → reset → 再匯入 P：200、`scoreboardCurrent: "skipped"`；參賽者／回合／分槽 version 2、歷史 1、獨立計分板原值與 1；參賽者 PUT v1、回合 PUT v1、分槽 PUT v1、`score {roundVersion: 1}` 四者皆 409，四表內容與第二次匯入後相同 | **最貼近實際使用的 ABA（design R2～R4）**；`importLocalData` 三段建立路徑；同時守住 Decision 5（歷史與計分板不變）；現況四個寫入 200 → 真紅 | integration |
| 刪除參賽者後以同 id 重建時版本大於刪除前 | 版本下限：刪除參賽者後以同 id 重建 | p1 v3、p2 v1 → `DELETE p1`、`DELETE p2` 皆 204 → `PUT p1 {…, 0}` 得 4；`PUT p1 {…, 3}` 409 | `deletePlayer` 刪除路徑（design R5）；先刪大後刪小，守住「只升不降」；現況得 1 → 真紅 | integration |
| 刪除參賽者以單一 D1 batch 提高版本下限並刪除 | 版本下限：刪除參賽者以單一 batch 提高下限並刪除 | spy D1：`DELETE` 回 204；`batchSizes` 為 `[2]` | 原子性（提高下限與刪除不可分開提交）；現況不走 batch（`[]`）→ 真紅 | integration |
| 回合 PUT 清除的分槽以同場次重建時版本大於清除前 | 版本下限：回合 PUT 清除的分槽以同場次重建 | 回合 `[m1, m2]`、`m1` 分槽 v3 → PUT `[m2, m3]` → PUT `[m1, m2, m3]`（m1 pending）→ 分槽 `PUT 0` 得 4；`PUT 3` 409 | `putRound` 孤兒清除路徑；現況得 1 → 真紅；§4 時「重置路徑已處理」也不會讓它變綠（不經重置） | integration |
| 送出比分刪除的分槽在重置後重新匯入時版本大於刪除前 | 版本下限：送出比分刪除的分槽在重置後重新匯入 | 匯入（參賽者、pending `m1` 回合、`m1` 分槽）→ 分槽更新到 v5 → 送出 `m1` 比分 → reset → 再匯入同一份 → `m1` 分槽 version 6 | `submitScoreForUser` 刪除路徑；§3 完成（重置會提高下限）後仍只會得到 3（重置當下其餘列最大為 2）→ §4 時真紅 | integration |
| 沒有任何資料時重置仍回 204 且之後建立的版本為 1 | 版本下限：沒有任何資料時重置不失敗 | 新使用者 reset 204 → 回合與參賽者 `PUT 0` 皆得 1；`sync_version_floors` 無該使用者的列 | 空集合的 `max()` 為 NULL 會讓重置 500，寫入 0 列又會在熱路徑多一次寫入；**現況已綠 → regression guard**（守住 GREEN 後的 `WHERE v IS NOT NULL`） | integration |
| 一位使用者的重置不影響其他使用者的建立版本 | 版本下限：一位使用者的下限不影響他人 | A 回合 v3 → A reset → B 回合與參賽者 `PUT 0` 皆得 1；`sync_version_floors` 無 B 的列 | 下限查詢漏 `user_id` 時轉紅；空集合時誤寫 0 列（`putRound` 每次都提高下限）時於 §4 轉紅；**現況已綠 → regression guard**，MUST 在 §3、§4 每個 GREEN 後保持綠 | integration |
| （既有）刪除參賽者回 204 且重複刪除仍回 204 | 版本下限：刪除參賽者後以同 id 重建（空集合的邊界） | 重複刪除與刪除不存在的 id 仍 204 | `deletePlayer` 改為提高下限後，選不到列時 `max()` 為 NULL；漏掉空集合處理會 500。regression guard | integration |
| （既有，斷言調整）重置以單一 D1 batch 送出四條刪除 | 版本下限：重置在同一個 batch 內提高下限並刪除四張表 | spy D1：reset 回 204；`batchSizes` 由 `[4]` 改為 `[5]` | 提高下限與四條刪除同批；斷言於 §3 GREEN 同步修改（proposal Impact 允許例外 ①），改後即綠 | integration |

### Requirement: 版本化讀寫契約（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）尚無資料時 GET 回 data null 與 version 0；以 version 0 首次寫入成功並回 version 1；以目前 version 寫入成功並遞增 version，GET 取回相同資料；version 不符時回 409 VERSION_CONFLICT 且資料不變；已有資料時以 version 0 寫入回 409；body 不符 schema 或 content-type 非 JSON 時回 400 INVALID_BODY | 對應既有 Scenario（計分板目前比賽） | 原樣通過 | `scoreboard_current` 不適用下限（Decision 5）；regression guard | integration |
| （既有）versionedEnvelopeSchema 接受 data null 與非負整數 version；versionedWriteSchema 拒絕 null data 與負數或非整數 version | 共用契約 schema 的邊界 | 原樣通過 | regression guard | unit |
| 重置後重建的回合版本大於重置前且持舊版本的 PUT 回 409 | （本 Requirement 修改的「初始版本為下限加一」條款） | 同上表 | 修改條款的直接證據 | integration |

### Requirement: 多筆使用者資料的逐筆版本化契約（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）PlayerImportRequestSchema 要求至少一位且 id 不重複；PlayerListResponseSchema 以 PlayerSchema 驗證每一筆 | 共用的清單與匯入 schema | 原樣通過 | regression guard | unit |
| （既有）MatchSlotListResponseSchema 要求每筆分槽的 matchId 為字串 | 分槽清單 schema 要求 matchId 非 null | 原樣通過 | regression guard | unit |
| 重置後批次附加同 id 的參賽者回應實際版本且持舊版本的 PUT 回 409；刪除參賽者後以同 id 重建時版本大於刪除前；刪除參賽者以單一 D1 batch 提高版本下限並刪除 | （本 Requirement 修改的批次附加、刪除單筆、重置條款） | 同上表 | 修改條款的直接證據 | integration |
| （既有）匯入的參賽者附加在既有名單之後並各自為 version 1 | （`player-roster` 既有 scenario；從未刪除過資料 → 仍為 1） | 原樣通過 | 守住「全新使用者建立仍為 1」；regression guard | integration |

### Requirement: 本機資料匯入雲端的 API（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）`local-import.test.ts` 全部 21 個 it（含「匯入五段資料後各自為 version 1 且保留原順序」「四張對戰分配機表任一有資料時回 409 且整份不寫入」「300 位參賽者與 2000 筆歷史可一次匯入」「預期帳號缺少或與 session 不符時匯入回 401 ACCOUNT_MISMATCH 且雲端不寫入」等） | 本 Requirement 全部既有 Scenario | 原樣通過（新使用者下限為 0，version 仍為 1；匯入不提高下限，ACCOUNT_MISMATCH 與超過上限回 413 後各表仍零列——含新表） | regression guard；`USER_DATA_TABLES` 加入新表後「每張表零列」的斷言自動涵蓋新表 | integration |
| （既有）LocalImportRequestSchema 拒絕重複 id、孤兒分槽與空匯入 | 匯入 API：共用的匯入請求 schema | 原樣通過 | regression guard | unit |
| （既有）每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變；缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變；列舉出的使用者資料路由恰與守衛樣本表一致 | 匯入 API：守衛樣本表含匯入端點 | 原樣通過（不新增路由，仍 15 條） | regression guard | integration |
| 重置後重新匯入同一份本機資料時持舊版本的寫入皆回 409；送出比分刪除的分槽在重置後重新匯入時版本大於刪除前 | （本 Requirement 修改的 version 條款與守衛不含下限表） | 同上表；第二次匯入回 200 即證明守衛不含下限表 | 修改條款的直接證據 | integration |

## backend-database

### Requirement: 版本下限資料表由 migration 建立

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| sync_version_floors 可由 migration 建立並寫入讀回 | 版本下限表可寫入並讀回 | 插入一列後讀回各欄相同 | 設定層的覆蓋義務；表不存在 → 真紅 | integration |
| sync_version_floors 每位使用者只能有一列 | 版本下限表每位使用者只有一列 | A 第二列失敗（PRIMARY KEY／UNIQUE）；B 成功 | 主鍵約束的覆蓋；表不存在 → 真紅 | integration |
| sync_version_floors 的 version 不可為 NULL | 版本下限表的 version 不可為 NULL | `version` NULL 插入失敗（訊息含 `NOT NULL constraint failed: sync_version_floors.version`）；`version` 的 `dflt_value` 為 NULL | Decision 2「不設 DEFAULT」的證據；表不存在時同樣拋錯 → **以實跑判定**：若斷言只比對「拋錯」會先綠，MUST 比對訊息含 `NOT NULL constraint failed: sync_version_floors.version`，才是真紅 | integration |
| 刪除使用者時其 sync_version_floors 一併刪除 | 刪除使用者時連帶刪除其版本下限 | 刪除使用者後該 `user_id` 0 筆 | cascade 的覆蓋；表不存在 → 真紅 | integration |
| （既有）USER_DATA_TABLES 恰為 auth 以外的所有資料表；每張使用者資料表皆有 user_id、version 與 updated_at 且 user_id 參照 user 並 cascade | `user-data-sync`「使用者資料表的命名與欄位慣例」既有 Scenario | migration 與 `USER_DATA_TABLES` 同一個 GREEN 加入後原樣通過 | 只加 migration 不加清單（或反之）時轉紅；regression guard | integration |

## round-lifecycle

### Requirement: 回合與送出比分的雲端 API（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）`matchmaker-round.test.ts`、`matchmaker-slots.test.ts`、`matchmaker-score.test.ts`、`matchmaker-players.test.ts` 中本 Requirement 的 14 個驗收 it | 本 Requirement 全部既有 Scenario | 原樣通過（「回合的單筆版本化讀寫」「分槽只能為目前回合的未完成場次建立」等皆為新使用者，version 仍為 1；送出比分的評分、歷史、回合 version + 1 不變） | regression guard | integration（核心 schema 一列為 unit） |
| （既有，斷言調整）回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出 | 回合雲端 API：回合 PUT 以單一 batch 寫入、提高下限並清除分槽 | spy D1：200、409；`batchSizes` 由 `[2, 2]` 改為 `[3, 3]` | 下限與孤兒清除同批；斷言於 §4 GREEN 同步修改（proposal Impact 允許例外 ②），改後即綠 | integration |
| 回合 PUT 清除的分槽以同場次重建時版本大於清除前；送出比分刪除的分槽在重置後重新匯入時版本大於刪除前；重置後重建的回合版本大於重置前且持舊版本的 PUT 回 409 | （本 Requirement 修改的分槽清理、送出比分步驟 3、重置條款） | 同 `user-data-sync` 表 | 修改條款的直接證據 | integration |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint` | 0 errors、warning 不多於基線 |
| C3 | （單元＋整合） | `pnpm test` | 三組皆綠；後端檔數 +1、it 數 = 基線 + 新增（11＋4），數字寫在 tasks |
| C4 | （建置） | `pnpm build` | exit 0 |
| C5 | 版本下限表由 migration 建立 | `pnpm --filter ./hono-pickball db:generate` 後 `git -C <repo> status --porcelain hono-pickball/drizzle` 為空 | 無新檔（schema 與 0004 不漂移） |
| C6 | （E2E，regression） | 先 `pnpm --filter ./hono-pickball db:migrate:local`；再依 project 分開跑 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p>`（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3..3/3`） | 數量與基線一致、全數 passed（不新增、不刪除 E2E）；無因缺帳密 skip |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate user-data-version-monotonic --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列（ADDED 2、MODIFIED 4）
- [x] 每個 Scenario 至少一列（既有 Scenario 以「（既有）」列合併）
- [x] 每列皆有 Tier
- [x] 每條刪除路徑（重置、逐筆刪除、孤兒清除、送出比分）與每條建立路徑（三個 PUT version 0、批次附加、本機匯入三段）各有至少一個會在漏改時轉紅的 it
- [x] 會先綠的 it 已點名標 regression guard（2 個新 it ＋ 既有 it）
- [x] 允許修改的既有斷言只有兩條（batch 大小 `[4]`、`[2, 2]`），名稱不改
