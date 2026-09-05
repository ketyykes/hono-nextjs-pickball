# Design: matchmaker-player-swap

## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束，皆於 propose
階段在 `main`（`3fa2d22`，已含 M1～M9；M10～M12 尚未合併回 `main`，見 Open Questions 第 1 條）
上實讀確認：

- `nextjs-pickball/lib/matchmaker/round.ts`（915 行）已有三個同型態的純函式：
  `setTargetScore`、`resetIncompleteMatches`、`submitScore`，皆遵循「純函式回傳
  discriminated union `{ ok: true; round } | { ok: false; code; message }`，呼叫端
  （`hooks/useRoundStore.ts`）負責 `dispatch`」的固定模式。`swapMatchPlayer` 是這個家族的
  第四個成員，沒有理由另立風格。
- **隊伍分數的既有算法**（`nextjs-pickball/lib/matchmaker/pairing.ts` 的私有函式
  `buildTeam`）是「隊內成員 `rating` 的**總和**」，經 `rating-math.ts` 的 `roundRating`
  正規化——單打隊伍恰為該員 rating（總和退化為單一值），雙打隊伍為兩人 rating 相加。
  這與簡報用語「隊員平均」不同：實測程式碼是總和不是平均，本 change 沿用**實際算法**
  （總和），若真的用平均會與 `match-allocation` 建隊時的隊伍分數定義不一致，導致同一場
  對戰在「剛產生」與「換人後」出現兩種不可比的 `rating` 定義。
- **`labelDoublesComposition` 已是公開匯出**
  （`nextjs-pickball/lib/matchmaker/pairing.ts:64`：`export function
  labelDoublesComposition(fourPlayers: readonly [Player, Player, Player, Player]):
  DoublesComposition`），不需要比照簡報所稱的「`MATCHMAKER_ROUTE` 前例」補匯出。
  `nextjs-pickball/lib/matchmaker/allocation.ts` 內另有一個**私有**的
  `relabelDoublesComposition(match)` 包裝它（解構 `teams[0]`／`teams[1]` 為
  `[first, second, third, fourth]` 後呼叫），本 change 直接呼叫已匯出的
  `labelDoublesComposition`、自行以同一種順序（teamA 在前、teamB 在後）組出 4 元素 tuple，
  不需要、也不應該去改 `allocation.ts` 讓那個私有包裝變成公開——`match-allocation` 的
  Impact 因此真的是**零改動**（連新增 `export` 關鍵字都不需要）。
- **`round.ts` 已有直接 import 內部子模組的先例**：頂部 `import { buildSignatureIndex }
  from "./duplication"`，繞過 `allocation.ts` 這個公開入口直接取用 `match-allocation` 內部
  模組的匯出函式。本 change 的 `import { labelDoublesComposition } from "./pairing"` 是同一種
  先例的延續，不是新的耦合方向。
- **`isTargetScoreLocked`（`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts:182`）
  是「已開始計分」判定的既有先例**：`anyMatchStarted = round.matches.some(m => m.status
  !== "pending")` **OR** `anySlotStarted = Object.values(slots).some(slot => slot.status
  !== "setup")`。這證實一件事——`RoundMatch.status` 目前的實際產出只有 `"pending"` 與
  `"completed"` 兩種（`round-lifecycle` spec 明文：`"scoring"` 只預留於 schema，
  「SHALL NOT 自行產生它」），因此「這場是否已經開打」在目前系統裡**必須**同時看
  `status` 與計分板槽狀態，只看前者會誤判「已經在場邊計分中的 `pending` 場次」為尚未開始。
- **`ensureMatchSlot` 只在使用者點擊「進入計分板」時才建立槽**
  （`CourtCard.tsx` 的 `handleEnterScoreboard`），因此 `pending` 場次的計分板槽狀態即為
  「該場是否已被實際觸碰」的可靠訊號——`scoreboard-binding.ts` 的
  「場地區塊的計分板入口」Requirement 已規範槽的建立時機，本 change 只讀取、不新增任何
  寫入路徑。
