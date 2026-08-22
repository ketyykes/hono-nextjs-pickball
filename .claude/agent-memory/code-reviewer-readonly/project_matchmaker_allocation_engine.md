---
name: project_matchmaker_allocation_engine
description: matchmaker-allocation-engine change（分配引擎純函式層）的設計決策、批次審查記錄與後續批次待驗證項
metadata:
  type: project
---

`openspec/changes/matchmaker-allocation-engine/` 是 `lib/matchmaker/` 的第二個 capability（M2），承接
[[project_matchmaker_architecture]]（M1 add-player-roster）。全段為**純函式、決定性、無 I/O**：不碰 LocalStorage、
不含 React、不累加 `restCount`（累加屬第 3 段的回合 capability）。

**核心不變式**：PRD 5.1 嚴格優先序 —— 模式結構性約束 ＞ 累計休息次數 ＞ 強度接近 ＞ 重複配對迴避。
前一項永遠不得為滿足後一項而讓步。審查任何後續批次都以這條為第一檢查項。

**Decision 1 的立論是「用型別結構強制優先序」**：拆成 `allocation-types.ts` / `candidates.ts` / `pairing.ts` /
`duplication.ts` / `allocation.ts`，讓 `pairing.ts` 在型別上就拿不到休息名單、`duplication.ts` 只能重排既有
`Match[]`。**審查時要把這條當成評分標準用**——凡是型別本來做得到卻沒做的規格約束，都算沒達成 Decision 1
（例如 `Match` 未用 discriminated union 表達「單打 MUST 不帶 doublesComposition」）。

## 第 1 批（型別骨架 + candidates.ts）審查記錄（commit 3ddc748，BASE 7034bab，判定：無 High，7 個 Medium）

實測結果：`tsc --noEmit` 乾淨、`eslint` 乾淨（僅 3 個他處既有 warning）、`candidates.test.ts` 6 tests 全綠。
排序方向、`countPlaying` 取整、暫停者排除、輸入唯讀性四項核心正確性**全數確認通過**，無 blocking。

Medium 摘要（細節見當次回報）：
1. `MIN_COURT_COUNT` 從頭到尾沒被任何測試 import 或斷言，但 it 名稱宣稱「場地數範圍為 1～8」。
   這正是 design Decision 2「常數斷言掛在消費端測試檔」這個緩解手段的失效點。
2. 「維持輸入的相對次序」測試 fixture 退化：id 為 `a,b,c` 且輸入順序已是字典序，
   加一個 `a.id.localeCompare(b.id)` tiebreak（最可能的 regression）三個測試仍全綠。
3. 兩個 spec Scenario 的 THEN 描述的是 `selectPlaying` 的出場／休息名單，測試只斷言 `sortCandidates` 排序。
4. `countPlaying` 對負數輸入回傳負數（JS `%` 保留被除數符號），與 `Array.slice` 的負索引語意結合會產出
   「看似合理但完全錯誤」的名單而非明顯錯誤。目前不可達，`allocation.ts`（Decision 7 的範圍檢查）尚未寫。
5. `SelectPlayingResult` 用 `Player[]` 而非 `readonly Player[]`，與 `allocation-types.ts` 全檔不一致。
6. `SignatureIndex` 用 `readonly string[]` 與 design Decision 4 自相矛盾（見下）。
7. `Match` 未用 discriminated union。

## 第 2 批（pairing.ts：單打配對／雙打組隊／組成標示）審查記錄（commit 682cd34，BASE 3ddc748，判定：無 High，5 個 Medium）

實測：`tsc --noEmit` 乾淨、`eslint` 乾淨、9 tests 全綠、spec 8 個驗收錨點逐字全中（另有 1 個額外 it）。
四項核心正確性全數確認通過：最佳性（見下）、標示隔離、tuple 推導、貪婪法正確性。

### 兩個最佳性結論已定案，不必再推

