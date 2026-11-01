# Design: round-put-completed-immutable

## Context

- **問題來源**：`openspec/changes/archive/2026-11-01-user-data-version-monotonic/design.md` Open Questions 2 是盤點時的附帶發現，當時建議另開 change，並以 TDD 新增「把已完成場次改回未完成回 400」的 scenario。
- **現況**：
  - `hono-pickball/src/matchmaker/round-repository.ts:54-64` 的 `keepsCompletedMatches(current, next)` 只檢查 `next.matches` 中 `status === "completed"` 的場次，要求每一場都能在 `current.matches` 找到 `completed` 且 `isDeepEqual` 的場次（`isDeepEqual` 以 `sortKeys` 消除 JSON 鍵順序差異，見 `:35-52`）。
  - `putRound`（`:80-118`）先 `getRound` 讀出目前回合（`:86`），檢查不通過就回 `{ kind: "invalid" }`，此時不送出 batch（`:87-89`）。
  - 檢查通過後送出 3 條陳述式的 batch：回合寫入（帶 `version = expectedVersion` 條件）→ 提高版本下限 → 孤兒分槽 DELETE（`:112`）。
  - 寫入影響 0 列時回 `conflict`。路由（`src/routes/matchmaker.ts:77-87`）把 `invalid` 對應到 `400 INVALID_BODY`、`conflict` 對應到 `409 VERSION_CONFLICT`。
- **缺口**：`current` 中 `completed` 的 `m2`，在 `next` 中以 `pending`（或 `scoring`）出現時，`next` 沒有任何 completed 場次需要比對，檢查直接通過，於是 PUT 回 200，`m2` 回到未完成。
  - 之後任何人都可以再對 `m2` 送出比分。`score-repository.ts` 的 batch 會插入第二筆 `(user_id, match_id)` 相同的歷史，違反主鍵而整批回滾，回 409。
  - 該場次在回合中永遠停在未完成、卻無法完成；評分與歷史則停在第一次送出的結果。主 spec 的字面要求「完成狀態不可經 PUT 改變」因此未被滿足。
- **既有測試涵蓋**（`hono-pickball/test/matchmaker-round.test.ts`）：
  - 「回合 PUT 改變場次完成狀態或已完成場次內容時回 400」測了 pending → completed、改已完成場次的比分、帶入不存在的已完成場次、version 0 建立含已完成場次的回合，四者都屬於正向規則。
  - 「回合 PUT 保留同 id 且內容相同的已完成場次」「回合 PUT 比對已完成場次時不受 JSON 鍵順序影響」是正向規則的接受路徑。
  - 「回合 PUT 不新增、不修改也不刪除任何歷史」把 `[m1, m2(completed)]` 整輪換成 `[n1, n2]` 並回 200，**已是整輪替換的 regression guard**。
  - 沒有任何測試涵蓋「改回未完成」。

### 盤點：前端送出 `PUT /api/matchmaker/round` 的所有路徑（證據）

唯一的送出點是 `nextjs-pickball/lib/sync/round-api.ts:31-37` 的 `putRemoteRound`，呼叫端只有 `lib/sync/round-command-queue.ts:150` 的 `sendPut`（`grep -rln "putRemoteRound\|putRound"` 在 `lib/`、`hooks/`、`components/`、`app/` 中，非測試檔只命中這兩個檔案，以及建立佇列的 `hooks/useRemoteRoundStore.ts:354`）。

佇列的關鍵性質：
- `planTransforms`（`round-command-queue.ts:131-145`）把排隊中的 transform 命令依序套用在**最新已確認的雲端回合** `confirmed.round` 上，不是套用在畫面上的樂觀回合。
- `confirmed` 只在 PUT 成功（`:153`）或送出比分成功（`:167`，取自伺服器回應的 `response.round`）時更新。
- 因此已確認回合中的 `completed` 場次，一律是伺服器寫入、並由伺服器回傳的那一份。
- **例外**：`generateRound` 的 apply 不使用傳入的已確認回合，直接回傳排入前以畫面上的樂觀回合（`previousRound: roundRef.current`）算好的 `result.round`（`useRemoteRoundStore.ts:405-421`）。
  這不影響本盤點的結論，因為該回合的場次 id 全是新的 UUID，前一輪的場次一律不會以同 id 出現；但不能據此推論「每條路徑都以已確認回合為基礎」。