- `CourtCard.tsx` 現有的 `inProgress = matchSlot !== null` 區域變數已經是這個判定的畫面層
  體現，本 change 重用同一個變數，不重新計算一次。
- `components/matchmaker/PlayerTile.tsx` 目前是**純呈現、零單元測試**的元件（僅
  `CourtCard.tsx` 一個消費端），且不接受除 `player`／`completed` 以外的任何 props。
- `components/ui/select.tsx`（Radix `Select` 的 shadcn 包裝）是**既有元件**，已被
  `PlayerForm.tsx`、`ScoreboardSetup.tsx` 使用；`RoundControls.tsx` 的目標分數／對戰方式則用
  按鈕 `radiogroup`（非 `Select`）。本 change 的候選人選單語意上是「選一個人執行一個動作」，
  不是「切換一個持久狀態」，與 `PlayerForm.tsx` 的性別選單更接近。
- `nextjs-pickball/lib/matchmaker/labels.ts` 是「對戰文案常數的單一來源」（2026-09-03 才從
  五處分散收斂而成），但目前只收錄**顯示詞彙**（`TEAM_LABELS`／`FORMAT_LABEL`／
  `DOUBLES_COMPOSITION_LABEL`），不收錄任何函式特定的驗證或失敗訊息——`round.ts` 現有的
  13 個訊息常數（`EMPTY_ROSTER_MESSAGE` 等）全部留在該檔自身，沒有一個進了 `labels.ts`。

## Goals

- 讓主持人能在**不打亂其餘場地**的前提下，把單一場地的單一在場球員換成休息名單中的另一位。
- 換人後的隊伍分數、雙打組成標示，與「重新產生一次這個對戰」會得到的值**完全一致**——不
  引入第二套計算邏輯。
- 換人是否可行的判斷（前置條件）與換人的執行（資料變更）分離為純函式，UI 層零業務判斷。
- 沿用本 repo 既有的三種既定慣例：`round.ts` 的 Result 型別家族、`useRoundStore.ts` 的
  「呼叫純函式 → 判 `ok` → dispatch」、以及 disabled + 可見文字說明的無障礙模式
  （`RoundControls.tsx` 的目標分數鎖定、`EmptyStage` 的人數不足提示皆同一慣例）。

## Non-Goals

- **不做跨場地互換**（proposal 已列）：本 change 的資料流是「一個在場位置 ↔ 休息名單」，
  不是「兩個在場位置互換」。後者需要同時處理兩邊的隊伍分數與組成標示重算，且若兩邊對戰
  方式不同（例如一邊單打一邊雙打）語意不明，留給日後若有需求再另立 change。
- **不做換人歷史記錄**：換人不寫入 `match-history`，也不在 `MatchHistoryEntry` 留下任何
  「這場曾經換過人」的痕跡——`prd.md` 8.2 的歷史欄位定義未列此項，加了就是新的資料模型
  決策，且歷史紀錄本就只保存「送出比分當下」的快照（`round-lifecycle` design Decision 3），
  換人發生在送出之前，不影響快照的正確性。
- **不做換人次數限制或提示**：不記錄「這場已經換過幾次人」，也不限制上限。`prd.md` 沒有
  這項規則，加上限會是無來源的臆測。
- **不重算重複比對基準**（proposal 已列，此處補充技術理由）：`seenSignatures` 的建立時機
  綁定在 `createRound`／`resetIncompleteMatches` 兩個函式，兩者才會呼叫
  `buildSignatureIndex`。若換人也要更新基準，就必須在 `round.ts` 內再定義一種「局部更新
  基準」的邏輯（既有的 `signatureIndexOf` 是對整組 `RoundMatch[]` 操作，不是對單場的增量
  更新），複雜度與換人這個「小修正」操作不成比例，且下一輪產生時基準本就會用當時的
  `completed`／`scoring` 場次重新計算一次，換人後若真的打完，新組合仍會被正確記錄。

