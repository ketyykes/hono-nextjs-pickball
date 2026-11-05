# Proposal: court-score-entry-submit-a11y

## Why

對戰頁每個場地的手動比分輸入（`nextjs-pickball/components/matchmaker/ScoreEntry.tsx` :45-82）沒有包在 `<form>` 內、送出按鈕為 `type="button"`，
在比分欄位按 Enter 不會送出，只能用滑鼠／觸控點「送出比分」——與主 spec `match-stage`「對戰頁的可用性與無障礙」的「所有功能 SHALL NOT 只能以滑鼠操作」精神不符，鍵盤使用者要多按一次 Tab 才能送出。

同時，`CourtCard.tsx` :309-315 讓每個場地都以同一組 `TEAM_LABELS` 渲染 `ScoreEntry`，欄位名稱皆為「第一隊比分」「第二隊比分」、按鈕皆為「送出比分」；
同一頁有多個場地時，螢幕閱讀器使用者無法從控制項本身得知正在填哪一場。主 spec「對戰頁的可用性與無障礙」只要求可存取名稱**非空**，對「多場地之間可區分」與 Enter 送出沉默。

## What Changes

- 比分輸入改以 `<form onSubmit>` 包住，`preventDefault` 後走既有 `onSubmitScore(rawA, rawB)` 路徑；送出按鈕改為 `type="submit"`。按 Enter 與點按鈕走同一個函式，驗證與錯誤訊息行為不變（驗證仍歸屬回合 capability）。
- 兩個比分欄位與送出按鈕包進一個 `role="group"` 的容器，`aria-label` 為「第 N 場地比分」（N 為該場地的 `courtNumber`）；**欄位與按鈕本身的可見文字與可存取名稱維持「第一隊比分」「第二隊比分」「送出比分」不變**（design Decision 2）。
- `ScoreEntry` 新增必填 prop `groupLabel: string`，由 `CourtCard` 以 `match.courtNumber` 組字傳入。
- `match-stage` 新增一個 Requirement「手動比分輸入的鍵盤送出與場地區分」（ADDED，四個 unit Scenario、一個 E2E Scenario）。

### 明確不做

- 不改比分輸入的版面、尺寸、數字鍵盤樣式（`inputMode` 不動）；不改其他頁面的表單。
- 不改送出比分的資料流（`CourtCard.handleScoreSubmit` → `onSubmitScore(match.id, …)`）、不改 `lib/matchmaker/round.ts` 的驗證、不改 hooks、不改後端與 `packages/pickball-core`。
- 不改既有欄位與按鈕的可存取名稱（不採「第 N 場地第一隊比分」方案，見 design Decision 2）。
- 不 MODIFY「手動輸入比分與送出」「對戰頁的可用性與無障礙」兩個既有 Requirement（新增獨立 Requirement，既有 Scenario 與驗收錨點一字不動）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `match-stage`：ADDED Requirement「手動比分輸入的鍵盤送出與場地區分」。

## Impact

- **前端產品程式碼（兩檔）**：`nextjs-pickball/components/matchmaker/ScoreEntry.tsx`（`<form>`、`type="submit"`、具名群組、`groupLabel` prop）、`nextjs-pickball/components/matchmaker/CourtCard.tsx`（傳入 `groupLabel`，約 :309-315 一處）。
- **測試**：
  - `nextjs-pickball/components/matchmaker/CourtCard.test.tsx`：新增 4 個 it（三個真紅、一個 regression guard）。
  - `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`：新增 1 條 test（五個 browser project 各 +1）。
  - 既有 it／test **一行不改**：propose 時以「第一隊比分／第二隊比分／送出比分」定位的測試共約 89 行（`CourtCard.test.tsx` 25 行；E2E 64 行，分布於 `match-stage`／`round-timer`／`scoreboard-binding`／`visual-export` 與 `user-data` 四檔），方案 (a) 不改名稱，全部維持綠。
- **文件**：`nextjs-pickball/CLAUDE.md` 若有描述 `ScoreEntry` 的段落則同步（tasks §3 查核）。
- **相依**：不新增。**migration**：無。**後端／核心套件**：零變更。
- **並行 proposal**：`round-settings-follow-round`、`round-timer-clear` 皆不改 `ScoreEntry.tsx`；若其一改到 `CourtCard.tsx` 或 `match-stage.spec.ts`，屬不同段落，合併順序不拘，由 coordinator 於 §1 對齊時確認。
- **使用者可見**：鍵盤使用者在比分欄位按 Enter 即可送出；螢幕閱讀器進入比分區時會讀出「第 N 場地比分」。