場次 `status` 在非測試程式碼中只有兩個寫入點：
- 核心 `packages/pickball-core/src/matchmaker/round.ts:120` 的 `toRoundMatch` 建立 `pending`。
- `:1033` 的 `submitScore` 產生 `completed`。登入時，比分的完成走 `POST …/score`（`useRemoteRoundStore.ts:473` 排入 `submit` 命令），不經 PUT。
- `grep 'status: "scoring"'` 沒有任何命中，前端從不產生 `scoring`。

`hooks/useRemoteRoundStore.ts` 經 `commit`（`:394-399`）排入 transform 的路徑共六條：

| 路徑 | 位置 | 對已確認回合中 completed 場次的處理 | 會「保留 id 但改回未完成」？ | 會「只移除部分 completed」？ |
|---|---|---|---|---|
| 產生本輪／下一輪 | `generateRound` `:401-424`；核心 `createRound` `round.ts:264-336` | 整輪替換：`matches` 全由 `allocateRound` 的結果經 `toRoundMatch(match, newMatchId(), …)` 產生（`round.ts:315`），`newMatchId` 為 `crypto.randomUUID()`（`useRemoteRoundStore.ts:410`）。前一輪場次（含 completed）整個消失 | 否（id 全新） | 否（全部消失） |
| 重設與重排未完成場次 | `resetIncompleteMatches` `:426-445`；核心 `round.ts:556-656` | `keptMatches = matches.filter(status !== "pending")`（`:568`）原物件保留；只丟棄 pending、新場次 id 由 `createStableIdSource` 產生（`useRemoteRoundStore.ts:153-164`）；`[...keptMatches, ...reallocated]`（`:639`） | 否 | 否（completed 全數保留） |
| 臨時換人 | `swapMatchPlayer` `:540-558`；核心 `round.ts:1117-1194` | 只接受 `pending` 場次（`:1130`），以 `matches.map((m, i) => i === matchIndex ? updatedMatch : m)` 只替換該場（`:1188`） | 否 | 否 |
| 改目標分數 | `setTargetScore` `:478-496`；核心 `round.ts:375-381` | 有任一場次非 pending 就拒絕（`:376`）；成功時 `{ ...round, targetScore }` | 否（此時沒有 completed） | 否 |
| 改計時長度 | `setTimerDuration` `:498-516`；核心 `round.ts:418-424` | 同上（`:419`），只改 `timer` | 否 | 否 |
| 開始計時 | `startTimer` `:518-538`；核心 `round.ts:464-473` | 只改 `timer.startedAt`，`matches` 原樣 | 否 | 否 |

「開始計分鎖定目標分數」（主 spec「開始計分後鎖定本輪目標分數」）就是上表 `setTargetScore`／`setTimerDuration` 的拒絕條件，本身不送出 PUT。
送出比分（含計分板自動回填，主 spec「計分板結果的自動回填共用送出 pipeline」）在登入時走 `submit` 命令。
本機資料匯入走 `POST /api/import`，JSON 備份還原在登入時也走匯入。兩者都不經 `PUT /round`。

**盤點結論**：
1. 沒有任何正常路徑會「保留 id 但改回未完成」，所以加入反向規則不會擋下任何正常操作。
2. **「只移除部分 completed 場次、保留其他場次」在正常路徑中不存在**：completed 場次不是全數保留（重排、換人、設定、計時），就是整輪消失（產生下一輪）。
3. 整輪替換確實存在，也確實會讓前一輪的 completed 場次整個從新資料中消失，因此反向規則必須以「id 是否出現在新資料」為前提。

### 多裝置的時序（決定判定順序的依據）

