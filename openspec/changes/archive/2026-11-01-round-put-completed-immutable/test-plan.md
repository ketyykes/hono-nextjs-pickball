# Test Plan: round-put-completed-immutable

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`integration`＝`hono-pickball/test/**`（workerd＋D1，經 migration 建表）。本 change 沒有前端或核心套件的行為測試。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。** 新 it 一律寫在 `hono-pickball/test/matchmaker-round.test.ts` 的 `describe("/api/matchmaker/round")` 內，每個 it 使用各自不同的測試帳號 email（同檔共用一份 D1）。
>
> **後端 API 授權覆蓋表**：本 change **不新增端點**、不改路由檔與 middleware。四類授權測試由既有 it 覆蓋，維持原樣通過即可，列為 regression guard（C2）：
> - 停用 404：「auth 停用且無 DB binding 時回合、分槽與送出比分端點皆回 404」
> - 未登入 401：「未登入呼叫回合、分槽與送出比分端點皆回 401」
> - 他人資料：「B 看不到也改不到 A 的回合與分槽」
> - 預期帳號 401：`test/expected-user-guard.test.ts` 的列舉 it
>
> 反向規則讀的 `current` 來自既有的 `getRound(db, userId)`，他人資料隔離不另寫新 it（design Decision 5）。

## round-lifecycle

