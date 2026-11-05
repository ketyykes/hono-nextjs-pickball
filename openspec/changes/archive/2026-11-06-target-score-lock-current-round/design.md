# Design: target-score-lock-current-round

## Context

- 鎖定判定：`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 的 `isTargetScoreLocked(round, slots)`（約 :245-251）。
  第一條 `round.matches.some((match) => match.status !== "pending")`；第二條 `Object.values(slots).some((slot) => slot.status !== "setup")`——**第二條不看槽屬於哪一場**。
  此函式位於前端 `lib/`，不在 `@pickball/core`（核心套件只有 `round.ts` 的 `setTargetScore`／`setTimerDuration` 等狀態轉換），因此本 change 只改前端一檔。
- `MatchSlots` 為 `Record<string, ScoreboardState>`（`nextjs-pickball/lib/scoreboard/match-slots.ts`），**鍵就是 `matchId`**：`writeMatchSlot(state)` 以 `state.matchId` 推導鍵，`readMatchSlots()` 以鍵逐筆還原。槽內容本身也帶 `matchId` 欄位（型別為 `string | null`）。
- 呼叫端：`components/matchmaker/RoundControls.tsx` 以 `isTargetScoreLocked(round, matchSlots)` 的 `locked` 同時停用目標分數與計時兩個 radiogroup（計時鎖定原因為核心 `ROUND_TIMER_LOCKED_REASON`）。
  `matchSlots` 由 `app/matchmaker/page.tsx` 提供：本機模式為 `readMatchSlots()` 的全部槽（回填 effect 每次 `round` 變動時重讀），雲端模式為 `remoteMatchSlots`。
- 殘留槽的來源（訪客）：`hooks/useRoundStore.ts` 的 `generateRound`（約 :246-263）與 `submitScore`（約 :303-324）都不清槽；`app/matchmaker/page.tsx`（約 :127-147）只在「計分板 `finished` 自動回填成功」時 `clearMatchSlots([matchId])`；
  `resetIncompleteMatches` 經 `clearDiscardedMatchSlots` 清被丟棄場次的槽；重置名單清全部槽。
  「產生本輪對戰」按鈕只在人數不足時停用，有未完成場次時仍可直接產生下一輪——bug 的重現路徑在 UI 上可達。
- 雲端：後端 `hono-pickball/src/matchmaker/round-repository.ts` 的 `putRound` 在同一個 batch 內刪除不屬於目前回合的孤兒分槽，送出比分的 batch 刪除該場分槽，所以 `remoteMatchSlots` 實務上只含本輪場次；雲端模式目前不會觸發此 bug。
- 既有 it「槽已不在回合中但非 setup 時仍判定為鎖定」（`scoreboard-binding.test.ts` 約 :656，來自 `2026-09-03-matchmaker-scoreboard-binding` 的 Stage 2 補洞）刻意釘住「孤兒槽也鎖定」的 fail-closed 取捨，註解寫明「日後若有人『順手補上一致性』會被抓到，需先回到 spec 討論」。該 it **不是**主 spec 的驗收錨點（主 spec 無此名稱）。
- 其他讀槽的地方都以本輪場次 id 查詢：`MatchStage` 傳 `matchSlots[match.id]` 給 `CourtCard`（「計分中」標示）；`collectFinishedSubmissions` 以 `round.matches.find` 比對並略過孤兒；`lib/sync/local-import.ts` 只帶回合未完成場次的分槽。

## Goals

- 鎖定判定的第二條只計入本輪場次的槽，與主 spec「該輪任一場次的計分板槽」一致；目標分數與計時兩者一併修正。
- 以槽集合的**鍵**判定是否屬於本輪，與回填條件同一來源。
- 產品碼只改 `isTargetScoreLocked` 一個函式。

## Non-Goals

- **孤兒槽清理另案處理**：本 change 不在「產生新一輪」或「手動送出比分成功」時清除本機的殘留槽。修正後殘留槽剩下的影響：
  1. 佔用 LocalStorage：每輪最多留下場地數（上限 8）個槽，跨輪累積、不會自動回收；只有重排本輪（清被丟棄場次）與重置名單（`resetMatchmakerData` 的清除清單含 `scoreboard:matches:v1`）會清掉。單槽為數百位元組等級，實務上距配額很遠。
  2. 舊的 `/scoreboard?match=<舊 id>` 連結（舊分頁、書籤）仍會打開一個可計分的綁定計分板，而不是失效說明；分數永遠不會回填。這與 `scoreboard`「該 `matchId` 有條目 ⟺ 綁定有效」不變式的精神相違，但主 spec 明文只要求「重排本輪或重置名單」兩個時機維持該不變式。
  3. 對戰頁畫面不受影響：「計分中」標示、回填、本機資料匯入都以本輪場次 id 查槽，看不到孤兒槽；同輪手動送出後留下的已完成場次的槽也不顯示（已完成場次不渲染計分板入口與計分中標示，回填條件 3 略過已完成場次）。
- 產生新一輪前的確認對話框、本輪設定持久化、「不計時」選項。
- 後端、核心套件、`RoundControls.tsx`、`app/matchmaker/page.tsx`、`hooks/**` 的任何改動。

## Decisions

### Decision 1：在 `isTargetScoreLocked` 內以「槽的鍵 ∈ 本輪場次 id」過濾第二條

**Choice**：函式內先由 `round.matches` 建出本輪場次 id 集合，第二條改為走訪 `Object.entries(slots)`，只有鍵在集合內且 `status !== "setup"` 的槽才算已開始。第一條、回傳形狀、鎖定原因常數皆不變。

**Rationale**：
- 該函式是鎖定與否的唯一來源（主 spec 明文，`RoundControls` 與計時共用），在此修一處，目標分數、計時、本機與雲端四條路徑同時正確。
- 以**鍵**比對而非槽內容的 `matchId` 欄位：鍵是槽位的結構保證（`writeMatchSlot` 以 `state.matchId` 推導鍵、`ensureMatchSlot` 讀回時以鍵覆寫 `matchId`），且 `collectFinishedSubmissions` 已以鍵比對（既有 it「待送出清單的 matchId 取自槽的鍵而非槽內容」）；兩個函式若用不同來源判定「是否屬於本輪」，會對同一個槽給出相反答案。內容欄位型別為 `string | null`，也較不可靠。
- 與 `setTargetScore` 的方向一致性不受影響：該入口只看場次 `status`（第一條），本 change 只縮小第二條；「本判定已鎖、入口仍接受」的差集方向不變，「入口拒絕但本判定未鎖」仍不可能出現。

**Alternatives considered**：
- 由呼叫端（`page.tsx` 或 `RoundControls`）先把槽過濾成本輪場次再傳入：主 spec 禁止在元件內另判，且本機與雲端兩個來源都得各過濾一次，忘記一處就回到原 bug。不選。
- 改讀槽內容的 `matchId` 欄位比對：理由見上。不選。
- 每個槽以 `round.matches.some((m) => m.id === key)` 線性比對而不建集合：場地數上限 8、行為等價（列為 mutation 的等價對照組），選哪個交給 Implementer；預設建集合以讀起來直白。

### Decision 2：推翻既有 fail-closed 取捨，刪除 it「槽已不在回合中但非 setup 時仍判定為鎖定」

**Choice**：刪除該 it 與其上方說明註解，不改名、不反轉斷言後保留；同一組輸入（本輪只有 `m1`、槽只有非本輪的 `playing` 條目）的相反期望由新 it「前一輪殘留的計分板槽不鎖定新一輪的目標分數」承接。這是本 change 唯一授權修改的既有測試。

**Rationale**：
- 原取捨的理由是「誤放行則讓同輪各場地打不同分制」。但非本輪的槽不是本輪任何場地的計分場所：本輪場地入口只導向 `/scoreboard?match=<本輪場次 id>` 並以當下回合的 `targetScore` 建 seed，回填只認本輪場次；殘留槽帶的是舊輪自己的 `targetScore`，改本輪分制不會讓本輪任何兩個場地分制不同。誤放行的風險在這個情境不存在，而誤鎖的代價（新一輪無法改分制、無解除手段）正是使用者回報的 bug。
- 主 spec 原文本來就是「該輪任一場次的計分板槽」；舊 it 釘住的是比規格寬的實作，不是規格。
- 刪除而非原地改寫：it 名稱描述的是被推翻的行為，保留同名反轉斷言會讓讀者誤會；新 it 名稱即新 Scenario 的驗收錨點。

**Alternatives considered**：
- 保留舊 it、改由呼叫端過濾：等於在兩處各判一次「是否屬於本輪」，違反唯一來源。不選。
- 保留 fail-closed、改以「產生新一輪時清槽」解決：見 Decision 3；且清槽失敗（配額）時仍會鎖死，治標不治本。不選。

### Decision 3：孤兒槽清理不納入本 change

**Choice**：只做 Decision 1；不在 `generateRound`／`submitScore` 成功時清除本機殘留槽。

**Rationale**（依 coordinator 的判準查證既有 spec）：
- `scoreboard`「對戰場次綁定與失效處理」寫的是「此等價關係 MUST 由『重排本輪或重置名單時清除對應計分板進度』維持」；`round-lifecycle`「重排本輪或重置名單時清除對應計分板進度」只列舉重排本輪與重置名單兩個時機；「計分板結果的自動回填共用送出 pipeline」只要求**回填成功後**清除該場的槽。
- 對「產生新一輪」與「手動送出比分成功」兩個時機，既有 spec **沉默**，因此不屬於「spec 要求而實作沒做」的 bug；納入就是新增行為，需要新的 Scenario 與對 `useRoundStore` 的改動，超出本 change 的範圍。
- 修正鎖定後，孤兒槽在對戰頁已無可見影響（Non-Goals 第 3 點），剩下的儲存空間與舊連結問題列入 Non-Goals，另開 change 處理。

**Alternatives considered**：
- 一併在兩個時機清槽：需改 `hooks/useRoundStore.ts`（或 `page.tsx`）、新增 Scenario 與 hook 測試，並要決定「手動送出時槽為 `finished` 的競態」等邊界；範圍擴大一倍。不選。

### Decision 4：不 MODIFY「回合計時器」與 `match-stage` 兩處的括號摘要

**Choice**：`round-lifecycle`「回合計時器」的「（該輪任一場次已完成，或任一計分板槽的 `status !== "setup"` 時鎖定；判定條件見『開始計分後鎖定本輪目標分數』Requirement）」，以及 `match-stage`「目標分數選擇器」等處 GIVEN 與括號內的同類摘要，維持原文。

**Rationale**：兩處都明文把判定條件委派給「開始計分後鎖定本輪目標分數」，括號只是摘要且以「該輪」起頭；判定的唯一定義處是本 change MODIFIED 的 Requirement。為一句摘要複製兩個長 Requirement 的完整區塊，會放大 delta 與並行 change 的合併衝突面，而不改變任何行為。

**Alternatives considered**：一併 MODIFY 兩個 Requirement 改寫摘要：規格字面更一致，但 delta 增加約 200 行、無行為差異。不選；若 verify 階段認為摘要造成誤讀，另開文件型 change。

### Decision 5：E2E 走「有未完成場次時直接產生下一輪」的真實路徑

**Choice**：在 `nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts` 的 describe「/matchmaker 對戰頁的計分板接線」新增一條 test，沿用同 describe 的 `seedRoster`、`generateRound`、`courtMatchId` helper：
4 人、1 場地產生第一輪 → 記下舊 `matchId` → 進入計分板打一球 → 「返回對戰」→ **先斷言**「本輪已開始計分，目標分數不可更改。」可見（前置條件，證明殘留槽確實非 `setup`）→ 直接點「產生本輪對戰」→ 以「舊場次的 `court-<舊 id>-grid` 數量為 0、場地網格數量為 1」作為新一輪就緒的同步點 → 斷言目標分數 3 顆、計時 4 顆 radio 皆 enabled，兩段鎖定說明 `toHaveCount(0)`。

**Rationale**：
- 「產生本輪對戰」只在人數不足時停用，此路徑在 UI 上可達，也是使用者回報的路徑；不需要改走「手動送出 → 產生下一輪」的替代路徑。
- 第二次產生直接點按鈕、不呼叫 `generateRound` helper（helper 會先 `page.goto`）：重現使用者在同一頁連續操作的情境。
- 同步點用 web-first 斷言（`toHaveCount`），不用 `waitForTimeout`；鎖定說明的消失以 `toHaveCount(0)` 斷言，排在新 grid 出現之後，避免在舊畫面上誤判。
- 不斷言 LocalStorage 內殘留槽仍存在：那會把 Non-Goal（不清槽）釘成規格，日後另案清槽時此 test 應維持綠。
- 不新增雲端 E2E：雲端後端本來就刪除孤兒分槽，`user-data/round-sync.spec.ts` 既有的鎖定斷言作為 regression guard。

**Alternatives considered**：以 `page.evaluate` 直接寫一個非本輪 id 的槽再 reload：較快，但繞過真實的殘留產生路徑，且同 describe 已有走真計分板的先例。不選。

## Risks / Trade-offs

- [Risk] 刪除既有 it 被誤認為降低偵測力 → Mitigation：新 it「前一輪殘留的計分板槽不鎖定新一輪的目標分數」以同一組輸入斷言相反期望；另有三個新 it 與既有「鎖定判定掃描全部場次與全部槽而非只看第一筆」守住過濾的各個變異（execution-plan 的 mutation 清單）。tasks 檔頭明列這是唯一授權修改的既有測試。
- [Risk] 實作改讀槽內容的 `matchId` 而非鍵 → Mitigation：it「鎖定判定以槽集合的鍵比對本輪場次而非槽內容的 matchId」兩個方向都斷言，任一方向改讀內容都會轉紅。
- [Risk] 過濾寫成「只比對第一場」之類的部分實作 → Mitigation：it「本輪場次的槽已開始時仍鎖定且不受殘留槽影響」把已開始的槽放在本輪**第二場** `m2`。
- [Risk] 並行 change `scoreboard-bound-game-over` 可能也修改 `tests/e2e/specs/scoreboard-binding.spec.ts` → Mitigation：本 change 只在既有 describe 末尾新增一條 test、不動既有 test；合併順序與衝突由 coordinator 處理（environment.md 注意事項）。
- [Risk] 孤兒槽仍讓舊 `?match=` 連結可計分（Non-Goals 第 2 點）→ 接受，另案處理；本 change 不惡化現況。
- [Risk] 主 spec 其他兩處的括號摘要字面仍寫「任一計分板槽」（Decision 4）→ 接受；兩處皆以「判定條件見…」委派給本 Requirement。

## Migration Plan

無資料或 schema 遷移；不新增相依。只影響前端 Worker，部署照 README「部署前手動檢查清單」。回滾：revert `scoreboard-binding.ts` 與兩個測試檔的提交即可。

## Open Questions

（無；設計裁量皆已於 Decisions 定案。apply 階段遇到阻礙時附加於此。）

- apply 期間（2026-11-06）的流程裁量（coordinator 裁定，非設計變更）：重負載鎖時段受限，§1.1 基線採 coordinator 於前一個 change 合併前實跑的數字、不重跑；
  2.2 的 E2E 紅燈於 03:19 的鎖空檔在 GREEN 前實跑；2.3 的 chromium `scoreboard-binding.spec.ts`／`match-stage.spec.ts` 全檔綠燈與 C2～C5 改由 coordinator 於合併前驗收一併執行。
  Stage 2 的兩點 non-blocking 建議未採納（`RoundControls.tsx` prop 註解在範圍外；鍵比對 it 未斷言 `reason`，與 test-plan 該列 Assertion 一致），記於 tasks 2.4。