裝置 A 的已確認回合為 v1 `[m1 pending, m2 pending]`。裝置 B 對 `m2` 送出比分後，伺服器變為 v2 `[m1 pending, m2 completed]`。A 接著在 `m1` 換人，佇列把換人套用在 A 的 v1 已確認回合上，送出 `PUT {[m1′, m2 pending], version: 1}`。

- **現況**：A 的新資料中沒有 completed 場次，正向檢查通過；寫入 `WHERE version = 1` 影響 0 列，回 409。
  `api-client.ts:48` 對應為 `conflict`，`useRemoteRoundStore.ts:290-296` 觸發 `load(true)` 整份重新載入，並顯示衝突提示。
- **若反向規則排在版本比對之前**：`m2` 在目前回合中為 completed、在新資料中為 pending，會回 400。
  - `api-client.ts:50-51` 對應為 `rejected`，佇列 `stop("rejected")` 清空命令，store 只把狀態設為 `rejected`（`useRemoteRoundStore.ts:133-134`），**不會重新載入**。
  - A 的已確認回合仍是 v1，之後每一個操作都會再得到 400。A 會一直卡住，直到使用者手動重新整理。
  - 這是多裝置最常見的情境（一台送出比分、另一台在操作同一輪），等於把一個既有、正確的 409 退化成 400。

因此反向規則**不得**排在版本比對之前（Decision 3）。

## Goals / Non-Goals

**Goals**
- 讓 `PUT /round` 無法把「目前回合中已完成的場次」以同 id 改回未完成，或改動其內容，以符合主 spec「完成狀態不可經 PUT 改變」。
- 整輪替換（產生下一輪）照舊接受；前端零改動。
- 版本過期的請求照舊回 409，觸發前端既有的整份重新載入。
- 每個新增的判斷分支，都有會在漏改或改錯時轉紅的測試。

**Non-Goals**
- 改變正向規則與版本比對的相對順序（B7 OQ16 由 coordinator 裁定維持，見 Open Questions 3）。
- 以歷史表封鎖「先移除再以同 id 加回」的兩步繞道（Open Questions 2）。
- 讓讀取比對與寫入對 crafted 的「未來 version」也完全無競態（Risks 第 3 條、Open Questions 4）。
- 修改前端、核心 schema、送出比分與重置端點。

## Decisions

### Decision 1：反向規則以場次 id 為鍵，「出現則不可變，不出現則不限」

**Choice**：只看目前回合中 `status === "completed"` 的場次 `c`；`next.matches` 中**每一場** `id === c.id` 的場次 `n` 都 MUST 滿足 `isDeepEqual(c, n)`（以 filter／every 逐場比較，不用 `find` 只取第一筆）。內容完全相同就隱含 `n.status === "completed"`。
`next.matches` 中沒有該 id 時不檢查。目前回合中未完成的場次不受反向規則限制，臨時換人（同 id 的 pending 場次內容改變）因此照常可行。
`RoundSchema.matches` 不檢查 id 唯一（`packages/pickball-core/src/matchmaker/round-types.ts:198`），所以 crafted 請求 `[m2 completed（相同）, m2 pending]` 會讓正向規則放行；逐場比較才能擋下它。比較沿用同檔既有的 `isDeepEqual`（`sortKeys` 後序列化），與正向規則同一份判斷，所以反向規則同樣不受 JSON 鍵順序影響。

**Rationale**：
- 以 id 對應，才能區分「同一場被改回未完成」（禁止）與「整輪換成新的場次」（允許），盤點結論 3 要求後者不能被擋下。
- 反向規則改用 `isDeepEqual` 而不只比 `status`，讓規則直接對應 spec 字面「MUST 仍為 completed 且內容完全相同」。
  - 內容被改、status 仍是 completed 的情況，正向規則本來就會擋下，所以「只比 status」與「比內容」對外行為相同（test-plan 把它列為等價變異的對照組）。
  - 選 `isDeepEqual` 是為了讓反向規則不依賴正向規則才完整。