## Decisions

### Decision 1：`swapMatchPlayer` 放在既有的 `round.ts`，不另立 `swap.ts`

**Choice**：新增函式放進 `nextjs-pickball/lib/matchmaker/round.ts`，與 `setTargetScore`／
`resetIncompleteMatches`／`submitScore` 同檔。

**Rationale**：這四個函式共用完全相同的簽章家族（`round: Round` 起手、回傳 `{ ok } |
{ ok: false, code, message }`）、共用同一組私有輔助函式（`resolveTeamPlayers` 已存在於本檔、
`roundRating` 已被 import）、且都是「round-lifecycle」capability 的同一個 Requirement 群組
（本輪對戰的資料變更）。拆到新檔案不會降低耦合——新檔仍要 import `Round`／`RoundTeam`／
`RoundMatch` 型別與 `pairing.ts` 的 `labelDoublesComposition`，唯一差別是多一次跨檔案
往返閱讀成本。

**Alternatives considered**：
- 新檔 `lib/matchmaker/swap.ts`：`round.ts` 已 915 行，新增一個函式（連同五個失敗碼與
  一個 Result 型別家族，預估 +80～100 行）不會讓檔案顯著失衡；相較之下，本 repo
  `lib/matchmaker/` 目錄下真正拆檔的先例（如 `rating.ts`／`rating-math.ts`／
  `rating-types.ts`）都是因為**職責邊界不同**（驗證＋主流程 vs 純數學 vs 純型別），不是
  因為檔案長度。`swapMatchPlayer` 與既有三個函式職責完全同構，沒有這條邊界可依循。

### Decision 2：隊伍分數重算沿用 `pairing.ts` 的「總和」算法，不重新定義為平均

**Choice**：換人後的隊伍 `rating` = `roundRating(該隊全體成員換人後 rating 的總和)`。

**Rationale**：見 Context——`buildTeam` 的既有算法就是總和（單打退化為單一值時與「平均」
無法區分，這正是簡報用語「隊員平均」的來源，但雙打的既有算法明確是總和）。若本 change
改用平均，雙打隊伍分數的定義會出現「剛產生時是總和、換人後是平均」的兩套並存語意，且
`match-history` 的 `toHistoryTeam`（`round.ts` 既有函式）在送出比分時仍會用總和重新計算
一次隊伍分數——換人後若曾短暫顯示「平均值」，使用者會在送出比分的瞬間看到隊伍分數「無故」
跳動，是不必要的體驗缺陷。

**Alternatives considered**：
- 平均值：否決，理由如上。且 `prd.md` 未定義任何「隊伍平均分數」的概念，5.4／5.5 的配對
  規則描述的也是「總和越接近越好」，平均不是本產品既有的詞彙。

### Decision 3：雙打組成標示重算重用已匯出的 `labelDoublesComposition`，`match-allocation` 零改動

**Choice**：`swapMatchPlayer` 直接 `import { labelDoublesComposition } from "./pairing"`，
以換人後 `[teamA 成員 0, teamA 成員 1, teamB 成員 0, teamB 成員 1]`（與 `allocation.ts` 的
私有 `relabelDoublesComposition` 相同順序）組出 4 元素 tuple 呼叫。

**Rationale**：見 Context——該函式已是公開匯出，不需要簡報預期的「比照 `MATCHMAKER_ROUTE`
前例補一個具名匯出」動作。`match-allocation` capability 因此連一行改動都沒有，proposal
的 Modified Capabilities 不需要列它。

**Alternatives considered**：
- 讓 `allocation.ts` 的私有 `relabelDoublesComposition` 改為公開匯出，`round.ts` 改呼叫它：
  否決——`relabelDoublesComposition` 的簽章是 `(match: Match) => Match`，接受的是
  `match-allocation` 的 in-memory `Match` 型別（`teams[].players` 為完整 `Player[]`），
  而 `swapMatchPlayer` 操作的是持久化的 `RoundMatch`（`teams[].playerIds` 為字串陣列）。
  要沿用它得先把 `RoundMatch` 轉成 `Match` 再轉回來，比直接呼叫底層的
  `labelDoublesComposition`（只需要 4 個已解析的 `Player`）多兩層無意義的型別轉換。
