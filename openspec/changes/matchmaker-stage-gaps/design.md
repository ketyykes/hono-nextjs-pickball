## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- **本 change 是本批（M10～M15）第一棒**，worktree 從 `main @ 3fa2d22` 開出（M3～M9 皆已合併並歸檔），不相依批次內其他 change。因此**不存在**「MODIFIED 對象可能被前一棒也改到」的風險——本 change 也沒有使用任何 MODIFIED Requirement（兩份 delta spec 皆只有 ADDED），這點在 Open Questions 第 1 條說明。
- **三項缺口的底層邏輯皆已正確且有既有測試覆蓋**，本 change 不改動 `lib/matchmaker/**` 的任何一行：
  - `round.matches` 為空的可達性已用程式碼逐層追蹤確認（見 proposal「Why」第 1 條與下方 Decision 1）。
  - `droppedCount` 已是 `readHistory()`（`lib/matchmaker/round-storage.ts`）與 `useRoundStore`（`hooks/useRoundStore.ts` 第 90 行）的既有回傳欄位。
  - `resetIncompleteMatches` 已有完整單元測試（`lib/matchmaker/round.test.ts`）與元件層 wiring 測試（`components/matchmaker/RoundControls.test.tsx`）。
  本 change 因此**全段落在 `nextjs-pickball/CLAUDE.md` 的 TDD 例外層**：純呈現型元件（`EmptyMatches.tsx`、`MatchStage.tsx`、`HistoryView.tsx`）與 Playwright E2E，皆以 E2E 驗收，不強制單元 TDD。三項工作因此規模都很小，且互相獨立，不共用任何新檔案。
- **既有的兩個「空狀態」元件慣例**：`EmptyStage.tsx`（`round` 為 `null`）與 `EmptyRoster.tsx`（名單為空）皆為零單元測試、純 E2E 驗收的簡單呈現元件，固定「標題 + 說明 + 一個入口」的形狀。本 change 新增的 `EmptyMatches.tsx`沿用同一形狀，是刻意的一致性選擇，不是巧合。
- **`droppedCount` 的可見化已有一份現成的視覺與文字先例**：`app/matchmaker/players/page.tsx` 第 67～75 行，`role="alert"` + `border-destructive/50 bg-destructive/10` 樣式，文案「有 {droppedCount} 筆資料損毀已略過，其餘參賽者資料不受影響。如遺失重要參賽者，請重新新增。」。這是 `player-roster` capability 的既有實作，本 change 唯讀參考其樣式，**不修改該檔案**。
- **`HistoryView.tsx` SHALL NOT import `useRoundStore`**：`match-history` 主 spec 的「歷史頁唯讀消費既有紀錄」Requirement 明文要求讀取 MUST 透過 `readHistory()` 進行、SHALL NOT 觸發評分更新或回合狀態變更；該 Requirement 並未逐字點名 `useRoundStore`，但 `useRoundStore` 需要 `players`／`updatePlayer` 兩個 roster port 才能建構，會把歷史頁與名單 store 耦合在一起，與「唯讀消費」的精神牴觸，故本 change 依該 Requirement 的約束推導出這條實作限制。本 change 因此不能透過 `useRoundStore` 取得 `droppedCount`，只能直接消費 `readHistory()` 已回傳的同名欄位——該頁目前已呼叫 `readHistory()`，只是只解構了 `entries`，`droppedCount` 一直在回傳值裡未被取用。
- **`resetIncompleteMatches` 的候選池計算與 `selectPlaying` 的 `isActive` 過濾**（`lib/matchmaker/candidates.ts`）：候選池只以「是否已被保留場次佔用」過濾，`isActive` 的過濾發生在更下游的 `selectPlaying`。這代表「重排前把某位球員設為暫停出場」是唯一不需要刪除資料、單一點擊即可在 UI 上重現「候選池不足」的路徑，本 change 的 E2E 測試依此設計（見 Decision 4）。

## Goals

- 讓 `round.matches` 為空這個已被程式碼證實可達、但目前畫面上完全沉默的狀態，變成使用者看得懂、知道下一步的畫面。
- 讓 `droppedCount` 這個已存在一年多的既有回傳欄位，第一次在歷史頁被實際消費並顯示給使用者。
- 讓「重設／再排」——一個已被單元測試與元件測試充分覆蓋、但從未被任何 E2E 真正點擊過的操作——補上端到端證據。
- 三項工作互不相依、各自可獨立驗證，且**不修改任何 `lib/matchmaker/**` 檔案**，把「使用者體感缺口」與「底層邏輯正確性」這兩件事的邊界維持清楚。