**Alternatives considered**：
- **以位置（陣列索引）對應**：重排時 `matches` 依場地編號重新排序（`round.ts:639`），位置會變。不選。
- **以「內容相同的場次是否存在」取代 id 對應**（`next.matches.some(n => isDeepEqual(c, n))`）：等同要求所有 completed 場次都必須保留，整輪替換會被擋下。不選。
- **只比 `status`**：對外行為相同（見上），但規則的完整性要依賴正向規則。不選，僅作為等價對照。

### Decision 2：允許只移除部分已完成場次

**Choice**：不另加「要嘛全部保留、要嘛全部消失」的整體條件。只移除部分 completed 場次（其他 completed 場次以相同內容保留）時接受，新增 Scenario 固定此行為。

**Rationale**：
- 盤點結論 2：正常路徑不會產生部分移除，所以禁止或允許對前端都沒有影響。決策只取決於規則本身的語意與複雜度。
- 規則保護的是「已完成的場次不可被重新計分」。部分移除並沒有讓任何場次回到未完成，被移除的場次本身沒有被改動。
- 「全有全無」並不能多擋住任何繞道：無論部分移除或整輪移除，之後都可以再以同 id 加回未完成的場次（兩步繞道，Open Questions 2）。真正能封住繞道的是歷史表檢查，與「全有全無」無關。
- 單一的「逐場 id 判斷」比「先判定是否為整輪替換、再分支」少一個概念，實作與測試都較單純。

**Alternatives considered**：
- **全有全無**（目前回合的 completed id 要嘛全部出現且不變，要嘛全部不出現）：比較嚴格，可以擋下有 bug 的客戶端送出殘缺回合。但它要多引入「是否為整輪替換」的判定，也無法封住兩步繞道。不選，列為 Open Questions 1 供 coordinator 裁定；若改採此案，「只移除部分已完成場次時接受」這個 Scenario 要改成回 400。
- **以 `roundNumber` 判定整輪替換**（`roundNumber` 變了才允許 completed 消失）：`roundNumber` 由客戶端提供，伺服器無從驗證，也與「重排不改變回合編號」的既有規則交纏。不選。

### Decision 3：判定順序是「正向 → 版本相符才做反向 → 帶版本條件的 batch」

**Choice**：`putRound` 讀出 `current` 後依序判斷：
1. 正向規則不通過 → `invalid`（不論版本，與現況相同）。
2. `current !== null && current.version === expectedVersion` 且反向規則不通過 → `invalid`。
3. 其餘情況照舊送出 3 條陳述式的 batch，版本不符時 UPDATE／INSERT 影響 0 列，回 `conflict`；孤兒分槽清除照常執行。

兩種 `invalid` 都在 batch 之前回傳，不送出任何陳述式。

**Rationale**：
- **避免多裝置退化**（Context「多裝置的時序」）：版本不符的請求跳過反向規則，照舊由寫入判為 409，前端整份重新載入。
- **比對的正是要被取代的那一版**：版本相符時，反向規則比對的 `current` 就是帶 `version = expectedVersion` 條件的 UPDATE 要取代的列。
  若讀取之後回合被改動（例如另一裝置送出比分，version + 1），UPDATE 影響 0 列而回 409，不會把已完成的場次覆寫成未完成。
- **版本不符時跳過反向規則不會放過任何合法客戶端的寫入**：
  - 合法客戶端手上的 version 只來自伺服器回應。D1 單一主庫讀寫強一致；回合列的 version 只增不減，重置後重建取下限加一（`user-data-version-monotonic`）。
  - 所以「讀到的 version ≠ 請求的 version」時，請求必然比資料庫舊，帶版本條件的寫入必然影響 0 列。crafted 的「未來 version」見 Risks 第 3 條。