1. **雙打「最高＋最低 vs 第 2 高＋第 3 高」對所有 4 人組合都是三種分法中差最小者**。
   令排序後 a≥b≥c≥d、x=a−b、y=b−c、z=c−d（皆 ≥0），三種分法的差恰為
   `|x−z|`（實作採用）、`x+z`、`x+2y+z`，而 `|x−z| ≤ x+z ≤ x+2y+z` 恆成立。30 萬組隨機實測 0 反例。
   **無反例可舉，不要再花時間找。**
2. **單打「排序後相鄰兩兩配對」使分差總和最小，對任意偶數人數成立**（不只 4 人）。
   證明：總和 = Σ(相鄰 gap × 跨越該切點的對數)；第 k 個切點在 k 為奇數時至少被跨越 1 次、
   偶數時可為 0，相鄰配對正好在每個切點都打到下界。6 人／8 人各窮舉全部完美配對共 6000 組，0 反例。

日後若有人提議改「最強配最強」或引入最佳化求解器，這兩條就是「現行實作已達最佳」的證據。

### mutation check 存活清單（＝第 2 批的 5 個 Medium 主體）

被殺：組內分隊改 `高+第2 vs 第3+低`、`高+第3 vs 第2+低` → 各殺 2 個 it。

**存活（測試抓不到，皆為真缺口）**：
1. 拿掉 `sortByRatingDesc` 的 `.slice()`（原地改動呼叫端陣列）→ 9 個 it 全綠。
   spec「輸入的 `Player` 陣列 MUST 被視為唯讀」＋ design Decision 8 都要求，
   `candidates.test.ts:63` 已有現成的斷言寫法，`pairing.test.ts` 一句都沒有。
2. `courtNumber` 改恆為 1、或改 0 起算 → 全綠（測試從未斷言 `courtNumber`）。
   `pairing.ts` 自己指派場地編號，但 tasks 8.2 又要 `allocateRound` 指派一次——職責重疊。
3. `labelDoublesComposition` 的 fall-through 改成 `hasFemale ? "womens" : "mens"` → 全綠。
   空陣列現行回傳 `"womens"`（實測），改成回傳 `"mens"` 也沒人抓得到。
4. `pairSingles` 的 `i + 2 <= length` 改 `i < length` → 全綠。奇數人時會產出
   `players: [undefined]`、`rating: NaN` 的殘缺隊伍。`pairDoubles` 有殘組 it、`pairSingles` 沒有，
   **這個不對稱是固定檢查點**。

### 浮點加總：實測反例已找到

`buildTeam` 的 `reduce` 累加，在 PRD 1.00～8.00／兩位小數尺度下**確實會有誤差**。
實測：ratings `2.02, 2.01, 1.01, 1.00` → team1 = `3.02`、team2 = `3.0199999999999996`，
數學上該為 0 的差變成 `4.44e-16`。（`5.1+2.2` 那組反而剛好無誤差，別拿它當例子。）

**Why 之後會咬人**：design Decision 5 刻意選 `ratingSpread(後) <= ratingSpread(前)` 而非 `<`，
理由正是「不要白白放棄零成本的迴避機會」。float 噪音會讓一部分數學上相等的比較被判成 `>`，
等於偷偷退回 `<` 的行為。**審 tasks §7 時第一件事就是看那個 `<=` 有沒有帶 epsilon，
或 `buildTeam` 有沒有 `Math.round(sum*100)/100`（與 `roster.ts` 寫入點的 round 慣例一致）。**

### 已確認沒問題、不必重查的項目

- `teams: [buildTeam(...), buildTeam(...)]` **確實**被推導為 `readonly [Team, Team]` tuple，
  不是 `Team[]`——`matches.push()` 的參數型別 `Match` 提供 contextual typing。
  已用 tsc 實證（塞 1 個或 3 個元素都報 TS2322）。
- `labelDoublesComposition` 的回傳值只落在 `doublesComposition` 欄位，不流回任何排序／配對邏輯；
  `pairing.ts` 也確實沒 import `candidates.ts`。Decision 1 的隔離在這批成立。

## 第 3 批（duplication.ts：三類簽章／重複偵測／受限交換）審查記錄（commit 73470f6，BASE 3467ac9，判定：1 個 High（流程）、無程式碼 High）