## Non-Goals

- 不重新設計「空白球場狀態」（`EmptyStage.tsx`）或名單頁的損毀提示樣式；兩者皆維持原樣，本 change 只新增消費端或新增一個沿用其形狀的兄弟元件。
- 不處理 `round.matches` 為空這個狀態**如何被觸發**——那是 `resetIncompleteMatches`（M4 `round-lifecycle`）既有且已核可的邊界行為，本 change 只負責「這個狀態被觸發之後，畫面要說什麼」。
- 不新增任何機制讓使用者「修復」或「找回」損毀的歷史紀錄——`droppedCount` 的可見化只是告知，不是救援功能（見 proposal Non-goals）。
- 不擴大「重設／再排」E2E 覆蓋到 round-lifecycle 已經在單元測試層級覆蓋過的每一個分支（重複比對基準、簽章併入等）——E2E 只證明「這條路徑在真實瀏覽器與真實 LocalStorage 下真的接得起來」，細節分支的正確性留給既有單元測試。

## Decisions

### Decision 1：本輪場次為空的說明放在 `MatchStage.tsx`（不是 `page.tsx`），新增獨立元件 `EmptyMatches.tsx`

**Choice**：在 `components/matchmaker/MatchStage.tsx` 內，把原本無條件執行的 `round.matches.map(...)` 網格，改為 `round.matches.length === 0` 時渲染新元件 `EmptyMatches`，否則照原樣渲染場地網格；`RestingPanel`（休息名單側欄）不受影響，維持一律渲染。

**Rationale**：`MatchStage` 是唯一同時持有 `round`（非 null）與 `players` 的元件，判斷本身就該落在這裡，不需要在 `page.tsx` 多加一層條件、多傳一個衍生的布林 prop。休息名單刻意保留可見——即使本輪排不出任何場次，`restingPlayerIds` 仍可能非空（見 Context 的 `selectPlaying` 追蹤：候選池不足時所有仍為 active 的候選人會落入 `resting`），對主持人而言「這些人目前算休息」仍是有效資訊，沒有理由跟著隱藏。

**Alternatives considered**：
- **在 `page.tsx` 新增第三種頂層分支**（`round === null` → `EmptyStage`；`round !== null && matches.length === 0` → 新元件；否則 → `MatchStage`）：否決。這會讓 `RestingPanel` 也一併消失（因為整個 `MatchStage` 都不渲染了），且把「回合是否有場次」這個 `MatchStage` 內部就能算出的條件，逼著 `page.tsx` 額外算一次並多傳一個 prop，是不必要的耦合。
- **重用 `EmptyStage.tsx`，加一個 `variant` 或 `mode` prop 區分兩種情境**：否決。兩者的觸發條件（`round` 是否存在）、文案與下一步入口皆不同，用一個 prop 切兩種完全不同的語意，會讓元件的職責變得模糊，且未來任一種情境要調整文案時都要小心不動到另一種——不如兩個各自獨立、各自簡單的元件（`nextjs-pickball/CLAUDE.md`「清晰度優先於精簡」）。

### Decision 2：`droppedCount` 提示各自持有一份，不抽共用元件

**Choice**：`HistoryView.tsx` 直接仿照 `app/matchmaker/players/page.tsx` 既有的 `droppedCount > 0` 區塊寫一份幾乎相同的 JSX（`role="alert"` + 同一組 destructive 樣式 class + 對應的繁體中文文案），**不**抽出共用元件或 helper。

**Rationale**：抽共用元件必然要嘛把新元件放進 `player-roster` capability 的既有檔案（跨 capability 修改，且該檔不在本 change 的 Impact 清單內），要嘛新建第三個檔案作為兩者共同的依賴（在只有兩個消費端、且兩者連 capability 歸屬都不同的情況下，是提前抽象）。`nextjs-pickball/CLAUDE.md` 與本 repo歷史已有多次「刻意各自持有一份不抽共用模組」的裁決先例（`labels.ts` 檔頭記載 `TEAM_LABELS`／`FORMAT_LABEL` 過去皆如此，直到 M9 才因「歷次顧慮已消失」收斂），本 change 的情境與其相同：兩個消費端分屬不同 capability（`player-roster`／`match-history`），維持各自一份不會產生真正的重複風險（兩者的文案主詞不同——「參賽者資料」vs「歷史紀錄」——本來就不是逐字相同的字串）。

