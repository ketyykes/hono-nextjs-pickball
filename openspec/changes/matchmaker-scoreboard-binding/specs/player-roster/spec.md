## MODIFIED Requirements

> 本 Requirement 的基底為 `matchmaker-round-lifecycle`（M4）的 MODIFIED 版本（三個 key），
> 而非目前主 spec 的單一 key 版本——本 change 從已含 M4 的 `main` 開出，以更早的版本為基底
> 會在 archive 時把 M4 對本 Requirement 的修訂整段回退。

### Requirement: 重置名單與二次確認

參賽者頁 SHALL 提供「重置名單」操作，按下後 MUST 顯示明確確認提示，載明資料無法復原。

使用者確認後，系統 SHALL 清除本機所有屬於重置範圍的資料並回到空白初始狀態；使用者取消時 SHALL NOT 改變任何資料。

重置範圍 MUST 以**列舉的 key 清單**實作，SHALL NOT 使用 `matchmaker:` 前綴掃描 —— 前綴掃描會誤刪未來加入且不該被重置的使用者偏好，而列舉清單強制在新增資料域時主動決定它是否屬於重置範圍（見 design Decision 6）。前綴掃描在本次變更後另有一個更硬的理由不可用：重置範圍已跨出 `matchmaker:` 前綴（見下）。

目前的清單為四個 key：`matchmaker:roster:v1`（參賽者名單）、`matchmaker:round:v1`（目前回合）、`matchmaker:history:v1`（歷史賽果）與 `scoreboard:matches:v1`（對戰場次的計分板分槽），對應 `prd.md` 4.1.5 與第 10 節要求清除的「全部參賽者、目前回合與歷史賽果」。回合與歷史屬於重置範圍是產品明文決策，SHALL NOT 只清名單而讓上一場活動的回合與賽果殘留 —— 使用者按下重置的語意是「重新開始一場活動」，殘留的回合會在下一次產生對戰時被當成上一輪納入重複比對基準，而那些人可能已經不在名單裡。

`scoreboard:matches:v1` 於本次變更納入清單：該 key 的每個條目都以某個對戰場次的 id 為索引，回合被清掉後那些條目即成孤兒——使用者從舊分頁或書籤回到 `/scoreboard?match=<舊 id>` 會看到一個仍可計分、但分數永遠回填不到任何地方的計分板，且孤兒條目會無界累積在 LocalStorage 中（見 `round-lifecycle` capability 的「重設本輪或刪除場次時清除對應計分板進度」Requirement）。

四個 key 的名稱 MUST 取自同一個來源模組，SHALL NOT 在本檔重複寫死字串 —— key 名稱多一處來源就多一處漏改，而漏改的失敗模式是**沉默的**：重置看起來成功了，殘留的資料要到下一輪產生對戰時才顯現。`scoreboard:matches:v1` 的字面值 MUST 取自 `nextjs-pickball/lib/scoreboard/` 的分槽 key 具名匯出（`match-slots.ts` 的 `MATCH_SLOTS_KEY`，見本 change 的 `scoreboard` delta），由 matchmaker 側的 key 清單模組 import 後併入，SHALL NOT 在 matchmaker 側再寫一次字串——同一個 key 出現兩份字面值時，改版（`:v2`）只會改到其中一份。

`scoreboard:current:v1` **不**在重置範圍內：獨立計分板的進度與分配機的活動無關，一併清掉會讓使用者正在進行的個人比賽無故歸零。重置範圍涵蓋分槽 key 而不涵蓋獨立槽，正是「一場一槽」與「全站唯一一場」兩種語意的分界所在。

實作位於 `nextjs-pickball/lib/matchmaker/storage.ts`、`nextjs-pickball/lib/matchmaker/storage-keys.ts` 與 `nextjs-pickball/components/matchmaker/ResetRosterDialog.tsx`。

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