- 在 `round.ts` 內重新實作一次判定邏輯：`round-lifecycle` spec 明文
  SHALL NOT，且會製造兩套判定分歧的風險（`match-allocation` 的 Requirement 已規定判定規則，
  重寫一份等於讓 `prd.md` 5.5／7.3 的組成規則有兩個可能不同步的定義處）。

### Decision 4：換人的前置條件在純函式只檢查 `status === "pending"`；「已開始計分」的額外收斂留給 UI 層

**Choice**：`swapMatchPlayer` 本身只讀取 `round`／`players`，不接受計分板槽（`MatchSlots`）
作為輸入，判斷條件僅為 `match.status === "pending"`。「該場是否已在計分板開打」這個更嚴格
的收斂，由 `match-stage` capability 的「場地區塊的換人操作」Requirement 負責——`CourtCard`
以既有的 `inProgress`（`matchSlot !== null`）決定**是否顯示**換人操作，不是修改
`swapMatchPlayer` 的合法輸入範圍。

**Rationale**：`round.ts` 是純資料層，不 import `lib/scoreboard/**` 或
`scoreboard-binding.ts`——`scoreboard-binding.ts` 反過來 `import type { SubmitScoreInput }
from "./round"`，若 `round.ts` 也 import `scoreboard-binding.ts`，兩檔互相依賴會形成循環。
`isTargetScoreLocked` 之所以放在 `scoreboard-binding.ts` 而非 `round.ts`，正是同一個理由——
它需要同時讀 `Round` 與 `MatchSlots` 兩種型別，函式因此必須放在依賴方向較低的一側（依賴
`round.ts` 的型別，而非被 `round.ts` 依賴）。`swapMatchPlayer` 沒有理由打破這條既有的
分層方向。

實務後果：若有人繞過 UI 直接呼叫 `swapMatchPlayer`（例如未來的批次工具），只要
`RoundMatch.status` 仍是 `"pending"`，換人在資料層永遠合法——這與 `setTargetScore`／
`isTargetScoreLocked` 之間目前的關係完全對稱（該入口以 `status !== "pending"` 判定拒絕，
`isTargetScoreLocked` 額外納入槽狀態，round-lifecycle spec 明文允許這種「UI 收斂更嚴格，
資料層維持較寬的必要條件」的方向性差集，不允許相反方向）。

**Alternatives considered**：
- 讓 `swapMatchPlayer` 也接受 `MatchSlots` 參數：否決，會製造上述循環依賴，且把
  `round-lifecycle`（純資料）與 `scoreboard`（計分板）两個 capability 的型別耦合進同一個
  函式簽章，違反兩者目前刻意分離的邊界。
- 完全不管計分板槽，只用 `status`：否決——會讓已經在場邊實際開打的場次仍能被換人，
  換出的球員可能正在打這一分，資料與現實脫節（proposal Why 段的核心情境本身就是「還沒
  開始」的臨時異動，不是「打到一半」）。

### Decision 5：換人 UI 不修改 `PlayerTile.tsx`，操作放在 `CourtCard.tsx` 的球員格容器上

**Choice**：`PlayerTile.tsx` 維持現狀（不接受任何與換人相關的新 props）；換人的
`Select` 觸發器由 `CourtCard.tsx` 渲染在包住每個 `PlayerTile` 的容器 `<div>`（現有的
`style={{ gridColumn, gridRow }}` 那層）內，與 `PlayerTile` 並列。