**Alternatives considered**：
- **抽出 `components/matchmaker/DroppedCountAlert.tsx` 共用元件**：否決。會讓本 change 的 Impact 清單多出一個新檔案與一次對 `player-roster` capability 檔案的修改，超出本 change「三個獨立小缺口」的範圍；且兩處文案本就不同（「參賽者資料」vs「歷史紀錄」），共用元件仍需要傳入客製文案的 props，抽象帶來的收斂有限。**記為 tech debt**：若日後第三個消費端出現（例如某天資料頁也要顯示類似提示），再一併收斂。
- **透過 `useRoundStore` 取得 `droppedCount`**：否決。`match-history` 主 spec 明文「歷史頁唯讀消費既有紀錄」Requirement 禁止 `HistoryView.tsx` import `useRoundStore`（`useRoundStore` 需要 `players`／`updatePlayer` 兩個 roster port，會把歷史頁與名單 store 耦合在一起），且 `readHistory()` 本身就已回傳 `droppedCount`，多繞一層沒有必要。

### Decision 3：「重設／再排」的 E2E 覆蓋不修改任何 Requirement，只在 tasks.md 出現

**Choice**：新增的 E2E test 不對應任何**新的**或**被修改的** spec Scenario；`match-stage` 主 spec 既有的「產生本輪與重設／再排的操作入口」Requirement 與其 Scenario「有未完成場次時顯示重設入口」維持完全不變（連 `驗收` 欄都不加第二行）。此測試只在 `test-plan.md` 與 `tasks.md` 出現，並在 `test-plan.md` 中明確標註「補充覆蓋、無對應新 spec 異動」。

**Rationale**：「重設／再排」的行為本身（保留已完成場次、候選池含休息名單成員但排除已比賽者、沿用重複比對基準等）已完整定義於 `round-lifecycle` 主 spec 的「重設與重排未完成場次」Requirement，並有 6 條單元測試逐一覆蓋（`lib/matchmaker/round.test.ts`）；按鈕本身的顯示條件與 wiring 也已由 `match-stage` 主 spec 的既有 Scenario 與 `RoundControls.test.tsx` 覆蓋。本 change 新增的 E2E test **不是新行為**，是同一個已核可行為的另一層驗證手段（真實瀏覽器 + 真實 LocalStorage），寫入當下就會綠燈（regression guard）。若為了掛上 `驗收` 錨點而修改既有 Scenario，等於為了測試手段的變化去動一段完全沒有改變的 Requirement 文字，徒增 archive 時的 diff 噪音，且不符合 propose 流程「只有既有行為真的改變才用 MODIFIED」的準則——這裡連 MODIFIED 的資格都不到，因為連「新增一行驗收」都不成立為「Requirement 有變」。

**Alternatives considered**：
- **MODIFIED「有未完成場次時顯示重設入口」Scenario，比照 `matchmaker-visual-export` 的雙 `驗收` 錨點慣例，加一行指向新 E2E test**：否決。`matchmaker-visual-export` 的雙錨點案例（「點擊列印 PDF 觸發瀏覽器列印」）是**同一個 change 內**、integration 與 e2e 兩層**同時新增**的驗收，屬於 ADDED Requirement 的一部分；本例是對**既有、非本 change 建立**的 Scenario 事後追加一行，性質不同——會製造一次「Requirement 內容完全沒變、但被列為 MODIFIED」的 delta，讓 `openspec validate --strict` 與日後的 archive 比對徒增一次不必要的比對噪音。
- **完全不寫進任何 artifact，只在 apply 時臨時加測試**：否決。違反 propose 流程本身——所有測試意圖都須在 `test-plan.md` 先承諾，apply 階段才有依據可核對。

### Decision 4：`round.matches` 為空狀態的 E2E 重現方式——用「設為暫停」而非「刪除」

**Choice**：新增 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 的 test 以下列步驟重現「回合存在但無場次」：種入 2 位參賽者 → 產生本輪對戰（1 場地、單打，2 人剛好組成 1 場）→ 導覽至 `/matchmaker/players` → 點擊其中一位球員的「設為暫停」→ 導覽回 `/matchmaker` → 點擊「重設／再排」。

**Rationale**：`lib/matchmaker/candidates.ts` 的 `selectPlaying` 明文「先以 `isActive` 過濾候選池」，而 `resetIncompleteMatches` 的候選池計算（`round.ts` 的 `occupiedPlayerIds`）**不**過濾 `isActive`——這代表把某位球員設為暫停出場，是唯一「不刪除任何資料、只需一次點擊、且不觸發確認對話框」就能讓候選池從 2 人降到 1 人（不足以組成單打的 2 人）的操作路徑，最適合 E2E 的簡潔重現。

