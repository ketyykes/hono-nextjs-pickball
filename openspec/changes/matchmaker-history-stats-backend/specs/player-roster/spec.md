## MODIFIED Requirements

### Requirement: 重置名單與二次確認

參賽者頁 SHALL 提供「重置名單」操作，按下後 MUST 顯示明確確認提示，載明資料無法復原。

使用者確認後，系統 SHALL 清除本機所有屬於重置範圍的資料並回到空白初始狀態；使用者取消時 SHALL NOT 改變任何資料。

重置範圍 MUST 以**列舉的 key 清單**實作，SHALL NOT 使用 `matchmaker:` 前綴掃描 —— 前綴掃描會誤刪未來加入且不該被重置的使用者偏好，而列舉清單強制在新增資料域時主動決定它是否屬於重置範圍（見 design Decision 6）。前綴掃描在本次變更後另有一個更硬的理由不可用：重置範圍已跨出 `matchmaker:` 前綴（見下）。

目前的清單為四個 key：`matchmaker:roster:v1`（參賽者名單）、`matchmaker:round:v1`（目前回合）、`matchmaker:history:v1`（歷史賽果）與 `scoreboard:matches:v1`（對戰場次的計分板分槽），對應 `prd.md` 4.1.5 與第 10 節要求清除的「全部參賽者、目前回合與歷史賽果」。回合與歷史屬於重置範圍是產品明文決策，SHALL NOT 只清名單而讓上一場活動的回合與賽果殘留 —— 使用者按下重置的語意是「重新開始一場活動」，殘留的回合會在下一次產生對戰時被當成上一輪納入重複比對基準，而那些人可能已經不在名單裡。

`scoreboard:matches:v1` 於本次變更納入清單：該 key 的每個條目都以某個對戰場次的 id 為索引，回合被清掉後那些條目即成孤兒——使用者從舊分頁或書籤回到 `/scoreboard?match=<舊 id>` 會看到一個仍可計分、但分數永遠回填不到任何地方的計分板，且孤兒條目會無界累積在 LocalStorage 中（見 `round-lifecycle` capability 的「重排本輪或重置名單時清除對應計分板進度」Requirement）。

四個 key 的名稱 MUST 取自同一個來源模組，SHALL NOT 在本檔重複寫死字串 —— key 名稱多一處來源就多一處漏改，而漏改的失敗模式是**沉默的**：重置看起來成功了，殘留的資料要到下一輪產生對戰時才顯現。`scoreboard:matches:v1` 的字面值 MUST 取自 `nextjs-pickball/lib/scoreboard/` 的分槽 key 具名匯出（`match-slots.ts` 的 `MATCH_SLOTS_KEY`，見本 change 的 `scoreboard` delta），由 matchmaker 側的 key 清單模組 import 後併入，SHALL NOT 在 matchmaker 側再寫一次字串——同一個 key 出現兩份字面值時，改版（`:v2`）只會改到其中一份。

`scoreboard:current:v1` **不**在重置範圍內：獨立計分板的進度與分配機的活動無關，一併清掉會讓使用者正在進行的個人比賽無故歸零。重置範圍涵蓋分槽 key 而不涵蓋獨立槽，正是「一場一槽」與「全站唯一一場」兩種語意的分界所在。

**登入時（雲端模式，`user-data-sync`「前端依 session 選擇儲存模式」）**：確認後系統 MUST 呼叫 `POST /api/matchmaker/reset`
（後端在單一 batch 內刪除雲端的名單、回合、分槽與歷史，見 `round-lifecycle`「回合與送出比分的雲端 API」），
**成功後**才清空畫面上的名單。登入時 SHALL NOT 清除任何本機 key（`RESET_KEYS` 的四個 key 皆不動）——雲端模式的名單、回合、分槽與歷史皆不讀寫本機，
本機資料是訪客時期的資料，清掉會讓之後的「匯入本機資料」無資料可匯。B6 的過渡函式 `resetLocalMatchProgress()` 已於 B8 刪除。呼叫失敗時（`requestJson` 結果為 `failed`、`rejected` 或 `conflict` 皆同；重置不可逆，SHALL NOT 自動重試）名單 MUST 保持不變並回報 `rejected`（顯示「雲端拒絕儲存，請重新整理頁面」）；結果為 `unauthorized` 時改為呼叫 `onUnauthorized`。

實作位於 `nextjs-pickball/lib/matchmaker/storage.ts`、`nextjs-pickball/lib/matchmaker/storage-keys.ts` 與 `nextjs-pickball/components/matchmaker/ResetRosterDialog.tsx`。雲端分支位於 `nextjs-pickball/hooks/useRemoteRosterStore.ts`。

#### Scenario: 確認重置後名單清空

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 按下「重置名單」並於確認提示中確認
- **THEN** 名單回到空白狀態，且 `matchmaker:roster:v1` 已從 LocalStorage 移除
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「確認重置後名單清空且持久化資料被移除」

#### Scenario: 取消重置不動任何資料

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 按下「重置名單」後於確認提示中取消
- **THEN** 名單內容與重置前完全相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「取消重置後名單維持不變」

#### Scenario: 重置只清除列舉範圍內的 key

- **GIVEN** LocalStorage 同時存在 `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`、`scoreboard:matches:v1` 與 `scoreboard:current:v1`
- **WHEN** 呼叫 `resetMatchmakerData()`
- **THEN** 三個 `matchmaker:` key 與 `scoreboard:matches:v1` 皆被移除
- **AND** `scoreboard:current:v1` **不受影響**
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「重置只移除列舉的四個 key，不影響獨立計分板資料」

#### Scenario: 登入時重置名單

- **GIVEN** 雲端模式，名單已載入 3 位，`POST /api/matchmaker/reset` 回 204
- **WHEN** 呼叫 `resetRoster()`
- **THEN** 該 POST 被呼叫一次；名單變為空、`syncStatus` 為 `synced`；本機 `RESET_KEYS` 的四個 key 與 `scoreboard:current:v1` 皆保留
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「resetRoster 成功後清空名單且不清除任何本機資料」

#### Scenario: 登入時重置失敗不動名單

- **GIVEN** 雲端模式，名單已載入 3 位，`POST /api/matchmaker/reset` 回 500
- **WHEN** 呼叫 `resetRoster()`
- **THEN** 名單仍為 3 位、`syncStatus` 為 `rejected`；本機任何 key 皆未被移除
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「resetRoster 失敗時名單不變並回報 rejected」

#### Scenario: 登入時重置名單清空雲端並保留本機訪客名單

- **GIVEN** 以測試帳號登入，雲端名單有 2 位；瀏覽器的本機 `matchmaker:roster:v1` 有一份訪客名單
- **WHEN** 在參賽者頁按「重置名單」並確認，之後重新整理
- **THEN** 參賽者頁為空白狀態；本機 `matchmaker:roster:v1` 內容與重置前相同
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入時重置名單清空雲端名單並保留本機訪客名單」

#### Scenario: 登入時重置名單後對戰頁沒有回合

- **GIVEN** 以測試帳號登入，已產生一輪並完成一場
- **WHEN** 在參賽者頁確認重置名單後開啟 `/matchmaker`
- **THEN** 對戰頁沒有任何場地卡；`GET /api/matchmaker/round` 回 `{ data: null, version: 0 }`、`GET /api/matchmaker/slots` 回空清單
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「登入時重置名單後雲端回合與分槽一併清除」
