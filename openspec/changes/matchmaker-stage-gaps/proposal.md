## Why

本 change 是「對戰分配機」交付序的 **milestone M10（對戰頁三個已知缺口）**，是 M10～M15 這一批（本輪功能探索，2026-09-03）的第一棒，位置如下：

```
M1 參賽者名單（已合併）→ M2 分配引擎（已合併）→ M3 評分引擎 → M4 回合生命週期
   → M5 對戰畫面 → M6 場邊計分銜接 → M7 歷史頁 → M8 資料匯入匯出 → M9 JPG／PDF 匯出
   →【M10 對戰頁三個已知缺口（本 change）】→ M11 player-stats → M12 scoreboard-team-labels
   → M13 player-swap → M14 round-timer → M15 timed-draw
```

**執行相依**：本 change 相依 `main @ 3fa2d22`（M3～M9 皆已合併並歸檔）。本 change 是本批（M10～M15）的第一棒，**不相依批次內其他 change**——與其餘五棒不同，其餘五棒各自的 proposal 須寫「前一棒 M(n-1) MUST 已合併回 main」，M10 沒有這個前提。

本 change 修補的三個缺口皆為**已合併程式碼裡明確標記、但尚未有畫面消費或測試覆蓋**的既有已知事實，出處分別是：

1. **`round.matches` 為空時畫面無說明文字**——出處 `matchmaker-runbook.md`「M5 留下的三項已知缺口」第 3 條。已以程式碼逐層追蹤確認此狀態**可達**（見下方「What Changes」第一項與 design.md Context）：`lib/matchmaker/round.ts` 的 `resetIncompleteMatches` 在候選池不足以組成任何一場時，依 `lib/matchmaker/candidates.ts` 的 `selectPlaying` 與 `lib/matchmaker/allocation.ts` 的既有邊界行為（M2，「人數不足與空名單 SHALL NOT 拋錯」）回傳空的 `matches` 陣列而**不判定失敗**；此時 `components/matchmaker/MatchStage.tsx` 目前直接把空陣列 `.map()` 成一個沒有任何子節點的網格，畫面上除了休息名單外空無一物、沒有任何文字說明。
2. **`page.tsx` 未消費 `droppedCount`**——出處同上「M5 留下的三項已知缺口」第 1 條，並經 `archive/2026-09-03-matchmaker-history-page/design.md` 的 **Open Questions 第 2 條**確認並延續其裁決：「`readHistory()` 回報的 `droppedCount > 0` 時，歷史頁要不要顯示『有 N 筆資料損毀已略過』？……本 change **刻意不承諾**顯示行為……該有自己的 requirement 與驗收……apply 時若發現此缺口，MUST 記錄於此節並回報，SHALL NOT 順手實作」。`hooks/useRoundStore.ts` 至今仍在頂端註解寫著「本 change（對戰頁）尚未在畫面上消費這個值，是已知缺口，**留給後續處理歷史頁面的 change**」——本 change 就是那個「後續」。
3. **「重設／再排」在 E2E 零覆蓋**——出處同上「M5 留下的三項已知缺口」第 2 條。`round-lifecycle` 與 `match-stage` 兩份主 spec 皆已有涵蓋此行為的 Requirement 與單元／元件層測試（`lib/matchmaker/round.test.ts`、`components/matchmaker/RoundControls.test.tsx`），但 `tests/e2e/specs/match-stage.spec.ts` 至今只在一條無關測試裡順手斷言過「重設／再排」按鈕的可存取名稱，從未真正點擊過它、也從未驗證過點擊後的真實瀏覽器與 LocalStorage 行為。

三者皆屬「使用者體感缺口」——功能底層邏輯早已正確（皆通過既有單元測試），缺的是**畫面上看不看得到、瀏覽器裡測不測得到**，因此修補成本低、風險小，適合作為本批（M10～M15）第一棒的暖身。

## What Changes