**Alternatives considered**：
- **刪除球員**（`PlayerCard` 的「刪除」按鈕）：否決。多一層確認對話框（`AlertDialog`）步驟，且「刪除」在語意上比「暫停」更劇烈，測試意圖會被誤讀為「這個狀態只在刪除資料後才會發生」，而實際上暫停已經足夠重現，不需要真的破壞資料。
- **直接以 `page.addInitScript` 種入一個已經是「有回合、`matches` 為空」形狀的 `matchmaker:round:v1`**：否決。這樣繞過了「回合本來就有場次、之後才變空」這個真實使用者會經歷的操作序列，測不到 `resetIncompleteMatches` 這條真正產生此狀態的路徑，也測不到「重設」按鈕本身在極限情況下是否還能正常運作——後者正是本 Scenario 想證明的核心行為。

## Risks / Trade-offs

- **[`EmptyMatches.tsx` 與 `EmptyStage.tsx` 外觀高度相似，日後可能被誤合併]** → 兩者刻意共用同一套版面慣例（虛線邊框卡片 + 標題 + 說明 + 入口），這是**一致性**而非重複——沿用既有元件的既有慣例，比自創一套新樣式更符合 `nextjs-pickball/CLAUDE.md` 的既有做法。緩解：兩者的 `data-testid`（`empty-stage` vs `empty-matches`）與觸發條件（`round === null` vs `round !== null && matches.length === 0`）完全不同，E2E 測試已分別鎖定，日後若有人誤合併兩者的觸發條件，既有測試會立刻紅燈。
- **[`droppedCount` 提示的兩份 JSX 未來可能各自漂移（文案或樣式修改了一處卻忘了另一處）]** → 已在 Decision 2 記為 tech debt，非本 change 需解決的問題；且兩者的文案主詞本來就不同，「漂移」的實際風險是「樣式 class 不同步」而非「文案錯誤」，影響有限。
- **["重設／再排" E2E 測試依賴既有分配演算法的具體行為（如候選池計算公式）而非只測 UI]** → 這是刻意的：E2E 的目的正是確認「真實瀏覽器 + 真實 LocalStorage」下這條已由單元測試證明正確的路徑真的接得起來，測試斷言鎖定在**可觀察的結果**（已完成場次的分數與 id 不變、非完成場次的 id 改變、休息名單筆數）而非分配演算法的內部細節，演算法本身微調（如排序規則）不會使本測試轉紅，除非它影響到這些外顯結果。

## Open Questions

1. **本 change 是否需要在 apply §0 對齊「前一棒也可能改到的 MODIFIED 對象」？——不需要，此問題不適用。** 本 change 是 M10～M15 這一批的第一棒，相依對象固定為 `main @ 3fa2d22`（M9 已合併），批次內沒有更早的 change 需要對齊；且本 change 的兩份 delta spec（`match-stage`、`match-history`）皆只使用 ADDED Requirement，**不含任何 MODIFIED**，因此也不存在「MODIFIED 區塊需要以合併後的 main 重新對齊」的情境。apply §0 仍須依 tasks.md §1 的既有慣例，核對本文件與 spec 引用的每個既有函式簽章、常數與檔案路徑在 `main` 上的實際狀態（`resetIncompleteMatches`、`selectPlaying`、`readHistory`、`useRoundStore` 的 `droppedCount` 欄位、`app/matchmaker/players/page.tsx` 的提示樣式），但這是一般性的「先核對再動工」紀律，不是本條所指的批次內 MODIFIED 對齊問題。
2. **`EmptyMatches.tsx` 是否需要接受任何 props？** 暫定不需要——判斷「是否要渲染」的條件（`round.matches.length === 0`）留在 `MatchStage.tsx`，元件本身是純靜態內容（標題、說明、一個固定連結），不需要任何輸入。若 apply 階段發現需要依情境調整文案（例如未來想區分「重排導致」與「其他成因導致」的空場次），屆時再回頭補 props，本文件不預先設計用不到的擴充點（`working-principles`「No abstractions for single-use code」）。
3. **[已於 apply §1 核對，2026-09-06]** 本節其餘條目所引用的既有程式碼在 `main` 上的實際狀態，
   逐項核對結果如下，**全數與本文件一致，無差異**：
   - `lib/matchmaker/round.ts` 的 `resetIncompleteMatches`：`occupiedPlayerIds` 只由 `keptMatches`
     推出，候選池 `players.filter((p) => !occupiedPlayerIds.has(p.id))` **不過濾 `isActive`**；
     該函式內既有註解亦明載「候選池不足時 `allocateRound` 回傳空 `matches`，本函式不判定失敗」。
   - `lib/matchmaker/candidates.ts` 的 `selectPlaying`：第 51 行 `players.filter((p) => p.isActive)`，
     `isActive` 過濾確實發生在此處（Decision 4 的重現路徑成立）。
   - `lib/matchmaker/round-storage.ts`：`ReadHistoryResult` 為 `{ entries, droppedCount }`；
     `hooks/useRoundStore.ts` 的 `UseRoundStoreResult.droppedCount` 亦存在（僅供對照，本 change 不用它）。
   - `app/matchmaker/players/page.tsx` 既有損毀提示：`role="alert"` ＋
     `className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"`，
     文案「有 {droppedCount} 筆資料損毀已略過，其餘參賽者資料不受影響。如遺失重要參賽者，請重新新增。」
   - E2E helper 簽章：`match-stage.spec.ts` 的 `seedRoster(page, count)`、`trackConsoleIssues(page)`、
     `tabUntilFocused(page, locator, maxPresses?)`；`matchmaker-history.spec.ts` 的
     `seedHistory(page, entries)`、`buildEntry(options)`、`player(id, name, ratingBefore?, ratingAfter?)`。
   - `PlayerCard.tsx` 的出場切換按鈕文字為「設為暫停」／「恢復出場」（Decision 4 的點擊目標）。

