## Why

主 spec `scoreboard`「本機模式的 localStorage 持久化」宣稱雲端模式 SHALL NOT 讀取或寫入 `scoreboard:current:v1` 與 `scoreboard:matches:v1`，與實作不符。
`useScoreboardStore` 選擇器每次 render 都呼叫本機實作（hooks 不可條件式呼叫），本機實作 mount 時會讀這兩個 key、依損壞資料規則清除或逐筆降級，並可能把讀到的合法狀態以相同內容寫回。
真正成立的保證是「使用者操作不改變這兩個 key」，與 `player-roster` 對 `matchmaker:roster:v1` 的既有措辭一致。

## What Changes

- `scoreboard`「本機模式的 localStorage 持久化」：雲端模式段落改為「使用者操作 SHALL NOT 改變兩個 key 的內容」，並說明本機實作仍掛載、mount 時的讀取、降級與同內容回寫。
- 純措辭修改，其餘條文、Scenario 與驗收錨點逐字不變；不改程式碼、測試、相依。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `scoreboard`：「本機模式的 localStorage 持久化」的雲端模式說明，行為不變。

## Impact

- 只有 `openspec/specs/scoreboard/spec.md`（經 archive 合併）。無程式碼、測試、E2E、相依變動。
- 既有驗收「雲端模式下 dispatch 不寫入 scoreboard:current:v1」與兩條「不寫入本機」E2E 正好對應修正後的措辭。