- **符合「比較本身必須在 SQL 內執行」的規則**（`hono-pickball/CLAUDE.md`「多表寫入用整批守衛」禁止事項）：反向規則只在「讀到的 version ＝ 請求的 version」時於 JS 端檢查，而寫入帶有 `WHERE version = <請求的 version>` 條件；兩者相等，所以寫入在 SQL 內比對的正是 JS 端檢查過的那一版，JS 端的判定並沒有取代 SQL 內的比較。
- **正向規則維持在版本比對之前**：B7 OQ16 已由 coordinator 裁定維持（`openspec/changes/archive/2026-10-24-matchmaker-round-score-backend/design.md` Open Questions 18①），本 change 不擴大範圍。
- **version 0（建立）**：`current` 為 null 時沒有 completed 場次可比；`current` 存在時 `0 !== current.version`，跳過反向規則，由 `onConflictDoNothing` 判為 409。兩者都與現況相同。

**Alternatives considered**：
- **反向規則排在版本比對之前**（與正向規則同一層、不看版本）：會造成 Context 所述的多裝置退化（409 → 400，前端卡在 rejected）。不選。
- **把整個完成狀態比對（正向與反向）都移到版本比對之後**：可以順便解決 OQ16，但會改變 coordinator 已裁定維持的既有行為與 `hono-pickball/CLAUDE.md` 的明文。不選，列為 Open Questions 3。
- **版本不符時直接回 409、不送 batch**：既有 it「回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出」要求過期請求同樣送出 3 條陳述式的 batch（`[3, 3]`），主 spec 也要求「不論該次 PUT 成功或因版本不符而未寫入」都執行分槽清理。不選。

### Decision 4：實作只動 `round-repository.ts`，拒絕時不送 batch

**Choice**：
- 在 `round-repository.ts` 內加入反向規則：可以是 `keepsCompletedMatches` 之外的同檔私有函式，或擴充該函式並傳入版本是否相符。命名與拆法交給 Implementer，Stage 2 依既有風格審查。
- 呼叫點在 `putRound` 既有的 `invalid` 早退位置。`PutRoundResult` 型別、路由檔、`orphanSlotCondition` 與 batch 內容都不改。
- 更新 `keepsCompletedMatches` 上方的 JSDoc 與 `putRound` 的 JSDoc，寫明兩個方向的規則與判定順序（「為什麼」）。

**Rationale**：缺陷完全位於 repository 的比對邏輯，`invalid` → 400 的對應早已存在。拒絕在 batch 之前回傳，回合、分槽與版本下限自然都不變，與既有正向規則的 invalid 分支一致。

**Alternatives considered**：
- 在路由層檢查：路由沒有讀出的 `current`，要多讀一次，也會把同一個不變式拆到兩處。不選。
- 用 SQL 在 batch 內以 `json_each` 比對（守衛式）：版本相符時讀取比對已經沒有競態（Decision 3），改成 SQL 只會增加複雜度。不選。

### Decision 5：測試放在既有的 `test/matchmaker-round.test.ts`

**Choice**：在 `describe("/api/matchmaker/round")` 內新增 4 個 it，名稱與 delta spec 的驗收錨點逐字相同。夾具沿用 `test/helpers/matchmaker-fixtures.ts`（`seedAndSignIn`、`seedRound(userId, round, version)`、`seedSlot`、`makeMatch`、`makeRound`、`rowsOf`），每個 it 使用各自的測試帳號 email（同檔共用一份 D1）。

**授權覆蓋表**（hono-pickball/CLAUDE.md「每個端點須有四類測試」）：本 change 不新增端點。
- 四類測試由既有 it 覆蓋，不重複：
  - 「auth 停用且無 DB binding 時回合、分槽與送出比分端點皆回 404」
  - 「未登入呼叫回合、分槽與送出比分端點皆回 401」
  - 「B 看不到也改不到 A 的回合與分槽」
  - `test/expected-user-guard.test.ts` 的列舉 it
- 反向規則讀的 `current` 來自既有的 `getRound(db, userId)`（帶 `user_id` 條件，`round-repository.ts:19-23`），他人資料隔離由上述既有 it 覆蓋，不另寫。

## Risks / Trade-offs