4. **`droppedCount` 提示放置於 `HistoryRangeFilter` 之上或之下？** 暫定比照 `player-roster` 的既有慣例，放在頁面內容最上方（`HistoryView.tsx` 回傳的最外層 `<div>` 內、`<HistoryRangeFilter>` 之前）——損毀提示是「整份資料層級」的訊息，不屬於任何一個區間篩選結果，理應在篩選控制項之前先被看到。此為呈現順序的小決定，不寫進 spec（spec 只約束「MUST 顯示」，不約束版面順序），apply 階段若有更好的版面理由可自行微調，不需要回頭改 spec。

5. **[Stage 2 Review 實測記錄，2026-09-06] `readHistory()` 的回寫副作用使損毀提示實質上「最多只被看到一次」——判定為不違反本組 spec、且不屬本 change 範圍，記於此供日後 milestone 參考。** `readHistory()` 在 `droppedCount > 0` 時會呼叫 `writeHistory(entries)` 回寫清理後的歷史（`lib/matchmaker/round-storage.ts`），因此有兩個可觀察的後果：①使用者**第二次**開啟歷史頁時 `droppedCount` 已是 0，提示不再出現；②若使用者先造訪 `/matchmaker`（該頁的 `useRoundStore` 同樣呼叫 `readHistory()`），損毀資料會在抵達歷史頁**之前**就被清掉，提示可能一次都不會被看到。**判定一：不違反本組 spec。** Scenario 1 的 WHEN 是條件式的「開啟歷史頁時 `readHistory()` 回傳的 `droppedCount` 大於 0」——第二次開啟時該條件本就不成立，而此時不顯示提示正是同一 Requirement 明文要求的「`droppedCount` 為 0 時 SHALL NOT 顯示任何損毀提示」；spec 從未要求提示跨 session 持續存在。**判定二：不屬本 change 範圍。** 要改變這個時序必須修改 `readHistory()` 的回寫時機，而 Context 明文「本 change 不改動 `lib/matchmaker/**` 的任何一行」，proposal Non-goals 亦有「不新增任何機制讓使用者『修復』或『找回』損毀的歷史紀錄」。若日後認定「提示至少要被看到一次」是產品需求，應是持久化層的獨立 change（例如把「已清理資料」與「已告知使用者」兩件事分開記錄），不應在本 change 內夾帶。

6. **[Stage 2 Review 實測記錄，2026-09-06] hydration 的 `useEffect` 在 `pnpm dev` 下確認只執行一次，未觸發 React StrictMode 雙跑——`hydratedHistoryReducer` 維持 `return next`、不加防禦式合併邏輯是正確的。** 承上條：若該 effect 雙跑，第二次 `readHistory()` 會讀到已被回寫清理的資料而得到 `droppedCount: 0`，把第一次已偵測到的筆數蓋回 0。Reviewer 以獨立探針實測（在 effect 內暫時加一行 `console.warn`，借既有 test「紀錄於 hydration 後顯示且無 console error」的 console 收集器把收集到的訊息全數印出）確認該 warn 只出現一次；E2E test「有損毀歷史紀錄時顯示提示且其餘紀錄正常顯示」全綠亦為同一結論的旁證——若雙跑，該 test 必然紅燈。結論與 `HistoryView.tsx` 檔內註解一致，不寫用不到的分支。
