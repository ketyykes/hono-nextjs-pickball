# Specification: data-transfer

## MODIFIED Requirements

### Requirement: 清除本機資料與其確認流程

資料頁 SHALL 提供「清除本機資料」操作。按下後 MUST 顯示明確確認提示，載明**資料無法復原**
並**建議先匯出 JSON 備份**（`prd.md` §10、12.4）。使用者取消時 SHALL NOT 改變任何資料。

確認提示 MUST 額外說明「JSON 備份不包含 `/scoreboard` 進行中的逐球計分進度」——清除範圍含
計分板資料，但 JSON 備份的五個區塊不含它，不講清楚等於讓使用者以為備份已涵蓋全部。此句
**涵蓋計分板的全部進度**：獨立計分板的進度，以及（若 `scoreboard` capability 已引入分槽）
由對戰場次進入的各場進度，兩者皆不在備份的五個區塊內。因此分槽 key 出現後**不需**另加第二句
文案，只需確認本句仍為真。

本操作與 `player-roster` 的「重置名單」是 `prd.md` §10 表格中**不同的兩列**，MUST 各自
獨立：入口不同（資料頁 vs 參賽者頁）、清除範圍不同（全部本機資料 vs matchmaker 資料）、
確認文案不同。本 requirement SHALL NOT 改寫「重置名單」的行為。

清除範圍 MUST 以**列舉的 key 清單**實作，SHALL NOT 使用 `localStorage.clear()`，也
SHALL NOT 使用前綴掃描。清單的**涵蓋範圍 MUST 為「本 app 寫入 LocalStorage 的全部 key」**
（`prd.md` §10「清除本機資料 → 全部 LocalStorage 資料」）；本 requirement 承諾的是**結果**
（本 app 的資料被清乾淨），列舉只是達成結果的手段，SHALL NOT 被理解為固定筆數的白名單。

撰寫本 spec 時已知的 key 為下列四個：

| key | 匯出該常數的模組 |
|---|---|
| `matchmaker:roster:v1` | `nextjs-pickball/lib/matchmaker/storage-keys.ts` |
| `matchmaker:round:v1` | 同上 |
| `matchmaker:history:v1` | 同上 |
| `scoreboard:current:v1` | `nextjs-pickball/lib/scoreboard/storage.ts` |

計分板的**分槽 key**（`scoreboard:matches:v1`，由
`nextjs-pickball/lib/scoreboard/match-slots.ts` 匯出）為**硬前置**：清單 MUST 一併納入該 key，
它不是「若已存在才納入」的選配項。該模組不存在時，實作 MUST 停止並回報，
SHALL NOT 靜默地只納入上表四個 key。
漏掉它的失敗模式是「清除本機資料」留下全部分場計分槽——那正是分槽 capability 自己警告的
孤兒條目與 LocalStorage 無界累積，也與本操作「回到空白狀態」的承諾及 `prd.md` §10 的
「全部 LocalStorage 資料」相違。

每個 key 的字面值 MUST 取自上述模組匯出的常數，SHALL NOT 在本 capability 重複寫死字串——
key 名稱多一處來源就多一處漏改，而漏改的失敗模式是「清除看起來成功了，殘留資料要到下次
使用時才冒出來」。

`localStorage.clear()` 會一併刪除本 app 從未寫入的 key（其他來源寫入本網域的資料、未來的
純顯示偏好），而使用者無從檢視被刪掉了什麼；列舉清單則強制在新增任何資料域時主動決定它是否
屬於清除範圍，與 `player-roster` 重置範圍的既有原則一致。

**不屬清除範圍的 key**：`auth` 的上次登入提示（`auth:signed-in-hint:v1`，常數 `SIGNED_IN_HINT_STORAGE_KEY` 匯出自 `nextjs-pickball/lib/auth/session-hint.ts`）
SHALL NOT 列入清單。它不是使用者資料（只存固定值、不含任何個資），生命週期跟隨 session——登入確認時寫入、登出或確認未登入時清除（`auth`「上次登入提示的儲存與清除」）；
「清除本機資料」不會登出，登入中清掉它只會在下一次 session 確認時被寫回，徒增一次重新整理時的本機畫面閃現。上述「涵蓋本 app 寫入 LocalStorage 的全部 key」的承諾以本段為唯一例外。

清除完成後參賽者頁與場次頁 MUST 呈現空白狀態（`prd.md` §10）。

實作位於 `nextjs-pickball/lib/matchmaker/transfer-storage.ts` 與
`nextjs-pickball/components/matchmaker/ClearLocalDataDialog.tsx`。

#### Scenario: 確認提示載明無法復原並建議先匯出

- **WHEN** 在資料頁按下「清除本機資料」
- **THEN** 出現確認提示，內容同時包含「無法復原」與「建議先匯出 JSON 備份」
- **AND** 提示 MUST 說明 JSON 備份不含 `/scoreboard` 的計分進度
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「清除本機資料的確認提示載明無法復原、建議先匯出並說明備份不含計分進度」

#### Scenario: 確認後本 app 寫入的全部已知 key 皆被移除

- **GIVEN** LocalStorage 中本 app 會寫入的全部 key 皆有內容——該集合由
  `nextjs-pickball/lib/matchmaker/storage-keys.ts` 與 `nextjs-pickball/lib/scoreboard/`
  下各 storage 模組**匯出的 key 常數**逐一取得，而非在測試中另抄一份字面值
- **WHEN** 呼叫 `clearAllLocalData()`
- **THEN** 該集合中的 key 全數被移除
- **AND** 測試 MUST 另行斷言「`CLEAR_ALL_KEYS` 的集合與上述來源模組匯出的 key 常數集合相等」，
  SHALL NOT 斷言固定的 key 數量——寫死數量時，新增資料域（例如計分板分槽 key）而忘了納入
  清單的情況仍會是綠燈，此 Scenario 就失去它唯一的偵測力
- **驗收**：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，it 名稱「clearAllLocalData 移除本 app 寫入的全部 LocalStorage key」

#### Scenario: 清除不動列舉範圍以外的 key

- **GIVEN** LocalStorage 另有一個不屬於清單的 key
- **WHEN** 呼叫 `clearAllLocalData()`
- **THEN** 該 key 的內容完全不變
- **AND** 實作 MUST NOT 呼叫 `localStorage.clear()`
- **驗收**：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，it 名稱「clearAllLocalData 不呼叫 clear，列舉範圍外的 key 完全不受影響」

#### Scenario: 取消清除不動任何資料

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 按下「清除本機資料」後於確認提示中取消
- **THEN** 參賽者頁的名單與清除前完全相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「取消清除本機資料後名單維持不變」

#### Scenario: 清除後回到空白狀態

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 確認清除本機資料
- **THEN** 參賽者頁顯示空白狀態與新增入口
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「確認清除本機資料後參賽者頁回到空白狀態」

#### Scenario: 清除本機資料不移除上次登入提示

- **GIVEN** LocalStorage 有上次登入提示（`SIGNED_IN_HINT_STORAGE_KEY` 為 `"1"`）與名單資料
- **WHEN** 呼叫 `clearAllLocalData()`
- **THEN** 名單 key 被移除；上次登入提示仍為 `"1"`；`CLEAR_ALL_KEYS` 不含 `SIGNED_IN_HINT_STORAGE_KEY`
- **驗收**：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，it 名稱「regression guard：clearAllLocalData 不移除上次登入提示」