1. **[前端日後新增「保留 id 但改回未完成」的操作（例：撤銷已送出的比分）] → 會被 400 擋下。** 這正是規則的目的：撤銷比分涉及評分與歷史回滾，必須由後端權威端點處理，不能經 PUT。新增這類功能時要另開 change。
2. **[兩步繞道：先以 PUT 移除已完成的 `m2`（部分或整輪），再以 PUT 加回 `pending` 的 `m2`] → 反向規則擋不住。** 只有 crafted 請求會這樣做（前端的新場次 id 一律是隨機 UUID）。重新送出比分仍會被歷史主鍵擋成 409，評分與歷史不會被重複寫入。後果與本缺陷相同，但需要刻意構造。封堵方式列為 Open Questions 2。
3. **[crafted 的「未來 version」搶寫] → 理論上可繞過。**
   - 情境：讀到 v5（`m2` pending），請求帶 version 6、`m2` pending；讀取之後、batch 之前，另一請求剛好對 `m2` 送出比分並把回合推到 v6。此時 UPDATE `WHERE version = 6` 成功，`m2` 被改回 pending。
   - 這個時間窗與「反向規則排在版本比對之前」的寫法完全相同：讀到的 v5 中 `m2` 本來就是 pending，同樣會通過。所以 Decision 3 的閘門並沒有讓它變得更弱。
   - 合法客戶端不可能持有比資料庫新的 version。只有使用者本人能對自己的資料構造這種請求，而且必須精準搶在一次送出比分的時間窗內。
   - 後果被歷史主鍵限縮（同 2）。強化方式列為 Open Questions 4。
4. **[既有資料中已有被改回未完成的場次] → 本 change 不回溯修補。** 正式站尚未上線使用者資料（G1 前），本機 D1 只有測試資料，沒有修補的必要。之後這類回合照常可讀可寫；若再把它改回 completed，會被正向規則擋下，因為目前回合中它不是 completed。
5. **[反向規則在每次 PUT 都多一次對 `current.matches` 的掃描與序列化] → 可忽略。** 一輪最多 8 場（場地數上限），只有 completed 場次才需要序列化比對。

## Migration Plan

- 沒有 schema 或資料變更，不需要 migration。
- 部署：後端單獨部署即可（前端不變）；依 root `README.md` 的部署前檢查清單。
- 回滾：還原 `round-repository.ts` 的提交即可，沒有資料相容性問題（新規則只會拒絕寫入，不會產生新形狀的資料）。

## Open Questions

1. **（需 coordinator 裁定，建議維持本 design）部分移除是允許還是禁止**：本 design 採「允許」（Decision 2）。理由是正常路徑不存在部分移除，而「全有全無」擋不住兩步繞道。
   若 coordinator 改採「全有全無」，要改三處：delta spec 的「回合 PUT 只移除部分已完成場次時接受」改為回 400；test-plan 對應列改為 RED；tasks 2.1 改列入 2.2 的 RED。
2. **（需 coordinator 裁定是否另開 change）兩步繞道的封堵**：可以在 `putRound` 讀取時加查 `matchmaker_history`，規則是「新資料中未完成場次的 id，MUST NOT 已存在於本人的歷史」。
   - 這會引入新的跨表規則：匯入、重置後的歷史與回合的關係都要重新審視；送出比分被歷史主鍵擋下時，後果也已經被限縮。
   - 所以本 change 不做。建議 G1 前評估，或直接接受這個風險。
3. **（沿用 B7 OQ16，coordinator 已裁定維持）正向規則在版本比對之前**：
   - 停在舊回合的裝置若送出伺服器上已不存在的 completed 場次（例：另一裝置已產生下一輪，舊裝置再按「重排」），仍會先得到 400 → rejected，而不是 409 自動重載。
   - 本 change 沒有擴大這個情境（反向規則有版本閘門）。若要改，可以把正向規則也放到版本閘門之後（另開 change，並修改本 Requirement 的判定順序）。
