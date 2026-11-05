# Proposal: target-score-lock-current-round

## Why

訪客在計分板把某場打到一半（槽為 `playing`）後，回對戰頁改用手動送出比分、或直接按「產生本輪對戰」產生下一輪時，舊場次的計分板槽會留在 `scoreboard:matches:v1`；
`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 的 `isTargetScoreLocked` 以 `Object.values(slots)` 檢查**全部**分槽，於是新一輪一產生，目標分數與計時控制項就被鎖死並顯示「本輪已開始計分，目標分數不可更改。」，使用者沒有任何解除手段。
主 spec `round-lifecycle`「開始計分後鎖定本輪目標分數」寫的是「**該輪**任一場次的計分板槽」，實作比規格寬，是 bug。

## What Changes

- `isTargetScoreLocked(round, slots)` 的第二條（計分板槽已離開 `"setup"`）只計入**鍵為本輪場次 `id`** 的槽；非本輪的槽不論狀態皆不計入。第一條（任一場次非 `pending`）不變。
- 計時設定的鎖定委派同一個函式（主 spec「回合計時器」），一併修正；登入（雲端）模式的鎖定同樣經過這個函式，一併受益（雲端後端本來就會刪除孤兒分槽，實務上不受此 bug 影響）。
- 主 spec 的 MODIFIED：在「開始計分後鎖定本輪目標分數」補上「非本輪場次的槽 SHALL NOT 計入、以槽的鍵比對」的規範句與五個新 Scenario（四個 unit、一個 E2E）；既有 Scenario 與其驗收錨點一字不動。
- **推翻一個既有的測試層取捨**：`scoreboard-binding.test.ts` 的 it「槽已不在回合中但非 setup 時仍判定為鎖定」刻意釘住「孤兒槽也鎖定」（fail-closed），且其註解要求「需先回到 spec 討論」——本 change 即是該討論的結論，該 it **刪除**，由新 it「前一輪殘留的計分板槽不鎖定新一輪的目標分數」承接同一組輸入的相反期望（理由見 design Decision 2）。

### 明確不做

- 不在「產生新一輪」或「手動送出比分成功」時清除不再屬於本輪或已完成場次的本機分槽（孤兒清理另案處理；理由與殘留影響見 design Decision 3 與 Non-Goals）。
- 不加產生新一輪前的確認對話框、不持久化本輪設定、不改「不計時」選項。
- 不改後端、不改 `packages/pickball-core`、不改 `RoundControls.tsx`／`app/matchmaker/page.tsx`／`hooks/**`、不新增相依、無 migration。
- 不 MODIFY `round-lifecycle`「回合計時器」與 `match-stage` 兩個 Requirement 內對鎖定條件的括號摘要（兩者皆明文「判定條件見『開始計分後鎖定本輪目標分數』」，見 design Decision 4）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `round-lifecycle`：「開始計分後鎖定本輪目標分數」——第二條限定為本輪場次的槽、以槽的鍵比對；新增五個 Scenario。

## Impact

- **前端產品程式碼（只改一檔）**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 的 `isTargetScoreLocked`（含其 JSDoc）。
- **測試**：
  - `nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`：新增 4 個 it（三個真紅、一個 regression guard）；**授權刪除** 1 個既有 it「槽已不在回合中但非 setup 時仍判定為鎖定」（連同其上方說明註解）。前端測試數淨增 3。
  - `nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`：新增 1 條 test（五個 browser project 各 +1）。
  - 其餘既有 it／test 一行不改（含 `RoundControls.test.tsx` 的鎖定 it、`match-stage.spec.ts` 與 `user-data/round-sync.spec.ts` 的鎖定斷言——它們的槽鍵皆為本輪場次 id，維持綠）。
- **文件**：`nextjs-pickball/CLAUDE.md` 沒有描述鎖定判定條件的段落（唯一提及處「回填與鎖定判定以 `remoteMatchSlots` 為來源」仍正確），不改；於 tasks 記錄查核結果。
- **相依**：不新增。**migration**：無。**後端／核心套件**：零變更。
- **使用者可見**：訪客在前一輪留下計分中的場次後產生下一輪，目標分數與計時設定不再一開始就被鎖死。