**Rationale**：`PlayerTile` 目前零單元測試、只有一個消費端，職責單純是「畫一格」。若讓它
認識候選名單、`onSwapPlayer` 回呼與停用狀態，它就從「呈現元件」變成「同時處理呈現與換人
互動」，且未來任何要重用 `PlayerTile`（例如 `RestingPanel` 若日後改用它畫休息名單，
目前尚未如此但結構上相似）的地方都得決定要不要一併帶上換人邏輯。維持 `PlayerTile` 純粹、
把換人放在 `CourtCard` 的迴圈裡，改動面完全侷限在唯一真正擁有「這是哪一場、可以換誰」
這些脈絡的元件。

**Alternatives considered**：
- 讓 `PlayerTile` 接受 `swapCandidates`／`onSwap` 等 props：否決，理由如上。
- 建立新元件 `SwapTrigger.tsx` 封裝 `Select` 邏輯：評估後不採用——目前只有一個消費端
  （`CourtCard`），抽成獨立元件除了多一層 import 沒有實質好處；`prd.md` 或既有 codebase
  沒有「每個互動控制都要獨立成元件」的慣例（例如 `ScoreEntry.tsx` 也是內嵌在 `CourtCard`
  的呼叫鏈中，不是反例）。若日後真的出現第二個消費端，屆時再抽取。

### Decision 6：換人候選人不新增 prop，`CourtCard` 直接由既有的 `round`／`players` props 推導

**Choice**：`CourtCard` 不新增「休息名單候選人」這個 prop，而是在元件內部以
`round.restingPlayerIds` 與既有的 `players` prop 推導出「目前 active 的休息名單球員」——
與 `MatchStage.tsx` 目前算 `resting`（傳給 `RestingPanel`）用的是同一批來源資料，只是多一層
`isActive` 篩選。`CourtCard` 新增的 props 只有兩個：`onSwapPlayer`（回呼）與 `swapError`
（比照既有 `submitError` 的字串｜`null` 形態）。

**Rationale**：`CourtCard` 已經同時持有 `round` 與 `players` 兩個 props，候選人清單是這兩者
的純衍生值，沒有理由讓父層（`MatchStage`）多算一次再往下傳——那會讓「休息名單候選人是誰」
有兩個潛在的計算位置（`MatchStage` 算一次給 `RestingPanel` 顯示、又算一次給 `CourtCard`
判斷可換的人），任何一處的篩選條件（例如是否該濾掉 `isActive === false`）改了而忘記同步
另一處，就是靜默的行為分歧。收斂到 `CourtCard` 內部單一計算，且同一個 `round` 在該回合的
所有場地卡片間共用相同的休息名單來源，天然一致。

**Alternatives considered**：
- 由 `MatchStage` 計算一次並以新 prop 往下傳給每個 `CourtCard`：否決，理由如上（雙重計算
  風險），且會讓 `MatchStage`／`CourtCard` 之間多一個此前不存在的耦合面。

### Decision 7：換人操作的靜態文案進 `labels.ts`；`swapMatchPlayer` 的失敗訊息留在 `round.ts`

**Choice**：換人 `Select` 觸發器的兩種靜態顯示文字（「換人」／「無可換之人」）新增進
`lib/matchmaker/labels.ts`；`swapMatchPlayer` 五個失敗碼各自的繁體中文訊息，比照
`round.ts` 現有 13 個訊息常數的既定模式，留在 `round.ts` 內、緊鄰函式定義。

**Rationale**：`labels.ts` 檔頭註解自陳定位為「對戰文案常數的單一來源」，收錄的是
`TEAM_LABELS`／`FORMAT_LABEL`／`DOUBLES_COMPOSITION_LABEL` 這類**跨情境重複使用的顯示
詞彙**；「換人」／「無可換之人」正是這一類——它們是按鈕上的靜態標籤，不含任何情境相關的
動態內容。而 `swapMatchPlayer` 的失敗訊息是**該函式特定的驗證訊息**（如
`SCORING_STARTED_MESSAGE`、`TIE_MESSAGE` 等），`round.ts` 現有 13 個同類常數沒有一個被
收進 `labels.ts`，把換人的訊息單獨破例會讓「什麼該進 `labels.ts`」這條界線變得無法預測。

