# Execution Plan: matchmaker-player-stats

## Mode

`subagent-driven`

派工單位採**逐組制**（自 M4 起本專案的既有做法，見 `matchmaker-runbook.md`「規模與 leader
接力」）：tasks.md 的每個 `§` 群組派一個全新的 Implementer subagent，由它一次做完該組所有
task。組內仍**逐 task 依序**走 TDD 三步——每個 task 先寫失敗測試並在 shell 實際看到紅燈
（貼出輸出），再最小實作至綠，再 refactor；紅燈誠實條款不變（加入即綠者 MUST 誠實標註為
regression guard，SHALL NOT 用「改斷言看紅再改回」偽造紅燈）。

兩階段審查改為**逐組**：整組所有 task 完成後才跑 Stage 1（規格符合，審整組）→ Stage 2
（程式品質，審整組），SHALL NOT 在組內逐 task 送審。全部群組完成後再跑一次 Final Code
Reviewer 檢查跨群組的一致性。

群組之間**仍嚴格序列**。SHALL NOT 並行派發多個 Implementer——它們共用同一個 worktree，
並行必然互相覆寫。

## Per-task contract

subagent **不繼承主對話的任何 context**。每次派工（單位為一個 `§` 群組）時，下列項目 MUST
逐字貼進 prompt，SHALL NOT 只給檔案路徑要對方自己去讀：

1. **tasks.md 該組的完整 task 文字**：該組所有 task 的 RED + GREEN 配對全文
   （REFACTOR task 則貼該項全文），依組內原順序排列。
2. **test-plan.md 該組對應的所有表格列**：Test name / Scenario / Assertion / Why first /
   Tier 五欄，一字不改。Tier 決定測試放哪一層與用哪個指令跑，不可省略。
3. **相關的 spec.md 片段**：貼本組觸及的**每一個** Requirement 全文及其 Scenario（含
   「驗收」錨點）。SHALL NOT 貼整份 spec。
4. **相關的 design.md 片段**：影響本組的 Decision 與 Risk 條目。對照表：
   - §2（`player-stats.ts` 核心 A：計算範圍/唯讀＋出場/勝負/勝率）→ Decision 2（純資料、
     不含文案）
   - §3（`player-stats.ts` 核心 B：目前強度/已不在名單＋淨變化）→ Decision 3（已離開名單
     球員的中性色，但本組不畫色，只需知道 `onRoster` 語意）
   - §4（`player-stats.ts` 核心 C：最常搭檔/對手＋排序）→ Decision 4（姓名以最近一次快照
     決定，不依賴輸入順序）、Decision 5（姓名比較用原生 `<`，不用 `localeCompare`）
   - §5（`PlayerStatsTable` 元件）→ Decision 2（純資料 vs 呈現文案的分工）、Decision 3
     （已離開名單的中性色常數）、Decision 6（九欄，`mostFrequentOpponent` 必須顯示）、
     Decision 7（沿用 `components/ui/table.tsx` 內建橫向捲動，不另寫斷點 CSS）
   - §6（`app/matchmaker/stats/page.tsx` 掛載）→ Decision 1（比照 M5 對戰頁的 hook 持有
     形態，不新增 View 元件、不新增 hook）
   - §7（`match-stage`：第五分頁導覽）→ match-stage 的 MODIFIED Requirement 全文
   - §8（唯讀保證與無障礙 e2e）→ Goals 的「全程唯讀」、Risks 的「目前強度不受區間篩選
     影響」
5. **明確的「不給你」清單**：其他群組的 task 內容、其他 capability 的 spec、`prd.md` 全文、
   本 change 以外的 openspec 檔案。若 subagent 認為缺 context，MUST 回報 `NEEDS_CONTEXT`
   而不是自行去翻。
6. **worktree 絕對路徑**（見 environment.md）：
   `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-player-stats`。
   所有 subagent 共用**同一個** worktree，SHALL NOT 自行 `git worktree add`。
7. **本 repo 的固定紀律**（每次都貼，不假設對方記得）：見下方「派工單必帶」a～i。

### 派工單必帶（來自 `matchmaker-runbook.md` 的派工經驗，逐條貼進每一份派工單）

a. **Implementer 交件前 MUST 自己先跑一輪 mutation 測試**，並在回報中列出「做了幾次、
   每次改什麼、是否轉紅」；有任何一次存活先補斷言再交件。