- **本輪場次為空時的畫面說明**：新增純呈現元件 `nextjs-pickball/components/matchmaker/EmptyMatches.tsx`，於 `nextjs-pickball/components/matchmaker/MatchStage.tsx` 判斷 `round.matches.length === 0` 時取代原本的空場地網格，顯示繁體中文說明與「前往參賽者名單」入口。此狀態與既有「空白球場狀態」（`round` 為 `null`）**不同**，不沿用其元件、入口或文案（design Decision 1）。
- **歷史頁顯示損毀歷史紀錄的可見提示**：`nextjs-pickball/components/matchmaker/HistoryView.tsx` 改為同時取用 `readHistory()` 既有回傳的 `entries` 與 `droppedCount` 兩個欄位（目前只取前者），`droppedCount > 0` 時顯示 `role="alert"` 的繁體中文提示，樣式與文字語彙比照 `player-roster` capability 既有的 `app/matchmaker/players/page.tsx` 損毀提示區塊。
- **「重設／再排」的端到端覆蓋**：於 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 新增一條 E2E test，完整走一次「產生一輪 → 送出其中一場比分 → 點擊重設／再排 → 已完成場次保留、未完成場次確實被重新分配、休息名單正確排除已比賽者」。**本項純屬補測試，不改動任何既有 Requirement 文字**（design Decision 3）。

## Non-goals（明確不做）

- **不改分配演算法**。三項缺口的底層邏輯（`allocateRound`、`resetIncompleteMatches`、`readHistory`）皆已正確，本 change 只補畫面消費與測試覆蓋，`match-allocation` capability 的任何 Requirement 皆不變動。對照 `prd.md` 第 15 章「分配核心」一列——本 change 不動「模式結構性約束 ＞ 累計休息次數 ＞ 強度接近 ＞ 重複配對迴避」這條優先序。
- **不做歷史頁的損毀紀錄修復或匯出**。本 change 只讓 `droppedCount` **可見**，不新增任何修復、還原或重新匯入損毀筆數的能力，也不擴充 JSON／CSV／JPG／PDF 既有匯出範圍（`prd.md` 第 15 章「資料搬移」一列已定案的四種匯出格式皆已由 M8／M9 完成，本 change 不新增第五種）。
- **不改 `useRoundStore` 的 API 形狀**。`droppedCount` 已是該 hook 既有匯出欄位（`hooks/useRoundStore.ts` 第 90 行），本 change 只是讓 `HistoryView.tsx` 開始讀取 `readHistory()` 本身既有的同名欄位，不修改 `UseRoundStoreResult` 的介面、不新增動作。
- **不做資料層改為線上帳號或雲端儲存**。呼應 `prd.md` 第 15 章「後續方向」一列——本版仍是純 LocalStorage，損毀提示是「讓使用者看見本機資料異常」，不是任何形式的雲端備援或自動修復。
- **不新增任何 hook**。`hooks/` 目錄零新增檔案，不觸動 `pickleball-guide-page` capability 的 hooks 歸屬清單。
- **不新增任何 storage key**。三項缺口皆消費既有資料（`matchmaker:round:v1`、`matchmaker:history:v1`），不新增、不修改任何 LocalStorage schema。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `match-stage`：新增一條 Requirement——「本輪場次為空時的畫面說明」（ADDED，不修改任何既有 Requirement 文字）。
- `match-history`：新增一條 Requirement——「損毀歷史紀錄的可見提示」（ADDED，不修改任何既有 Requirement 文字）。

> 「重設／再排」的 E2E 覆蓋（What Changes 第三項）**不列入本節**：它不改動任何 Requirement，只在 `tasks.md` 出現，見 design.md Decision 3 的說明。

## Impact

- **新增**：
  - `nextjs-pickball/components/matchmaker/EmptyMatches.tsx`
- **修改**：
  - `nextjs-pickball/components/matchmaker/MatchStage.tsx`（`round.matches.length === 0` 時掛入 `EmptyMatches`，取代原本的空網格）
  - `nextjs-pickball/components/matchmaker/HistoryView.tsx`（消費 `readHistory()` 的 `droppedCount`，顯示提示）
  - `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`（新增 3 條 test：本輪場次為空的說明顯示／不顯示、重設／再排端到端覆蓋）
  - `nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`（新增 2 條 test：有／無損毀紀錄提示）
- **不動**：
  - `nextjs-pickball/lib/matchmaker/**`（三項缺口的底層純函式邏輯皆已正確，本 change 零修改）
  - `nextjs-pickball/hooks/**`（`droppedCount` 已存在，僅新增消費端，不改介面、不新增 hook）
  - `nextjs-pickball/components/matchmaker/RoundControls.tsx`、`CourtCard.tsx`、`RestingPanel.tsx`、`app/matchmaker/players/page.tsx`
  - `package.json`／`pnpm-lock.yaml`（零新增相依）
  - `hono-pickball/**`（matchmaker 依 `prd.md` 為 LocalStorage-only 純前端功能）