實測：`tsc --noEmit` 乾淨、`eslint` 乾淨、`lib/matchmaker/` 8 檔 62 tests 全綠、4 個 spec 驗收錨點逐字全中。

### 已用性質測試定案、不必再推的結論

1. **`avoidRepeats` 的球員守恆是真的**。800 組隨機輸入（單打／雙打、1～4 場地）驗證：
   id multiset 不變、無人重複出現、隊伍人數恆完整、`Team.rating` 恆等於實際成員加總、
   重複數不上升、`ratingSpread` 不劣化、連呼叫兩次結果完全相同（決定性）。
   `swapPlayers` 同場次交換也正確——第二次 `rebuildMatch` 讀的是已更新的 `next[...]`，會疊加。
2. **`ratingSpread` 最後 `totalCents / 100` 除回浮點不會反轉大小關係**。IEEE754 round-to-nearest 單調，
   且相異整數 cents 相距 ≥ 0.01，要塌成同一個 double 需 totalCents ≈ 4.5e15；本 PRD 上限約 1.3e4。
   窮舉 0～20000 cents × delta 1/2/3 共 0 反例。**這條不用再算第二次。**
3. **`matchHitsSeen` 的第三道 `fullMatchKeys` 檢查是死碼（可證）**。full match key 命中 ⟹ 歷史有同樣兩隊 ⟹
   雙打必同時命中 teammateKeys、單打必同時命中 opponentKeys。5000 組隨機搜尋 0 個「只靠 full 命中」的反例。
   拿掉該行測試全綠。索引仍該收（spec 要求三類簽章），但別把它當偵測力。
4. **貪婪法對「完全重複的雙打場次」束手無策**。單次交換只能拆掉一隊，另一隊的 teammate key 仍命中，
   `countRepeats`（計場而非計次）於是不變 → 嚴格 `<` 判準全數回退。已實測反例：
   歷史 `[m1,m4] vs [m2,m3]`，現況同組 + 另一場 4 女同分，存在 `[m1,f4] vs [m4,f1]` ／ `[m2,f2] vs [m3,f3]`
   的**零成本解（spread 0、repeats 0）**，但 `avoidRepeats` 原封不動回傳。這是 design「不追求全域最優」的
   已知取捨，不是 bug；但 §8 若期待雙打重複會被清掉就會落空。

### mutation 存活清單（第 3 批，5 個測試）

被殺：移除 spread 守門、swap 只改單邊（兩個方向）、單打 teammateKeys 改回傳單人 key、
`sortedJoin` 不排序、三處 `.sort()` 拿掉、`buildSignatureIndex` 少收 teammate／opponent、
`matchHitsSeen` 少查 teammate／opponent、`rebuildMatch` 不重算 `Team.rating`、`avoidRepeats` 整個 no-op。

**存活（皆為真缺口）**：
1. 三個階段**各自**停用 → 全綠（任一階段單獨就能過現有測試；且兩個 `avoidRepeats` 測試都是單打，
   而單打的階段②只是換邊、無意義，等於**階段②從未被執行過任何一次有效路徑**）。
2. `spread <= ` 改 `spread <` → 全綠。Decision 5 最在意的「零成本交換要接受」完全沒被 pin。
   **已驗證能殺掉它的 fixture**：a5.0 vs b3.0（重複）／c5.0 vs d3.0，交換後 spread 恰好相等仍須採納。
3. `repeats <` 改 `repeats <=` → 全綠，但**是巧合**：階段②把兩場都換邊、階段③又換回來，結果抵銷。
4. `countRepeats` 改成計次而非計場 → 全綠（兩個 fixture 都恰好只命中 1 類）。
5. 階段③的 `|| compareSlot` tiebreaker 拿掉、排序方向反轉 → 全綠。
6. `opponentKeys` 誤用 `|` 分隔符 → 全綠（三類 key 存在不同 Set，本來就不會互撞，屬不可觀察）。
7. `ratingSpread` 不除回 100（回傳 cents）→ 全綠（測試只做相對比較，回傳單位無人 pin）。

### 浮點防護測試是**假的**——這條最容易再犯