b. **Stage 2 Reviewer MUST 獨立再做一次 mutation**，不採信 Implementer 的自述；
   **逐分支逐欄位機械盤點覆蓋率**（`onRoster` 的 true/false 兩分支、`mostFrequentPartner`／
   `mostFrequentOpponent` 的有值/null 兩分支、排序四層比較的每一層皆須各自有存活率），
   並檢查是否有恆真斷言（例如 `toEqual` 兩邊剛好是同一個物件參考），回報存活數。
c. **紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗**；查核不過就更正為
   regression guard 並補 mutation 驗證，SHALL NOT 逕自採信 Implementer 的文字描述。
d. **逐 task commit**：`test:` 一個、`feat:` 一個；不要一組一個 commit——每次紅燈才能
   獨立留在版控裡，供事後用 `git show <commit>^:<path>` 直接複驗。
e. **註解只寫「為什麼」**，不重述函式名、不誤植 milestone 編號（本 change 為 **M11**）。
f. **worktree 內的編輯器／IDE 診斷不可信**（常整批謊報 `Cannot find module` 或大量誤報
   implicit any）。一律以實跑 `pnpm -r exec tsc --noEmit` 的 exit code 為準；唯一可信的
   例外是「單一新檔的單一 import 解不到」——那是 TDD 紅燈，是真的。
g. **跑 E2E／preview 前先 `lsof -i :3005 -i :8787` 並且
   `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 交叉核對殘留 process 並
   全數 kill**；跑完立刻清掉自己起的 process。E2E 一律帶 `--workers=1`。
h. **派出 subagent 之後不可結束回合**；脈絡將盡就在派工**之前**乾淨停止、把狀態寫進
   design.md 的 `## Open Questions` 並 commit 後回報。「派工後無法審查」比停下來更糟。
i. **授權 Stage 2 直接修小東西**（dead export、補斷言），但要在回報的「偏離」欄如實記載。

其餘固定紀律：
- **Commit 訊息**：Conventional Commits、繁體中文，結尾加 footer
  `Claude-Session: <當前 session 的 session id>`（依 `matchmaker-runbook.md`「commit
  footer 慣例調整」——本機 CLI session 取不到 claude.ai URL，自 M3 續跑起改為直接填
  session id，SHALL NOT 自行編造 URL），**不得加** 🤖 Generated 或 Co-Authored-By。
- 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加
  `--`**（加了會跑完整套，紅燈證據被既有綠燈淹沒）。
- E2E 指令 `pnpm --filter ./nextjs-pickball test:e2e <path>`；webServer 會自動起前後端。
- `it`／`test` 名稱 MUST 與 spec 的「驗收」錨點**逐字一致**，否則 verify 無法機械核對。
- 註解與說明用繁體中文（台灣用語），程式碼命名用英文。
- `verbatimModuleSyntax` 已開啟，純型別匯入一律 `import type`；`describe`／`it`／`expect`／
  `vi` MUST 顯式 `import ... from "vitest"`（`tsconfig.json` 的 `types` 不含
  `vitest/globals`，省略時 vitest 跑得過但 `tsc --noEmit` 會失敗）。
- **SHALL NOT 新增任何 npm 相依**。需要新套件時一律回報 `BLOCKED`，由人類決定。
- 若某項行為早已實作使新測試立即全綠，MUST 在 tasks.md **誠實標註為 regression guard**，
  SHALL NOT 用「改斷言看紅再改回」偽造紅燈。

## Roles

### Implementer

- **default_model**: `sonnet`
- **rationale**: **不使用 `haiku`——這是使用者硬性規定**（`matchmaker-runbook.md`「累積下來
  的派工經驗」第 4 項：M4 §1 的 `haiku` 連續兩輪被 Stage 2 退回，理由是「失效的假測試」與
  「複述式註解」，每次退回要多付一次 opus 審查成本，反而更貴）。§2～§4 的多數 task 是
  「照著 test-plan 寫一個純函式分支」，規則已由 spec 與 design 定死，但姓名快照的
  recency 判斷（Decision 4）與排序的四層比較（Decision 5）需要跨案例一致的推理，
  `sonnet` 是能勝任且不會重蹈 M4 覆轍的最低檔位。
- **upgrade_to_opus_when**:
  - 群組觸及 §6（`app/matchmaker/stats/page.tsx` 掛載）——要把兩個既有 hook、
    `filterHistoryByRange`、`computePlayerStats` 與條件渲染接在一起，是本 change 唯一需要
    跨模組推理「谁先谁后、状态放哪」的地方。
  - 群組含 E2E task（`player-stats.spec.ts`／`match-stage.spec.ts`）——`addInitScript` 種資料
    的時機、`emulateMedia`／`scrollWidth` 量測、五個 browser project 的下載或版面差異都容易
    寫出假綠。
  - 同一群組被同一個 reviewer 連續退回 2 次。