**Alternatives considered**：
- 把五個失敗訊息也放進 `labels.ts`：否決，理由如上（違反該檔既有的收錄範圍慣例，且
  `labels.ts` 目前完全不 import 任何失敗碼型別，硬塞訊息會需要它認識 `round.ts` 的錯誤
  代碼，方向顛倒——`round.ts` 已 import `labels.ts` 的 `FORMAT_LABEL`，讓 `labels.ts` 反過來
  依賴 `round.ts` 的失敗碼型別會形成循環）。

### Decision 8：休息名單互換後，換出者附加於 `restingPlayerIds` 陣列尾端

**Choice**：換人成功後，`restingPlayerIds` = 移除 `inPlayerId` 後的原陣列，**加上**
`outPlayerId` 附加在陣列尾端。

**Rationale**：`restingPlayerIds` 的原始順序來自 `candidates.ts` 的休息次數優先排序
（產生本輪對戰的當下決定），換人是產生之後的局部修正，本 change 不試圖把新加入的
換出者「插入」到某個依優先序推算的位置——`RestingPanel.tsx` 的檔頭註解已明文「本元件不
對名單做排序或篩選，名單的內容與順序完全由分配引擎決定」，若 `swapMatchPlayer` 為了維持
排序語意而重新排序整個 `restingPlayerIds`，會與這條既有承諾衝突（排序依據需要每位球員的
`restCount`，而 `restCount` 在換人當下可能已經與產生本輪時不同，重新排序反而製造一個
「看似有意義但實際上依據過期資料」的順序）。附加於尾端是最不會誤導使用者的做法——
`RestingPanel` 呈現「休息中」這件事實本身不需要排序保證。

**Alternatives considered**：
- 依 `restCount` 重新排序整個陣列：否決，理由如上。

### Decision 9：找不到隊友可解析時，`doublesComposition` 維持換人前的值

**Choice**：換人後若雙打場次另一隊或同隊的某位既有隊友已無法從 `players` 解析（已被移除），
`doublesComposition` 欄位維持換人前的值，不嘗試以佔位資料湊出 4 人。

**Rationale**：`labelDoublesComposition` 的簽章要求 4 個**已解析**的 `Player`，這是
`match-allocation` capability 刻意的型別收斂（design 該 capability 的既有決策：「規格約束
凡是型別做得到的就該用型別做」）。本 change 不新增任何「佔位 `Player`」的做法去滿足這個
簽章——`visual-export` capability 曾為了匯出畫面而引入「找不到球員時的替代文字佔位」
（design Decision 8），但那是**顯示層**的退路；`doublesComposition` 是**持久化欄位**，
用假資料算出的標示會被寫回 `matchmaker:round:v1`，比顯示層的暫時退路危險得多。維持舊值
是唯一不需要臆測缺席球員任何屬性（含性別）的選項。

**Alternatives considered**：
- 退回 `"general"`：否決——會讓一個原本明確的男雙／女雙/混雙標示，因為**另一隊**某位
  無關的球員被移除，而在**這一隊**換人時被覆寫成語意較弱的值，換人操作本身沒有理由
  改變另一隊的標示準確度。
- 拋出例外拒絕整次換人：否決——球員被移除是資料模型早已允許的既有狀態（`round.ts` 的
  `resolveTeamPlayers` 對此一貫寬容降級，不拋錯），换人操作本身完全合法，不該被一個與
  换人無關的既有資料狀態擋下。

## Risks / Trade-offs

- **[換人與計分板槽的判定分散在兩處]** → `swapMatchPlayer`（`round.ts`，只查 `status`）與
  `CourtCard` 的顯示邏輯（額外查 `matchSlot`）是兩個獨立的判斷點，理由見 Decision 4。
  緩解：兩者的方向性差集（UI 更嚴格）與 `isTargetScoreLocked`／`setTargetScore` 的既有
  先例完全對稱，且本 change 的 spec 已明文兩者不可反向；tasks 的收尾驗證會加入一條機械
  比對，確認兩處判定沒有互相矛盾的組合被漏測。
