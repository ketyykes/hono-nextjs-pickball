# Proposal: matchmaker-player-swap

## Why

本 change 是「對戰分配機」交付序的 **milestone M13（臨時換人）**，位置如下：

```
M10 場次缺口修補 → M11 球員數據面板 → M12 計分板隊伍文案
   → 【M13 臨時換人（本 change）】 → M14 回合計時器 → M15 限時抽籤
```

**執行相依**：本 change 的 worktree 從 `main` 開出，`matchmaker-scoreboard-team-labels`（M12）
MUST 已合併回 `main`——M12 會動 `nextjs-pickball/components/matchmaker/CourtCard.tsx` 與
`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`，本 change 同樣要修改前者、重用後者的
`isTargetScoreLocked` 判定思路，序列跑才不必解合併衝突。

主持人排定一輪對戰後，時常在開賽前才發現變化：報到的人比預期少一位、有人臨時想加入代打、
或某人身體不適需要換場。`docs/prd.md` 6.3 對「手動輸入比分」的存在理由已明講「主持人可能……
**臨時換人代打**」，承認這個現場情境會發生；但目前唯一能改動本輪組合的操作是「重設／再排」，
一次會把**所有 `pending` 場次**打散重排，不是只換掉那一個位置——若某場已經在候場邊等待，
主持人不可能為了換一個人把其餘場地也一起打亂。

出處：`openspec/changes/archive/2026-09-03-matchmaker-round-lifecycle/design.md` Open Questions
第 4 條——「重排是否應提供『只換這一場』的更細粒度操作——`prd.md` 6.2 只描述『重排未完成』
這一種粒度，本 change 照做。現場若出現『只想換某一場』的需求，屬新的產品決策，需另立
change。」本 change 就是那個「另立的 change」：把粒度從「整輪重排」收斂到「一格換一人」。

## What Changes

- 新增純函式 `swapMatchPlayer(round, matchId, outPlayerId, inPlayerId, players)`
  （`nextjs-pickball/lib/matchmaker/round.ts`）：把某場 `pending` 場次裡的一位在場球員換成
  該輪休息名單中的另一位，回傳與既有 `SetTargetScoreResult`／`ResetIncompleteMatchesResult`
  同形的 discriminated union（`{ ok: true; round } | { ok: false; code; message }`）。
  換人只允許在**該場尚未開始**時發生（`match.status === "pending"`），且 `inPlayerId` MUST
  同時滿足「在該輪休息名單」與「目前為 active」兩個條件，`outPlayerId` MUST 為該場目前在場者。
- 換人後，系統重算：① 該隊的隊伍分數（沿用 `pairing.ts` 既有的隊員 rating 加總並四捨五入至
  小數第 2 位，非本 change 新發明的算法）；② 雙打場次的事後組成標示 `doublesComposition`
  （沿用 `pairing.ts` 已匯出的 `labelDoublesComposition`）；③ 休息名單——換出者進入休息名單、
  換入者離開休息名單。`restCount` 與 `seenSignatures` 皆**不**重算（理由見 design Decision）。
- `hooks/useRoundStore.ts` 新增 `swapMatchPlayer(matchId, outPlayerId, inPlayerId)` 動作
  （呼叫純函式 → 判 `ok` → dispatch，形態比照既有的 `resetIncompleteMatches`／`setTargetScore`），
  屬行為邏輯、必 TDD。
- `components/matchmaker/CourtCard.tsx` 的每個場地區塊，在**該場為 `pending` 且尚未有計分板
  進度**時，於每個球員格旁提供「換人」操作，選項為該輪休息名單中目前 `active` 的球員；
  無可換之人時該操作停用，並以可見文字說明原因。已完成或已在計分板上開始計分的場次
  SHALL NOT 顯示此操作。
- `app/matchmaker/page.tsx` 掛入換人的錯誤狀態顯示（比照既有 `roundError`／`submitError`
  的呈現方式）。

## Non-goals（明確不做）

- **不做場上兩人互換（跨場地）**：本 change 只支援「在場者 ↔ 休息名單者」的單向互換，不支援
  「A 場的甲」與「B 場的乙」直接對調位置。跨場互換要保留哪一格的 rating／組成標示語意不明，
  屬另一個產品決策。
- **不做換人後重算重複配對基準**：`round.seenSignatures` 換人後維持原值不變。重複比對基準
  只在「產生新一輪」（`createRound`）時建立，本輪內臨時換一位球員不觸發重建（詳見 design）。
- **不改分配優先序**：`match-allocation` 的候選排序、配對與重複迴避邏輯完全不動，換人是
  對已產生回合的**事後局部修正**，不是重新跑一次分配演算法。