### Requirement: 回合與送出比分的雲端 API（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 回合 PUT 把已完成場次改回未完成時回 400 且不寫入 | 回合 PUT 把已完成場次改回未完成時回 400 且不寫入 | `seedRound` v1 `[m1 pending, m2 completed, m3 pending]`，`seedSlot` `m1`、`m3` → PUT `{[m1, makeMatch("m2")], version: 1}`（`m2` 改回 pending，移除 `m3`）、PUT `{[m1, {...makeMatch("m2"), status: "scoring"}, m3], version: 1}` 與 PUT `{[m1, makeMatch("m2", "completed"), makeMatch("m2"), m3], version: 1}`（重複 id） → 三者皆 400 `{ error: "INVALID_BODY" }`；`GET /round` 等於原回合、version 1；`GET /slots` 的 matchId 為 `["m1", "m3"]`；`rowsOf("sync_version_floors", userId)` 為 `[]` | **缺陷的最小重現**（design Context「缺口」）；現況第一個 PUT 回 200（回合升為 v2、清掉 `m3` 的分槽並寫入下限列），之後兩個 PUT 因版本已遞增回 409 → **真紅**（紅燈證據為「第一個 PUT 200 ≠ 400」）。`scoring` 變體用來擋「只擋改回 pending」的實作；重複 id 變體用來擋「只取第一筆同 id 場次」的實作；「分槽保留＋無下限列」用來擋「送出 batch 後才回 400」的實作 | integration |
| 回合 PUT 在多場已完成場次中只把其中一場改回未完成時仍回 400 | 回合 PUT 在多場已完成場次中只把其中一場改回未完成時仍回 400 | `seedRound` v1 `[m0 completed, m1 pending, m2 completed]` → PUT `{[makeMatch("m0", "completed"), m1, makeMatch("m2")], version: 1}` → 400 `{ error: "INVALID_BODY" }`；`GET /round` 等於原回合、version 1 | 釘住「目前回合的**每一場**已完成場次都要檢查」的量詞（design Open Questions 6）：擋「外層改成 `some`」與「只檢查第一場已完成場次」的實作。實作已正確 → **regression guard**（coordinator 於合併前追加） | integration |
| 回合 PUT 整輪替換時前一輪的已完成場次可不出現在新資料 | 回合 PUT 整輪替換（前一輪完成場次不出現在新資料）時接受 | `seedRound` v1 `[m1 pending, m2 completed]`，`seedSlot` `m1` → PUT `{makeRound([n1, n2], 2), version: 1}` → 200、body 為 `{ data: 新回合, version: 2 }`；`GET /round` 相同；`GET /slots` 為 `[]` | 盤點結論 3：產生下一輪是合法操作，新規則不得擋下。現況已綠 → **regression guard**（在 GREEN 前寫入，守住「把 id 判斷寫成恆真」的實作） | integration |
| 回合 PUT 只移除部分已完成場次時接受 | 回合 PUT 只移除部分已完成場次時接受 | `seedRound` v1 `[m1 completed, m2 completed, m3 pending]` → PUT `{[makeMatch("m2", "completed"), {...makeMatch("m3"), courtNumber: 2}], version: 1}` → 200、version 2；`GET /round` 為該回合 | design Decision 2（以 id 為鍵、允許部分移除）；用來區分「逐場 id 判斷」與「全有全無」兩種實作；`m3` 以同 id、內容改變的 pending 送出，用來擋「反向規則沒篩選 completed」的實作（會擋下登入後的臨時換人）。現況已綠 → **regression guard**（GREEN 前寫入） | integration |
| 版本過期的回合 PUT 把已完成場次改回未完成時回 409 而非 400 | 版本過期的回合 PUT 以 409 優先於反向完成狀態檢查 | `seedRound(userId, [m1 pending, m2 completed], 2)` → PUT `{[m1, makeMatch("m2")], version: 1}`、`{同一回合, version: 0}` 與 `{同一回合, version: 3}` → 三者皆 409 `{ error: "VERSION_CONFLICT" }`；`GET /round` 等於原回合、version 2 | design Decision 3：多裝置最常見的情境不得由 409 退化為 400（前端 rejected 不重載）。現況已綠（正向通過 → 寫入 0 列）→ **regression guard**（GREEN 前寫入，守住「反向規則不看版本」與「版本閘門寫成 `<=`」的實作；version 3 為 crafted 的未來 version） | integration |
| （既有）回合 PUT 改變場次完成狀態或已完成場次內容時回 400 | 回合 PUT 不得改變場次的完成狀態 | 原樣通過 | 正向規則不變；regression guard | integration |
| （既有）回合 PUT 保留同 id 且內容相同的已完成場次 | （正向與反向規則的接受路徑） | 原樣通過（`m2` 以相同內容保留，反向規則通過） | 守住「反向規則比對錯誤而擋下合法保留」；regression guard | integration |
| （既有）回合 PUT 比對已完成場次時不受 JSON 鍵順序影響 | （正向與反向規則的鍵順序） | 原樣通過（資料庫中 `m2` 鍵順序相反，以相同內容 PUT 回 200） | 反向規則若不經 `sortKeys` 直接比較序列化結果，此 it 的第一個 PUT 會轉 400；regression guard | integration |
| （既有）回合 PUT 不新增、不修改也不刪除任何歷史 | （整輪替換） | 原樣通過（`[m1, m2 completed]` → `[n1, n2]` 回 200） | 整輪替換的既有守衛；regression guard | integration |
| （既有）回合 PUT 把場次改為已完成時分槽同樣被清除 | （同內容保留 completed 場次） | 原樣通過 | regression guard | integration |
| （既有）回合依單筆契約建立、更新並在版本不符時回 409；回合 PUT 刪除不屬於新回合的分槽且衝突時分槽仍與雲端回合一致；回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出 | 回合的單筆版本化讀寫；回合 PUT 在同一 batch 內清除不屬於新回合的分槽；回合雲端 API：回合 PUT 以單一 batch 寫入、提高下限並清除分槽 | 原樣通過（`[3, 3]` 不變：過期請求仍送出 3 條 batch） | 守住「版本不符時直接回 409、不送 batch」的實作（design Decision 3 不選的替代方案）；regression guard | integration |
| （既有）本 Requirement 其餘 Scenario 的驗收 it（授權四類、分槽、送出比分、重置） | 對應既有 Scenario | 原樣通過 | regression guard | integration |
| （既有）SubmitScoreRequestSchema 要求兩個比分字串與正整數 roundVersion | 共用的回合與送出比分 schema | 原樣通過（`packages/pickball-core/test/api/round.test.ts`） | regression guard | unit |

## 必做 mutation（Implementer 自跑、Stage 2 獨立再跑）

每條變異套用後跑 `pnpm --filter ./hono-pickball test --run test/matchmaker-round.test.ts`，記錄是否轉紅，然後還原並確認 `git status` 乾淨。