`duplication.test.ts` 的「ratingSpread 的浮點誤差防護」用 `1.1+2.2` vs `1.0+2.3`。
raw 差確實是 4.44e-16，**但 `*100` 之後兩邊都恰好是 330，`Math.round` 根本沒出手**——
拿掉 `Math.round` 測試照樣全綠（已實測）。
**本檔上方第 2 批記錄的 `2.02+1.00` vs `2.01+1.01` 才是真反例**：`*100` 後差 5.68e-14，
換上它就能殺掉「拿掉 `Math.round`」的變異，且原始碼仍通過（已實測三種組合確認）。
教訓：**驗證浮點防護的 fixture 必須在「防護手段被移除後」失敗，不能只在「完全沒防護」時失敗。**

## 第 4 批（allocation.ts：`allocateRound` 串接 + §9 優先序整體保證）審查記錄（commit 62cccc0，BASE 73470f6，判定：1 個 High、5 個 Medium）

實測：`tsc --noEmit` 乾淨、`eslint` 乾淨、10 個 spec 驗收錨點逐字全中且無 spec 外 it。
`allocateRound` 確實只有 4 個 statement，無邏輯外洩（Decision 1 成立）。
`lib/matchmaker/` 非測試檔全域無 `Math.random`／`Date.now`／`crypto`，決定性成立。

### 三個「順序／編號」疑慮已定案，不必再查

1. **`avoidRepeats` 不會改變場次順序**。`matches.slice()` → `next[slot.matchIndex] = ...` → `map`，
   全鏈索引保序；實測 courtNumber `[1,2,3]` 前後不變。**「換人導致場地編號錯位」是不存在的風險。**
2. **步驟 4 的場地編號覆寫是今日的死碼**。`pairSingles`／`pairDoubles` 已用同一個 index 指派 1..n，
   保序又不變 ⇒ 整段 `avoided.map(...courtNumber: index + 1)` 刪掉後 10 個測試全綠（M22）。
   兩個寫入點值恆等、無測試 pin 哪個生效，是未被測到的接縫。
3. **`countPlaying` 的負數陷阱在本批仍不可達**（`Math.max(0, ...)` 已夾）。

### 這批的 7 個「立即全綠」測試：mutation 判定（逐一實測）

**有殺傷力（理由「前面批次已驗證、本批只是重新曝光」成立）**：
- 「強度差距再大也不得讓休息次數多者繼續休息」——**本批最強的測試**。殺掉 `restCount` 反向、
  拿掉整層 `restCount`、取排序後末 N 名、`rating` 反向。
- 「避免重複會改變出場人選時接受重複」——殺掉 `allocateRound` 事後把 `resting` 換上場、
  事後丟棄仍重複的場次，**連「破壞型別邊界、讓 `avoidRepeats` 真的收 bench 參數並換人上場」也殺得掉**。
  不是在測結構上不可能的情況。
- 「分配不修改輸入的參賽者物件」——`structuredClone` + `toEqual` 是**真深層比對**：
  殺掉 `gamesPlayed++`、`restCount++`、輸入陣列原地排序三種。
- 「連續多輪後出場機會輪轉」——殺掉「`selectPlaying` 取前 N 個未排序者」（12 輪下 spread 12）。
- 「場地無法填滿時只產生可完整組成的場次」——殺掉 `countPlaying` 拿掉向下取整。

**存活清單（＝本批 Medium 主體）**：
1. `avoidRepeats` 整個改成 no-op（`const avoided = paired`）→ 全綠。連同「拿掉 spread 守門」
   「`<=` 改 `<`」「採納條件反向成 `repeats >`」「只保留階段①」「掃描順序隨機化」全部存活。
   **本批三個重複相關的 it 全都只證明「沒有發生交換」，沒有一個證明接線可用。**
2. 性別當**最後 tiebreak**（`compareCandidates` 或 `sortByRatingDesc`）→ 全綠。
   「僅性別不同」的 fixture 5 人 rating 全相異、restCount 全 0，**tie 分支從未執行**。
   殺得掉的只有性別當主鍵、性別分隊、性別篩選候選池。