4. **（需 coordinator 知悉，建議不做）crafted 未來 version 的強化**：在回合寫入的條件中再加上 `version = <讀出的 version>`（版本不符時寫入必然 0 列），就能讓「比對的那一版」與「被取代的那一版」恆等。
   - batch 仍是 3 條，`[3, 3]` 不變。
   - 但驗證它需要以 `afterRead` 式的鉤子模擬競態（同 `score-repository.ts` 的測試手法），會擴大本 change 的範圍。後果已被歷史主鍵限縮，所以建議不做。
5. **審查紀錄（propose 階段，2026-11-01，opus 獨立審查一輪，結論 PASS with fixes，已全數處置）**：
   - **必修 1（已修）**：mutation 漏掉「反向規則沒篩選 completed」。這種實作會擋下同 id pending 場次的臨時換人，卻能通過全部驗收。
     處置：「回合 PUT 只移除部分已完成場次時接受」的 `m3` 改為以同 id、內容改變（改到 2 號場地）的 pending 送出；新增 M12；Decision 1 寫明只看 completed。
   - **必修 2（已修）**：RED it 的「現況兩個 PUT 皆 200」與事實不符，實際是第一個 PUT 回 200 後版本遞增，之後的 PUT 都回 409。已更正 test-plan、execution-plan、tasks。
   - **建議（已採納）**：
     - spec 判定順序的字面改為「通過正向規則的版本不符請求」才一律回 409，並補上「依下述判定順序」。
     - 重複 id 逐場檢查：spec 改為「每一場」，RED it 加入重複 id 變體，新增 M13。
     - 版本過期 it 加入 version 3（crafted 未來 version）的 PUT，新增 M14 擋 `<=` 閘門。
     - test-plan 的混合 tier 列拆成 integration 與 unit 兩列。
     - 本節原本引用不存在的段落，改為本條。
     - Context 補上 `generateRound` 不以已確認回合為基礎的註記。
     - M9 的預期改為「至少包含」，M3 註明與 M1 等價。
     - spec 寫入敘述更正為「UPDATE／INSERT ON CONFLICT DO NOTHING」。
     - Decision 3 補上符合「比較在 SQL 內執行」規則的理由。
   - **審查確認無誤的項目**：
     - delta 以主 spec 全文為底、既有段落與 Scenario 全部保留。
     - 前端盤點完整，所有行號核對正確；重試、衝突重載、樂觀回合、匯入、備份還原、計分板回填都不經 PUT /round 產生「同 id 改回未完成」。
     - Decision 3 的多裝置推理與各種 version 邊界正確，且與 B7 OQ16／18① 相容。
     - 2.1 的 regression guard 宣稱與 2.2 的真紅宣稱正確，C1、C2 確實等價。
6. **（apply 階段發現，需 coordinator 知悉，建議不在本 change 補）反向規則外層「每一場」的量詞沒有被測試釘住**：Stage 2 追加的變異 M16（把「目前回合每一場 completed 都要通過」寫成 `length === 0 || some(...)`）存活。
   - 原因：四個新 it 與既有 it 都沒有「目前回合有 ≥2 場 completed，只改回其中一場、另一場以相同內容保留」的情境。
   - 實務風險低：不加空清單守門的 `some` 會被大量既有 it 擋下；M16 這種寫法要刻意構造。test-plan 的 M1～M14 全數轉紅、C1／C2 存活，符合 test-plan 承諾。
   - 若要補強：另開 change 或由 coordinator 裁定在本 change 加一個 regression guard it（種子多放一場 completed 的 `m0`，新資料保留 `m0` 不變、只改回 `m2`，預期 400）。本 change 未自行加入，因為 test-plan 未列此 it、既有斷言與 it 名稱依 test-plan 逐字對齊。

   **Coordinator 裁定（合併前）**：OQ6 不另開 change，於本 change 直接補上 Scenario「回合 PUT 在多場已完成場次中只把其中一場改回未完成時仍回 400」、test-plan 列與對應 it（regression guard，寫入即綠）。
   以單一 it 實跑：M16（外層 `every` 改 `some`）與「只檢查第一場已完成場次」（`.slice(0, 1)`）皆轉紅；對照組（多一層恆真 `filter`）維持綠。