| # | 變異 | 預期轉紅的 it |
|---|---|---|
| M1 | 拿掉反向檢查（只留正向） | 回合 PUT 把已完成場次改回未完成時回 400 且不寫入 |
| M2 | 「id 出現在新資料」判斷改為恆真（目前回合的每一場 completed 都必須出現且不變） | 回合 PUT 整輪替換時前一輪的已完成場次可不出現在新資料；回合 PUT 只移除部分已完成場次時接受；（既有）回合 PUT 不新增、不修改也不刪除任何歷史 |
| M3 | 「id 出現在新資料」判斷改為恆假（永不檢查；對外行為與 M1 相同，保留以確認判斷式本身被測到） | 回合 PUT 把已完成場次改回未完成時回 400 且不寫入 |
| M4 | 反向規則不看版本（拿掉版本閘門，版本不符也檢查） | 版本過期的回合 PUT 把已完成場次改回未完成時回 409 而非 400 |
| M5 | 版本閘門條件反轉（只在版本不符時檢查） | 回合 PUT 把已完成場次改回未完成時回 400 且不寫入；版本過期的回合 PUT 把已完成場次改回未完成時回 409 而非 400 |
| M6 | 反向規則的狀態判斷改為只擋 `=== "pending"`（`scoring` 放行） | 回合 PUT 把已完成場次改回未完成時回 400 且不寫入（`scoring` 變體） |
| M7 | 反向規則違反時仍先送出 batch 再回 `invalid` | 回合 PUT 把已完成場次改回未完成時回 400 且不寫入（回合或分槽或下限列被改動） |
| M8 | 反向規則以「全有全無」實作（completed id 必須全出現或全不出現） | 回合 PUT 只移除部分已完成場次時接受 |
| M9 | 反向規則以陣列索引而非 id 對應 | 至少包含：回合 PUT 只移除部分已完成場次時接受（位置位移）；（既有）回合 PUT 保留同 id 且內容相同的已完成場次 |
| M10 | 反向規則以 `JSON.stringify` 直接比較（不經 `sortKeys`） | （既有）回合 PUT 比對已完成場次時不受 JSON 鍵順序影響 |
| M11 | 版本不符時直接回 `conflict`、不送 batch | （既有）回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出（`[3, 3]` → `[3]`） |
| M12 | 反向規則不篩選 completed（目前回合所有同 id 場次都必須不變） | 回合 PUT 只移除部分已完成場次時接受（`m3` 為同 id、內容改變的 pending） |
| M13 | 反向規則以 `find` 只取第一筆同 id 場次 | 回合 PUT 把已完成場次改回未完成時回 400 且不寫入（重複 id 變體） |
| M14 | 版本閘門寫成 `current.version <= expectedVersion` | 版本過期的回合 PUT 把已完成場次改回未完成時回 409 而非 400（version 3 的 PUT 得到 400） |
| C1（對照組，預期存活） | 反向規則只比 `status === "completed"`、不比內容 | 無（內容被改、status 仍為 completed 時，由正向規則擋下，對外行為等價；design Decision 1） |
| C2（對照組，預期存活） | `isDeepEqual(c, n)` 改為 `isDeepEqual(n, c)` | 無（對稱） |

**mutation harness 三重落地檢查**：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出。

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck` | 皆 exit 0 |
| C2 | （整合） | 持雙鎖跑 `pnpm test:api` | 全綠；後端檔數與基線相同、it 數 = 基線 + 4，數字寫在 tasks |
| C3 | （建置） | 持雙鎖跑 `pnpm --filter ./hono-pickball build` | exit 0 |
| C4 | （E2E，regression） | 先 `lsof`／`ps` 清殘留，持雙鎖跑 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data` | 數量與基線相同、全數 passed；不得因缺帳密而 skip |
| C5 | （規格） | `DO_NOT_TRACK=1 openspec validate round-put-completed-immutable --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列（MODIFIED 1）
- [x] 每個 Scenario 至少一列（新增 4 個各一列；既有 Scenario 以「（既有）」列合併）
- [x] 每列皆有 Tier
- [x] 反向規則的每個判斷分支（只看 completed、id 出現與否、重複 id 逐場、版本閘門的等號、狀態與內容比較、拒絕時不送 batch）各有至少一個會轉紅的變異（M1～M14）
- [x] 會先綠的 it 已點名標 regression guard（新 it 3 個，加上既有 it）
- [x] 既有 it 的名稱與斷言一律不改