3. `sortCandidates` 加 `Math.random()` tiebreak → 全綠。「相同輸入產生相同輸出」的 fixture
   `restCount: i % 3` 有 tie 但 `rating: 8 - i*0.5` 全相異，`||` 永遠短路。**決定性測試對
   最可能的亂源（不穩定 tiebreak）完全盲目。**
4. `labelDoublesComposition` 恆回傳 `"general"` → 全綠（測試只有 `toBeDefined()`）。
5. `pairDoubles` 改「高+第2 vs 第3+低」、`pairSingles` 改「最強配最弱」→ 全綠（配對品質不在本層斷言，
   由 pairing.test.ts 負責，屬刻意分工）。
6. `resting` 混入 `isActive === false` 者 → 全綠（屬 §10 範圍）。

### `sortCandidates` 拿掉 `.slice()` **兩個測試檔都殺不掉**（修正本檔第 1 批的舊記載）

同時跑 `candidates.test.ts` + `allocation.test.ts` 共 18 tests 全綠。
`candidates.test.ts` 那句 `expect(players.map((p) => p.id)).toEqual(["c", "a", "b"])` 是**退化斷言**——
fixture 的 restCount／rating 全相等，穩定排序原地跑完順序照樣不變。
`allocateRound` 這條路徑則因 `filter()`／`slice()` 早已複製而結構上不可達。
**要殺它得換一份「排序後順序真的會變」的 fixture。**

### 兩個「Match 內部欄位在 avoidRepeats 後失去一致性」已量化（20000 組隨機雙打，8646 組發生交換）

- `doublesComposition` 標示失準 **2254 次**（約 26%）。已建構最小可重現：8 人 2 場，
  rating `8.01/8.01/7.02/7.02/7.02/7.02/6.03/6.03`，歷史只放隊友簽章（對手用不在名單的幽靈球員），
  一次跨場地換人即 repeats 2→0、spread 0→0，兩場同時從 mens／womens 變成實際 mixed 但標示不變。
- `Team.rating` 浮點雜訊 **3468 次**（約 40%），例：`6.61 + 4.42 => 11.030000000000001`。
  `pairing.ts` 的 `buildTeam` 有 `Math.round(sum*100)/100`＋六行註解說明不可省略，
  `duplication.ts:168` 的 `rebuildMatch` 卻用原始 `reduce`。**不影響決策**（`ratingSpread` 會
  `toRatingCents` 取整），純粹是會被第 3 段寫進 LocalStorage 的髒資料。
- **其餘欄位查過皆一致**：`format` 不變、`courtNumber` 被步驟 4 覆寫、球員 multiset 守恆
  （第 3 批已證）、階段③把同隊兩人配成相鄰時 `swapPlayers` 疊加後等於隊內互換（簽章與分數皆不變、
  不會被採納）。**不必再找第三個。**

## 待後續批次驗證的追蹤項

- **`SignatureIndex` 已收斂為 `ReadonlySet`**（commit `20b8a1f` 改的），design Decision 4 與
  `allocation-types.ts` 現在一致。但 **tasks.md 1.3 仍寫「三個 `readonly string[]`，而非 `Set`，確保可序列化」**，
  且第 3 批的 6.3 還回指 1.3。這行是現存唯一的過時敘述，後續批次順手核對。
- **`AllocationInput` 的「可序列化」約束被過度套用**。design.md Context 原文說的是「本段**輸出**將由第 3 段
  消費並持久化」，`allocation-types.ts:36` 把這條套到了**輸入**上。日後若有人主張 input 也必須可序列化，
  記得回頭核對 design.md 的原文範圍。
- **`countPlaying` 的負數行為**：`allocation.ts` 批次落地 Decision 7（場地數超出 1～8 拋錯不夾值）時，
  要確認範圍檢查發生在 `countPlaying` **之前**，否則第 1 批的負數陷阱就變成可達路徑。
- **spec 把邊界情境全押在 `allocation.test.ts`**（全員暫停／名單為空／人數不足／場地數超範圍／連續多輪輪轉／
  不修改輸入物件）。`candidates.ts` 層在這批確實沒測 0 人與人數不足，那是 spec 的刻意分工，不算漏，
  但審 `allocation.test.ts` 時這 6 個 Scenario 一個都不能少。

