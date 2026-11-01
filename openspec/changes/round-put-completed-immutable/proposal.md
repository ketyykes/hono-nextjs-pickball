# Proposal: round-put-completed-immutable

## Why

主 spec `round-lifecycle`「回合與送出比分的雲端 API」規定「完成狀態不可經 PUT 改變」，但後端 `keepsCompletedMatches`（`hono-pickball/src/matchmaker/round-repository.ts:58-64`）只做單向檢查：
「新資料中 completed 的場次」必須在目前回合中、而且內容相同；**沒有反向檢查**「目前回合中 completed 的場次」在新資料中仍為 completed。
所以 `PUT /api/matchmaker/round` 把 `m2` 從 `completed` 改回 `pending` 會被接受（回 200）。已送出比分的場次因此可以再送出一次，產生第二筆同 `matchId` 的歷史嘗試，被歷史主鍵擋成 409。
結果是這個場次在回合裡永遠停在未完成、卻再也無法完成。
此缺口是 `user-data-version-monotonic` 在 apply 前盤點時發現的（`openspec/changes/archive/2026-11-01-user-data-version-monotonic/design.md` Open Questions 2），當時裁定另開 change 處理。G1（Google 登入上線）之後多裝置同時使用會是常態，因此要在 G1 之前補上。

## What Changes

**後端**（`hono-pickball/src/matchmaker/round-repository.ts`）
- 在完成狀態比對中加入反向規則：**目前回合中 `completed` 的場次，若其 id 出現在新資料中，MUST 仍為 `completed` 且內容完全相同**。
  id 完全不出現在新資料中則允許，因此產生新一輪時的整輪替換仍然合法，只移除部分已完成場次也合法。前端盤點的結論與證據見 design「Context」與 Decision 2。
- **反向規則只在讀出的目前回合 version 等於請求的 `version` 時檢查**（design Decision 3）：
  - 版本不符的請求照舊進入帶版本條件的 batch，回 409。
  - 停在舊回合的裝置（另一裝置剛送出比分）因此照舊得到 409，並整份重新載入，不會被反向規則判成 400 而卡在 rejected。
  - 既有的正向規則照舊排在版本比對之前（B7 OQ16 的 coordinator 裁定，不在本 change 變更）。
- 違反時回 `400 INVALID_BODY`，**不送出 batch**：回合、分槽、版本下限都不變。這與既有 invalid 分支一致。
- 路由檔（`src/routes/matchmaker.ts`）、資料表、migration 都不改。

**前端**：不改。所有送出 `PUT /round` 的正常路徑都不會產生「保留 id 但改回未完成」的回合（design Context 盤點表）。

**文件**：`hono-pickball/CLAUDE.md` 的「判定順序」段落改成三段式：正向檢查 → 版本相符才做反向檢查 → 帶版本條件的寫入。

### 明確不做

- 改變正向規則的判定順序（OQ16：停在舊回合的裝置重排時，若帶了伺服器上已不存在的已完成場次，仍會先得到 400）。列為 design Open Questions 3。
- 用歷史表封鎖「先移除已完成場次、再以同 id 加回未完成」的兩步繞道（需要 crafted 請求，正常路徑不會發生）。列為 design Open Questions 2。
- 強化「讀取比對後以 crafted 的未來 version 搶寫」的理論競態（design Risks 第 3 條、Open Questions 4）。
- 修改前端、核心套件 schema、送出比分端點與重置端點。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `round-lifecycle`：修改「回合與送出比分的雲端 API」：
  - 「完成狀態不可經 PUT 改變」段落加入反向規則、版本相符才檢查的判定順序，以及拒絕時不送出 batch。
  - 新增四個 Scenario：改回未完成回 400 且不寫入、整輪替換時接受、只移除部分已完成場次時接受、版本過期時回 409 而非 400。

## Impact

- **後端程式**：`hono-pickball/src/matchmaker/round-repository.ts`（`keepsCompletedMatches`／`putRound`），不改其他檔案。
- **測試**：`hono-pickball/test/matchmaker-round.test.ts` 在 `describe("/api/matchmaker/round")` 內新增 4 個 it。**既有 it 的名稱與斷言一律不改**。
- **文件**：`hono-pickball/CLAUDE.md`（「matchmaker 回合、場次分槽與送出比分 API」的判定順序段落）。
- **API 契約**：只有「已完成場次經 PUT 改回未完成」這種請求由 200 改成 400，而前端沒有任何路徑會送出它。版本過期的請求照舊回 409。**非 BREAKING**。
- **相依／migration**：不新增任何第三方套件，沒有 migration。
- **訪客／正式站**：不受影響（auth 停用時使用者資料端點仍回 404）。