- **self-review checklist**（整組提交前自己先過一遍，組內每個 task 都要滿足）:
  - [ ] 每個 task 的紅燈輸出真的都貼出來了，而且失敗訊息是「斷言不符」或「函式/模組不
        存在」，不是打錯字。
  - [ ] `it`／`test` 名稱與收到的 spec 驗收錨點逐字相同（含全形標點）。
  - [ ] 沒有動到本群組範圍外的檔案；特別是**沒有修改 M5～M9 的任何既有元件檔**
        （`MatchStage`／`CourtCard`／`RoundControls`／`RestingPanel`／`ExportActions`／
        `PrintSheet`／`HistoryView`／`HistoryRecordCard`／`HistoryRangeFilter`／
        `EmptyHistory`）。
  - [ ] `package.json` 沒有任何新增相依（`git diff package.json` 為空）。
  - [ ] `lib/matchmaker/player-stats.ts` 沒有觸碰 `window`／`document`／`localStorage`／
        `new Date()`／`fetch`。
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過。
  - [ ] 已依「派工單必帶」a 自跑 mutation 並在回報中列出次數與存活數。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**: 只需比對「程式有沒有做到 spec 說的事」，不需要對品味下判斷；但要能讀懂
  中文規格的細微差異（例如「已離開名單球員取最近一筆」與「取第一筆」都能通過一個寫鬆的
  斷言），`haiku` 容易放行。
- **required first action**: 覆述收到的 spec／test-plan 片段的**標題**。若與被審的群組
  對不上，回報 `NEEDS_CONTEXT` 而**不要**開始審。
- **review checklist**（一次審整組）:
  - [ ] 這個群組對應的每一個 Scenario 都有測試覆蓋，且測試名稱與驗收錨點逐字相同。
  - [ ] 組內每個 task 的 RED 測試真的映射到 Scenario 的 WHEN／THEN，不是換個容易通過的
        斷言。
  - [ ] 球員範圍聯集（名單∪歷史）、目前強度取值來源（名單 rating vs 歷史最近一筆
        ratingAfter）、勝負判定（依 `winner` 與所屬隊伍）三條規則在實作裡逐字對應
        spec，沒有簡化或漏掉分支。
  - [ ] 沒有 scope creep：沒有畫圖表、沒有做匯出、沒有新增 hook、沒有另寫第二套區間篩選
        或空狀態（design Non-Goals）。
  - [ ] 沒有 MODIFY `match-history`／`player-roster`／`round-lifecycle`／
        `pickleball-guide-page` 的任何 requirement。
  - [ ] 若測試是加入即綠的 regression guard，tasks.md 有誠實標註。
- **SHALL NOT**: 評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**: 品質判斷需要對本 repo 既有慣例的整體感（`lib/matchmaker/` 的純函式線、
  `labels.ts` 的文案收斂原則、`colors.ts` 的既有 API、`components/ui/table.tsx` 的既有
  用法），本 change 又特別容易在「計算層 vs 呈現層該由誰決定文案」的邊界上放水
  （design Decision 2）。
- **required first action**: 同 Stage 1，先覆述收到的片段標題；對不上就回報
  `NEEDS_CONTEXT`。
- **review checklist**:
  - [ ] 命名與既有 `lib/matchmaker/`、`components/matchmaker/` 的慣例一致。
  - [ ] 分層沒有被打破：`player-stats.ts` 零 I/O、零文案字串（Decision 2）；
        `app/matchmaker/stats/page.tsx` 不含任何統計計算邏輯，全數委派
        `computePlayerStats`／`filterHistoryByRange`。
  - [ ] 沒有重複邏輯：最常搭檔與最常對手的計數 MUST 共用同一個內部 tally helper
        （不是兩份幾乎一樣的迴圈）；排序比較邏輯只有一個具名函式。
  - [ ] 邊界處理：`gamesPlayed=0`、名單與歷史皆空、只打過單打（`mostFrequentPartner`
        必為 `null`）、多位球員四層排序全部同分、`ratingDelta` 為負值。
  - [ ] 「已不在名單」的顯示文字取自 `labels.ts` 的具名常數，元件內沒有第二份字面量。
  - [ ] 無障礙：色彩不是唯一資訊來源（已不在名單有文字標示、勝負有文字/數字表達）、
        區間篩選可鍵盤操作、表格於窄螢幕不撐開頁面。
  - [ ] 註解說明「為什麼」而非「做什麼」——尤其 Decision 3（中性色為何不 import
        `export-scene.ts`）、Decision 4（姓名為何取最近一次快照）、Decision 5（為何不用
        `localeCompare`）三處的取捨要能在程式碼註解裡找到依據，不能只留在 design.md。
  - [ ] 沒有引入新的 npm 相依。