## How to apply

- **`Player` 是 `z.infer` 推出來的可變型別**，本 capability 全程共享原物件參照（`playing`／`resting`／
  `Team.players` 都是同一批物件）。`readonly Player[]` 只擋得住陣列層級改動，擋不住 `p.restCount++`。
  凡是宣稱「SHALL NOT 修改任何 Player 物件」的驗收，都要看是不是只靠註解在約束。
- **審排序類測試一律做 mutation check**：把「加 id/createdAt tiebreak」「先 reverse 再排」兩種變異套上現有
  fixture 跑一次，看測試會不會紅。第 1 批就是這樣抓到 fixture 退化的（node 腳本模擬 comparator 即可，
  不必改專案檔）。這比讀測試碼可靠得多。
- **mutation 沙箱可以完全不動專案樹**：把 `lib/matchmaker/` 的 `allocation.ts`／`candidates.ts`／
  `pairing.ts`／`duplication.ts`／`allocation-types.ts`／`types.ts` 與要跑的 `*.test.ts`
  複製到 scratchpad（這些檔對測試而言**無執行期相依**——`types.ts` 的 zod 只走 `import type` 會被抹除），
  symlink 專案 `node_modules`，寫一份 `environment: "node"` 的 vitest config 就能跑。
  另存一份 `orig/` 當還原基準，用 python 驅動「套變異 → `vitest run --reporter=json --outputFile=...`
  → 讀 `testResults[].assertionResults[].status` → 還原」，一次能跑十幾個變異並直接得到「哪幾個 it 被殺」。
  **`--reporter=basic` 在 vitest 4 已移除會啟動失敗**；測試內的 `console.log` 也不會出現在 stdout，
  要看中間值就故意 `expect(dump).toBe("__PRINT__")` 讓 assertion diff 印出來。
- **不要把探索用的測試檔留在專案樹裡**。2026-08-17 發現 `nextjs-pickball/lib/matchmaker/_scratch.test.ts`
  （untracked、故意 `throw`）讓 `pnpm test` 直接紅燈並多 2 個 eslint warning，
  正好會擋掉 tasks 11.2／11.3。沙箱一律放 scratchpad。
- **固定檢查「實作 commit 有沒有更新 tasks.md」**。commit 682cd34 訊息寫「實作 tasks 3-5」，
  但 tasks.md §3／§4／§5 全數仍是 `[ ]`，該 commit 完全沒碰 openspec 檔案；
  [[project_matchmaker_architecture]] 記錄的 M1 Task 5 也發生過同一件事。
  **Why 重要**：測試與實作放同一個 commit 時，TDD 紅燈證據**只存在於 tasks.md**，
  空著就等於沒有證據，`/opsx:verify` 也無法機械核對。歸類為程序問題（中），不是程式碼問題。
- **`tasks.md` 的 🔴 勾選必須配紅燈輸出，否則整批 TDD 無證據**。§3-§5 已用 ⚠️ 區塊如實記錄缺口
  （commit `f500b7a`），但**第 3 批的 §6／§7 全部勾成 `[x]`、連一行紅燈輸出或 ⚠️ 註記都沒有**，
  而測試與實作同在 commit `73470f6`。這是**重複第二次**的同一個流程問題，判 High。
  審每一批的第一件事就是 `git diff <base>..<head> -- openspec/.../tasks.md`，看 🔴 條目旁有無證據。
- **驗收錨點核對用 regex，不用目視**（tasks 11.1 明文要求）：從 spec.md 抽
  `**驗收**：\`<path>\`，it 名稱「<name>」`，跟測試檔的 `it("...")` 逐字比對。
- **不要把 `*-types.ts` 當成 TDD 例外檔**。例外清單（現載於 `nextjs-pickball/CLAUDE.md` 的
  TDD 節，2026-08-22 前在 `openspec/config.yaml`）只列型別檔 `*.d.ts`。純型別檔之所以免測，
  靠的是主句「行為邏輯模組採 TDD」，而不是副檔名。檔案一旦匯出執行期常數就有對外可觀察值，斷言得掛在某處。