- **不做拖放**：換人操作為選單選取（點擊／鍵盤皆可達），不做拖曳互動。
- **不做跨場地的球員搜尋或篩選**：休息名單本輪通常僅個位數人，選單直接列出全部候選人，
  不做搜尋框。
- `docs/prd.md` 第 15 章「產品決策摘要」已否決、與本 change 相鄰而本 change 也不做的項目：
  「對戰方式：只有單打與雙打兩種」（不新增第三種對戰方式）、「分配核心：嚴格優先序」
  （不因換人而變更休息次數／強度接近／重複迴避的既有優先序判斷）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `round-lifecycle`：新增「臨時換人」Requirement（`swapMatchPlayer` 純函式、隊伍分數與雙打
  組成標示的重算、休息名單互換）。
- `match-stage`：新增「場地區塊的換人操作」Requirement（`CourtCard` 的換人入口、可用狀態
  與無障礙）。

> 未列入 Modified 的 capability 與理由：
> - `match-allocation`：`swapMatchPlayer` 重用該 capability 已匯出的
>   `labelDoublesComposition`（`nextjs-pickball/lib/matchmaker/pairing.ts`），**不需要新增
>   任何匯出**——該函式已是公開匯出（`export function labelDoublesComposition(...)`），
>   `round.ts` 直接呼叫既有的公開函式即可。本 capability 的任何 Requirement 皆未變更，
>   故不列為 Modified（詳見 Impact 與 design Decision）。
> - `player-roster`：僅唯讀消費 `Player.isActive`，不改任何 Requirement，也不寫入名單。
> - `pickleball-guide-page`：本 change **不新增任何 `hooks/use*.ts` 檔案**——`swapMatchPlayer`
>   是既有 `hooks/useRoundStore.ts` 的新動作，不是新 hook 檔，故不觸發該 capability 的
>   hooks 歸屬清單同步義務（`nextjs-pickball/hooks/hooksInventory.test.ts` 比對的是
>   `hooks/` 目錄下的**檔案**，本 change 未新增檔案）。
> - `scoreboard`：僅唯讀讀取計分板槽是否存在以判斷「是否已開始計分」（見 design Decision），
>   不修改 `scoreboard` 的任何 Requirement 或資料結構。

## Impact

- **新增**：無新檔案。所有變更皆為既有檔案的追加。
- **修改**：
  - `nextjs-pickball/lib/matchmaker/round.ts`（新增 `swapMatchPlayer` 與其 Result 型別、
    失敗代碼）與 `round.test.ts`
  - `nextjs-pickball/hooks/useRoundStore.ts`（新增 `swapMatchPlayer` 動作）與
    `useRoundStore.test.tsx`
  - `nextjs-pickball/components/matchmaker/CourtCard.tsx`（新增每球員格的換人操作）與
    `CourtCard.test.tsx`
  - `nextjs-pickball/components/matchmaker/MatchStage.tsx`（新增 `onSwapPlayer`／`swapError`
    props 並下傳）——若既有測試檔存在則同步補上對應斷言
  - `nextjs-pickball/lib/matchmaker/labels.ts`（新增換人操作的靜態文案常數）
  - `nextjs-pickball/app/matchmaker/page.tsx`（掛入 `handleSwapPlayer` 與換人錯誤狀態顯示）
  - `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 或新檔（換人操作的端對端驗收，
    確切檔案由 tasks.md 決定）
- **重用（唯讀，不修改）**：`nextjs-pickball/lib/matchmaker/pairing.ts` 的
  `labelDoublesComposition`（已匯出，無需改動）、`nextjs-pickball/lib/matchmaker/rating-math.ts`
  的 `roundRating`、`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 的既有槽狀態判斷
  思路（`isTargetScoreLocked` 的「槽存在且非 `setup`」條件，本 change 借用同一判斷邏輯決定
  換人操作是否顯示，但不修改該檔案的任何既有 Requirement）
- **無外部相依**：**不新增任何 npm 套件**。
- **不動**：`hono-pickball/**`（matchmaker 依 `prd.md` 為 LocalStorage-only 純前端功能）、
  `nextjs-pickball/lib/matchmaker/allocation.ts`／`pairing.ts`／`duplication.ts`／
  `candidates.ts`（match-allocation 的分配邏輯不變）、`nextjs-pickball/lib/matchmaker/
  round-types.ts`（`Round`／`RoundMatch` 的 schema 欄位不變——換人只改變既有欄位的**值**，
  不新增欄位）、`hooks/`（不新增任何檔案）