- **SHALL NOT**: 重新爭論規格對不對（Stage 1 已經處理）。與 Implementer 的風格分歧時，
  **既有 codebase 風格勝出**。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**: 本 change 有 9 個 task 群、5 個檔案新增與 4 個既有檔案修改，橫跨純函式、
  React 元件、CSS 無關的表格捲動、既有測試改動與 E2E 四種性質；跨 task 的重複與分層破口
  只有在全部完成後、一次看完整份 diff 才看得出來。
- **when**: 所有 task 打勾之後，執行一次。
- **review checklist**（只看跨 task 的事）:
  - [ ] `player-stats.ts` 的命名風格、匯出形狀、JSDoc／註解密度與既有 `lib/matchmaker/`
        模組（`history-range.ts`／`duplication.ts`）一致。
  - [ ] `PlayerStatsTable` 的 props 命名與既有呈現型元件（`HistoryRecordCard.tsx`）一致，
        資料一律走 props 不 import store。
  - [ ] `grep` 機械確認 `computePlayerStats` 的呼叫點只有
        `app/matchmaker/stats/page.tsx` 一處——沒有任何一條路徑自行從 `history`／
        `players` 重組統計。
  - [ ] `git diff --stat` 確認：`package.json` 未變、`hooks/` 零新增、M5～M9 既有元件檔
        （見 Implementer self-review checklist 的清單）零改動。
  - [ ] `section-nav.test.ts` 唯一被改動的既有測試與 tasks.md §9 宣告的清單逐字相符，
        其餘既有測試 100% 原樣通過。
  - [ ] `nextjs-pickball/CLAUDE.md` 的架構總覽已同步（`/matchmaker` 補記
        `/matchmaker/stats`）。
  - [ ] 合併後的 diff 仍在 proposal 的 What Changes 範圍內，沒有混進 M10 或 M12 的東西。
- **SHALL NOT**: 重審單一 task 的細節（Stage 1／2 已涵蓋）。

## Escalation

- **同一群組被同一 reviewer 連續退回 3 次** → 升級 Implementer 的模型
  （`sonnet` → `opus`）後重新派工該群組。SHALL NOT 用同一個模型在同樣條件下重試。
- **Spec Reviewer 自身判斷前後不一致**（例如同一條 Scenario 這次過、下次不過）→ 代表規格
  本身有歧義，升級給人類澄清並把結論補進 design.md 的 Open Questions，SHALL NOT 由
  reviewer 自行選一個解釋繼續。
- **Code-Quality 與 Implementer 的風格分歧** → 既有 codebase 風格勝出。
- **任一階段 BLOCKED 超過 30 分鐘** → 升級給人類。
- **本 change 專屬的升級條件**：
  - Implementer 回報「`hooks/useRoundStore.ts` 或 `hooks/useRosterStore.ts` 的實際簽章與
    design 假設不符」→ 依 design Open Questions 第 1 條把實際簽章補記進 design.md 後再
    繼續；若差異大到需要改這兩個既有 hook 的介面，**升級給人類**，SHALL NOT 自行修改
    既有 hook。
  - Implementer 回報「`main` 上 M10（`matchmaker-stage-gaps`）尚未合併」→ 依環境設定停止
    整批派工，升級給人類，SHALL NOT 在本 change 內補做 M10。
  - Implementer 回報「九欄表格在窄螢幕下即使橫向捲動仍有無法接受的可用性問題，想改成
    隱藏部分欄位」→ 這牽動 design Decision 6／7 的既定範圍，**升級給人類**，SHALL NOT
    自行決定要隱藏哪些欄位。
  - 出現 `Worker "hono-pickball" not found` → 依 environment.md 的注意事項處理殘留
    process，SHALL NOT 把 `~/.wrangler/registry` 不存在當成根因。

## Model selection principle

用**能勝任該角色的最弱模型**，以節省成本與時間，但 Implementer 的下限固定為 `sonnet`
（本 change 的硬性規定，見上方 Roles 的 rationale）。`sonnet`／`opus` 是 Claude 的層級
名稱，僅作為範例；在沒有這些層級的環境上，對應到最接近的「均衡／最強」兩檔。