- **[`restingPlayerIds` 附加於尾端可能與使用者直覺的「休息次數排序」不符]** → 見 Decision 8。
  緩解：`RestingPanel` 本就不承諾排序語意，且下一輪產生時 `candidates.ts` 會依當時的
  `restCount` 重新排序整份候選池，這個順序只是暫時的顯示順序，不影響任何分配決策。
- **[換人操作對每個球員格重複渲染一個 `Select`，雙打場次一次多出 4 個互動元素]** →
  視覺與觸控密度增加。緩解：只在真正可換人的狀態下渲染（`pending` 且未開始計分），
  已完成與計分中的場次完全不受影響；且對戰頁本就是為多場地並行設計的密集版面
  （`match-stage` 既有的 2x2 色塊網格），多 4 個小型選單觸發器與既有密度相容。
- **[換人是本 change 唯一會讓「隊伍分數」在使用者眼前變動而非透過送出比分產生的操作]** →
  這與 `prd.md` 6.4.7「手動覆蓋」允許使用者直接修改個人 rating 的既有精神一致（分數不是
  神聖不可變的，換人只是另一種會影響隊伍分數顯示的合法操作）；緩解在於**個人**
  `Player.rating` 完全不被本 change 觸碰，只有**隊伍**（`RoundTeam.rating`，屬回合快照）
  重算，使用者名單頁看到的個人分數不受影響。

## Open Questions

1. **apply §0 MUST 以合併後的 `main` 重新對齊 `CourtCard.tsx`／`MatchStage.tsx` 的實際內容**
   ——本 change 序列相依於 M12（`matchmaker-scoreboard-team-labels`），而 M12 的簡報範圍
   已知會修改 `CourtCard.tsx`（隊伍文案）。propose 階段引用的行號、既有 props 清單
   （`CourtCardProps`／`MatchStageProps`）皆以 propose 當下的 `main`（`3fa2d22`，M12 尚未
   合併）為準。apply 的 §0 MUST 重新讀取合併 M12 後的兩個檔案，把本 change 新增的
   `onSwapPlayer`／`swapError` props 與換人操作的渲染位置對齊 M12 實際留下的 JSX 結構，
   差異記錄於本檔案，SHALL NOT 依本文件撰寫時的假設開工。
2. **`Select` 觸發器停用時的可見文案「無可換之人」是否需要在雙打四格各自重複顯示**——
   本 change 傾向「是」（每格獨立判斷、獨立顯示，行為單純且每格皆可獨立由讀屏使用者
   理解），但這會讓同一場地同時出現到 4 次相同文字。若 apply 階段實作後現場評估視覺雜訊
   過高，可改為場地層級只顯示一次說明文字、四個觸發器仍各自 `disabled`——這是視覺呈現的
   微調，不改變 spec 的任何 MUST，留給 apply 的 Stage 2 品質審查判斷，不預先鎖死做法。
3. **雙打換人是否需要同時提示「這會改變隊伍分數」**——spec 未要求任何額外的確認對話框或
   提示，`prd.md` 6.4.7 的手動覆蓋也沒有這類二次確認。暫定不加（YAGNI），但若使用者測試
   反映換人後分數無預警跳動造成困惑，屬於後續 change 可再評估的 UX 加強項，不在本 change
   範圍。
4. **CourtCard 現有測試檔的 `buildProps` fixture 是否需要新增 `restingPlayerIds` 或調整
   `players` 的既有預設值以支援換人測試**——propose 階段未讀取 `CourtCard.test.tsx` 的完整
   內容（只確認其存在與部分結構），apply 的 §0 或對應群組的 RED 階段 MUST 實讀該檔既有
   `buildProps` 與 `makePlayer`／`makeRound` 系列 fixture 的簽章後再決定是否新增或調整，
   SHALL NOT 假設現有 fixture 已滿足需求。
