> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（**貼出輸出**）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> ⚠️ **紅燈證據與實作必須在同一個 commit**。第 1 段（`matchmaker-allocation-engine`）
> 因為「實作 commit 沒更新 tasks.md」被 code review 判過「高」，之後又以兩種變形各重犯一次。
> 測試與實作同 commit 時，紅燈證據**只存在於本檔**——空著就等於這批沒有 TDD 證據。
>
> ⚠️ **§9 的 mutation 自我驗證不是可選項**。第 1 段的三輪 code review 用 mutation 抓到
> **14 個存活變異**（改壞實作後測試照樣全綠），全部是「加入即綠」的 regression guard 造成的。
> 本段的公式是純數值運算，理應有真紅燈；但 fixture 若選得不好（例如剛好讓兩條路徑同值），
> 一樣會發生。實作者**自己跑 mutation**，不要等 review 事後抓。

> **批次記錄（第 1 批，本次）**：本次只完成 §1～§4，以及 §9 mutation 清單中與本批次實作
> 相關的 5 項（9.1、9.2、9.3、9.7、9.8）。§5（雙打）、§6（clamp）、§7（零和觀測）、
> §8（無狀態驗證）、§9 剩餘 4 項（9.4～9.6、9.9）、§10（收尾驗證）留給後續批次——
> 收尾驗證需待全部 Requirement 實作完成才有意義，本批次不跑。

## 1. 型別與常數

- [x] 1.1 建立 `nextjs-pickball/lib/matchmaker/rating.ts`，匯出常數 `RATING_D = 3.0`、`K_BASE = 0.15`、`K_DECAY_GAMES = 20`、`MIN_RATING = 1.0`、`MAX_RATING = 8.0`
- [x] 1.2 定義 `ClampFlag = "none" | "at-max" | "at-min"`
- [x] 1.3 定義 `RatingChange`（`playerId`、`before`、`after`、`delta`、`rawDelta`、`clamped`）與 `RatingUpdateInput`（`winners: readonly Player[]`、`losers: readonly Player[]`）
- [x] 1.4 型別匯入一律 `import type`；四捨五入**必須**取用 `./rating-math` 的 `roundRating`，不得另寫一份（design Decision 5）（本檔含執行期函式，不適用 `allocation-types.ts` 的「純型別檔」TDD 例外；常數與型別的可觀察行為由 §2～§4 的測試涵蓋，未另建無測試的骨架 commit）

## 2. 預測勝率（rating.ts）

- [x] 2.1 🔴 新增 `nextjs-pickball/lib/matchmaker/rating.test.ts`，寫入四個 it：「分數相同時預測勝率為 0.5」、「D 為 3.0 時四個校準點的預測勝率符合規格」、「交換雙方順序時兩個預測勝率相加為 1」、「D、K_base 與上下限以具名常數匯出且值符合規格」。跑單檔確認紅燈並貼出輸出

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (4 tests | 3 failed) 20ms
       × 分數相同時預測勝率為 0.5 9ms
       × D 為 3.0 時四個校準點的預測勝率符合規格 2ms
       × 交換雙方順序時兩個預測勝率相加為 1 1ms
   FAIL  lib/matchmaker/rating.test.ts > expectedScore > 分數相同時預測勝率為 0.5
  TypeError: expectedScore is not a function
   Test Files  1 failed (1)
        Tests  3 failed | 1 passed (4)
  ```

  （第 4 個 it「D、K_base 與上下限以具名常數匯出」在此步驟即為綠燈——常數已於 1.1 匯出，這是預期內的部分紅燈：紅燈標的是 `expectedScore`，不是常數本身。）
- [x] 2.2 🟢 實作 `expectedScore(ratingA, ratingB)`：`1 / (1 + 10 ** (-(ratingA - ratingB) / RATING_D))`
- [x] 2.3 🟢 校準點斷言用容差 0.01：分差 0.5→≈0.595、1.0→≈0.683、2.0→≈0.823、3.0→≈0.909（PRD 6.4.2 表列的 60/68/82/91% 為四捨五入後的呈現值）

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  4 passed (4)
  ```
- [x] 2.4 ♻️ refactor：確認常數只有一處定義，無魔術數字（skipped：`RATING_D` 只在 `expectedScore` 內出現一次，無重複，無需重構）

## 3. K 依出場次數遞減（rating.ts）

- [x] 3.1 🔴 補三個 it：「出場 0 場時 K_eff 為 K_base 的兩倍」、「出場 20 場時 K_eff 為 K_base 的一點五倍」、「K_eff 隨出場次數單調遞減且恆大於 K_base」。確認紅燈

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (7 tests | 3 failed) 26ms
       × 出場 0 場時 K_eff 為 K_base 的兩倍 7ms
       × 出場 20 場時 K_eff 為 K_base 的一點五倍 2ms
       × K_eff 隨出場次數單調遞減且恆大於 K_base 1ms
   FAIL  lib/matchmaker/rating.test.ts > effectiveK > 出場 0 場時 K_eff 為 K_base 的兩倍
  TypeError: effectiveK is not a function
   Test Files  1 failed (1)
        Tests  3 failed | 4 passed (7)
  ```
- [x] 3.2 🟢 實作 `effectiveK(gamesPlayed)`：`K_BASE * (1 + K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed))`
- [x] 3.3 🟢 單調遞減的斷言以迴圈掃過 0～200，逐項比較前後值嚴格遞減，且每一項皆 `> K_BASE`

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  7 passed (7)
  ```

  （首次實作 `effectiveK(20)` 斷言用 `toBe(0.225)` 出現浮點誤差 `0.22499999999999998 !== 0.225`——`0.15 * 1.5` 在 IEEE754 下不保證位元精確等於字面量 `0.225`。改用 `toBeCloseTo(0.225, 10)` 後綠燈，`effectiveK(0)` 同步改為一致風格，這是浮點運算的正常現象，不是實作錯誤。）
- [x] 3.4 ♻️ refactor：確認 `effectiveK` 對 `gamesPlayed = 0` 不發生除以零（skipped：分母恆為 `K_DECAY_GAMES + gamesPlayed`，`gamesPlayed` 型別為 `number` 且 spec 只允許非負整數，`K_DECAY_GAMES = 20` 保證分母 `>= 20`，結構上不會除以零，無需額外防呆）

## 4. 單打賽後更新（rating.ts）

- [x] 4.1 🔴 補四個 it：「勢均力敵時單場變動趨近 0.075，新手為 0.15」、「爆冷獲勝者的加分明顯大於預期內獲勝者」、「出場次數少者的評分變動幅度大於出場次數多者」、「勝方分數增加敗方分數減少」。確認紅燈（另補一個 mutation 防護用的額外 it「賽後分數維持兩位小數精度」，見 §9 說明）

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (12 tests | 5 failed) 8ms
       × 勢均力敵時單場變動趨近 0.075，新手為 0.15 2ms
       × 爆冷獲勝者的加分明顯大於預期內獲勝者 0ms
       × 出場次數少者的評分變動幅度大於出場次數多者 0ms
       × 勝方分數增加敗方分數減少 0ms
       × 賽後分數維持兩位小數精度（確保套用 roundRating，不殘留浮點尾數） 0ms
   FAIL  lib/matchmaker/rating.test.ts > updateRatings（單打路徑） > 勢均力敵時單場變動趨近 0.075，新手為 0.15
  TypeError: updateRatings is not a function or its return value is not iterable
   Test Files  1 failed (1)
        Tests  5 failed | 7 passed (12)
  ```
- [x] 4.2 🟢 實作 `updateRatings(input)` 的單打路徑：每人以自身 `effectiveK(gamesPlayed)` 與相對於對手的 `expectedScore` 計算 `K_eff × (S - E)`
- [x] 4.3 🟢 `after` 經 `roundRating` 取兩位小數；`delta` 在 round **之後**計算，`rawDelta` 保留完整精度（design Decision 5）
- [x] 4.4 🟢 「勢均力敵趨近 0.075」的斷言注意 `K_eff` **恆大於** `K_base`：用大 `gamesPlayed`（例如 100000）逼近，斷言落在 0.075～0.076 之間，**不要**斷言等於 0.075（design Risks 第 3 點）（本斷言刻意讀 `rawDelta` 而非 `delta`——`delta` 經兩位小數 round 後在此區間會出現離散跳動（例如四捨五入成 0.08），無法平滑「趨近」，`rawDelta` 保留完整精度才適合做漸近斷言）

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  12 passed (12)
  ```
- [x] 4.5 ♻️ refactor：單打與雙打共用的「一位球員的變動計算」抽成內部輔助函式（實作為 `computePlayerChange(player, sMinusE)`，接受呼叫端算好的 `S − E`，為 §5 雙打路徑的「同隊兩人共用同一個 `S − E`、各自套用自己的 `K_eff`」預留介面；refactor 後重跑確認仍為 12/12 綠燈）

## 5. 雙打賽後更新（rating.ts）

> **批次記錄（第 2 批，本次）**：本次完成 §5～§9（§9 中與 §5～§8 相關的 9.4～9.6，以及
> 三項在原 §9 清單擬定時尚未預見、後續才發現有必要的額外 mutation，記為 9.10～9.12——
> 見 §9 說明）。§10 收尾驗證留給下達任務的 agent 自行執行，不在本批次勾選。

- [x] 5.1 🔴 補四個 it：「雙打以兩隊平均分數計算預測勝率」、「雙打同隊兩人出場次數相同時分數變動相同」、「雙打同隊出場次數不同時變動方向相同但幅度不同」、「雙打回傳四位球員各自的評分變動」。確認紅燈（另補一個 mutation 防護用的額外 it「雙打隊伍平均分數不對稱時仍以平均而非總和計算預測勝率」，見 §9.5 說明）

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (17 tests | 5 failed) 11ms
       × 雙打以兩隊平均分數計算預測勝率
       × 雙打隊伍平均分數不對稱時仍以平均而非總和計算預測勝率
       × 雙打同隊兩人出場次數相同時分數變動相同
       × 雙打同隊出場次數不同時變動方向相同但幅度不同
       × 雙打回傳四位球員各自的評分變動
   FAIL  lib/matchmaker/rating.test.ts > updateRatings（雙打路徑） > 雙打以兩隊平均分數計算預測勝率
  AssertionError: expected 0.1215658031575133 to be close to 0.15, received difference is 0.0284341968424867, but expected 5e-11
   FAIL  ... > 雙打同隊兩人出場次數相同時分數變動相同
  TypeError: Cannot read properties of undefined (reading 'delta')
   FAIL  ... > 雙打回傳四位球員各自的評分變動
  AssertionError: expected [ { playerId: 'w1', …(5) }, …(1) ] to have a length of 4 but got 2
   Test Files  1 failed (1)
        Tests  5 failed | 12 passed (17)
  ```

  （現行實作只取 `winners`／`losers` 的第一位，連「雙打以兩隊平均分數計算預測勝率」都紅了——
  因為它只用 `w1.rating` 而非兩隊平均，並非退化為 regression guard。）
- [x] 5.2 🟢 實作雙打路徑：`E` 取**兩隊平均分數**（`sum / players.length`），**不可**用總和（總和會讓分差放大一倍，脫離 `D = 3.0` 的校準）
- [x] 5.3 🟢 同隊兩人共用同一個 `(S - E)`，但各自套用自己的 `effectiveK`（design Decision 1——這是 PRD 6.4.3 與 6.4.4 衝突的擇一結果，理由見 design）

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  17 passed (17)
  ```
- [x] 5.4 ♻️ refactor：確認單打其實是「每隊 1 人」的雙打特例，若能自然統一就統一，不能就在註解說明為何分開（已統一：新增 `teamAverageRating(team)` helper，`updateRatings` 一律對 `input.winners`／`input.losers` 取平均並 `.map(computePlayerChange)`，單打因隊伍人數為 1 而自然套用同一段邏輯，不再有 `const [winner] = ...` 的單獨分支；refactor 後重跑仍為 17/17 綠燈）

## 6. 上下限與撞邊界標記（rating.ts）

- [x] 6.1 🔴 補五個 it：「分數達上限者獲勝後不再加分且標記已達上限」、「分數達下限者落敗後不再扣分且標記已達下限」、「賽後分數在範圍內時不帶撞邊界標記」、「撞邊界者仍照常參與計算不影響對手的扣分」、「接近上限時賽後分數恰好夾至 8.00 不超出」。確認紅燈（另補一個 mutation 防護用的額外 it「剛好算到上限而未真正超出邊界時不標記已達上限」，對應 tasks 6.4 的判定基準，見 §9.10 說明）

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (23 tests | 4 failed) 12ms
       × 分數達上限者獲勝後不再加分且標記已達上限
       × 分數達下限者落敗後不再扣分且標記已達下限
       × 撞邊界者仍照常參與計算不影響對手的扣分
       × 接近上限時賽後分數恰好夾至 8.00 不超出
   FAIL  lib/matchmaker/rating.test.ts > updateRatings（上下限與撞邊界標記） > 分數達上限者獲勝後不再加分且標記已達上限
  AssertionError: expected 8.02 to be 8 // Object.is equality
   FAIL  ... > 分數達下限者落敗後不再扣分且標記已達下限
  AssertionError: expected 0.99 to be 1 // Object.is equality
   FAIL  ... > 接近上限時賽後分數恰好夾至 8.00 不超出
  AssertionError: expected 8.09 to be 8 // Object.is equality
   Tests  4 failed | 19 passed (23)
  ```

  （「賽後分數在範圍內時不帶撞邊界標記」與額外補的「剛好算到上限而未真正超出邊界時不標記
  已達上限」這 2 個 it 在此步驟即為綠燈——`clamped` 在 clamp 邏輯實作前恆為 `"none"`，
  「未撞邊界時不帶標記」自然成立，是預期內的部分紅燈：紅燈標的是 clamp 本身，不是
  未撞邊界的分支。）
- [x] 6.2 🟢 實作 clamp 至 `MIN_RATING`～`MAX_RATING`，並依 clamp 是否生效設定 `clamped`
- [x] 6.3 🟢 撞邊界者的分數仍照常參與 `expectedScore` 與 `effectiveK` 的計算，只有**自身寫回值**被夾（PRD 6.4.6：「已達上限或下限者仍照常參與計算與配對」）
- [x] 6.4 🟢 `clamped` 的判定基準是「clamp 是否真的改變了值」，不是「賽後分數是否等於邊界值」——恰好算到 8.00 而未被夾的情況 MUST 為 `"none"`

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  23 passed (23)
  ```
- [x] 6.5 ♻️ refactor：clamp 邏輯集中一處，單打與雙打共用（實作為 `clampRating(theoreticalAfter)`，`computePlayerChange` 統一呼叫；單打與雙打皆透過 `computePlayerChange` 走同一份 clamp，無重複；refactor 前置作業，重跑仍為 23/23 綠燈）

## 7. 零和的適用範圍（rating.ts）

> ⚠️ **本節三個 it 加入當下即全數綠燈，非傳統紅燈**（CLAUDE.md「紅燈要是真的」條款）。
> §4（K 依個人 gamesPlayed 遞減）與 §6（clamp）在本批次已先實作完成，零和／非零和的
> 行為是這兩段既有正確實作的自然結果，加入斷言只是「觀察」不是「驅動新程式碼」。
> 未用 mutation check（改斷言故意失敗再改回）偽造紅燈；真正的紅／綠證據在 §9.11（把敗方
> 扣分綁到勝方實際加分的 mutation），三個 it 中有兩個（出場次數不同時不等、撞邊界時不
> 守恆）連同 §4／§6 既有 it 一起把這個 mutation 完整殺死。

- [x] 7.1 🔴 補三個 it：「出場次數相同且未撞邊界時勝方加分等於敗方扣分」、「出場次數不同時勝方加分不等於敗方扣分」、「撞邊界時群體總分不守恆且偏離可由標記觀測」。確認紅燈

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  26 passed (26)
  ```
  （3 個新 it 加入即全數通過，見上方 ⚠️ 說明；非本節遺漏，是既有實作的自然結果。）
- [x] 7.2 🟢 確認實作**不做**任何為了維持守恆的修補（例如把敗方扣分綁到勝方實際加分）——design Decision 2 明確否決該做法（程式碼檢視：`computePlayerChange` 只吃呼叫端算好的 `sMinusE` 與該員自己的 `gamesPlayed`，不讀取對手的計算結果；用 §9.11 的 mutation 反面驗證）
- [x] 7.3 🟢 守恆斷言的容差取 `0.01`（四捨五入至兩位小數的殘差），不要用 `toBe`（已用 `Math.abs(winnerChange.delta + loserChange.delta)).toBeLessThanOrEqual(0.01)` 而非 `toBe`）
- [x] 7.4 ♻️ refactor：在 `rating.ts` 檔頭註解說明零和成立的三個條件，引用 design Decision 2（第 1 批已寫入檔頭，本批次沿用並確認內容仍準確，未變動）

## 8. 無狀態與決定性（rating.ts）

> ⚠️ **本節四個 it 加入當下即全數綠燈，非傳統紅燈**（CLAUDE.md「紅燈要是真的」條款）。
> `rating.ts` 自第 1 批起即無模組層級可變狀態、無 `Math.random`／`Date.now`，`updateRatings`
> 也從未寫回輸入的 `Player`——這是既有實作的性質，本節只是把它們變成可觀察的 it。
> 真正的紅／綠證據在 §9.12（改為原地修改輸入 `player.rating` 的 mutation），單獨命中本節
> 「評分更新不修改輸入的參賽者物件」，並連帶讓 §4／§5／§7／§8 共 10 個既有 it 一起變紅。

- [x] 8.1 🔴 補四個 it：「相同輸入產生相同輸出」、「評分更新不修改輸入的參賽者物件」、「手動覆蓋後的分數直接作為輸入且不受過往比賽影響」、「每筆變動含球員 id 與賽前賽後分數」。確認紅燈

  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  30 passed (30)
  ```
  （4 個新 it 加入即全數通過，見上方 ⚠️ 說明。）
- [x] 8.2 🟢 確認模組層級無可變狀態、無 `Math.random`、無 `Date.now`／`new Date()`

  ```
  $ grep -nE "Math\.random|Date\.now|new Date|^\s*let \b" nextjs-pickball/lib/matchmaker/rating.ts
  無命中，符合 §8.2 無狀態要求
  ```
- [x] 8.3 🟢 「不修改輸入」以 `structuredClone` 前後比對驗證（比對 `rating` 與 `gamesPlayed` 兩個欄位皆未變）
- [x] 8.4 ♻️ refactor：確認 `updateRatings` 不依賴任何呼叫順序或外部狀態（程式碼檢視：函式體內僅使用參數與純函式呼叫，無模組層級變數讀寫，天然與呼叫順序無關；無需改動）

## 9. Mutation 自我驗證（**不可跳過**）

對每一項改壞實作、跑 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts` 確認**變紅**，再還原確認**變綠**。兩次輸出都要貼進 tasks.md。

> **第 1 批已驗證 9.1、9.2、9.3、9.7、9.8**（見下方，皆一次全數殺死）。**第 2 批（本次）
> 補上 9.4～9.6**（§5／§6 實作完成後才有程式碼可改壞），並新增 **9.10～9.12** 三項——這三項
> 不在原始 9.x 清單內：`9.4～9.6` 是 tasks.md 起草當下就預見的「Decision 1／2 反面」與
> 「clamp 是否標記」，但 tasks 6.4（判定基準）、§7（零和守恆修補）、§8（原地修改輸入）
> 這三個更細的行為直到 §6～§8 的 delta spec 段落實際寫出驗收 it 才顯出各自需要獨立的
> mutation 才能證明測試有殺傷力，故追加為 9.10～9.12，記錄方式與 9.1～9.9 一致。

- [x] 9.1 `RATING_D` 由 `3.0` 改為 `400`（標準 Elo 值）→ 須紅

  紅（3 failed：校準點、具名常數、爆冷加分）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (12 tests | 3 failed) ...
       × D 為 3.0 時四個校準點的預測勝率符合規格
       × D、K_base 與上下限以具名常數匯出且值符合規格
       × 爆冷獲勝者的加分明顯大於預期內獲勝者
  AssertionError: expected 400 to be 3 // Object.is equality
   Tests  3 failed | 9 passed (12)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  12 passed (12)
  ```

- [x] 9.2 `K_BASE` 由 `0.15` 改為 `0.30` → 須紅

  紅（4 failed：具名常數、K_eff 兩點、勢均力敵新手值）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (12 tests | 4 failed) ...
       × D、K_base 與上下限以具名常數匯出且值符合規格
       × 出場 0 場時 K_eff 為 K_base 的兩倍
       × 出場 20 場時 K_eff 為 K_base 的一點五倍
       × 勢均力敵時單場變動趨近 0.075，新手為 0.15
  AssertionError: expected 0.3 to be 0.15 // Object.is equality
   Tests  4 failed | 8 passed (12)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  12 passed (12)
  ```

- [x] 9.3 `effectiveK` 的 `K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed)` 改為固定 `1`（等於停用遞減）→ 須紅

  紅（4 failed：K_eff 20 場、單調遞減、勢均力敵老手值、出場次數少者變動較大）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (12 tests | 4 failed) ...
       × 出場 20 場時 K_eff 為 K_base 的一點五倍
       × K_eff 隨出場次數單調遞減且恆大於 K_base
       × 勢均力敵時單場變動趨近 0.075，新手為 0.15
       × 出場次數少者的評分變動幅度大於出場次數多者
  AssertionError: expected 0.3 to be close to 0.225 ...
  AssertionError: expected 0.3 to be less than 0.3
   Tests  4 failed | 8 passed (12)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  12 passed (12)
  ```

- [x] 9.4 `effectiveK` 改用**隊伍平均** `gamesPlayed` 而非該員自己的（Decision 1 的反面）→ 須紅

  紅（1 failed：雙打同隊出場次數不同時變動方向相同但幅度不同——兩人 `gamesPlayed` 分別為
  0 與 40 時若改用隊伍平均 20，兩人 `K_eff` 相同，delta 完全相同，違反「幅度不同」斷言）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (30 tests | 1 failed) 11ms
       × 雙打同隊出場次數不同時變動方向相同但幅度不同
  AssertionError: expected 0.11 not to be 0.11 // Object.is equality
   Tests  1 failed | 29 passed (30)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  30 passed (30)
  ```

- [x] 9.5 雙打的 `E` 改用隊伍**總和**而非平均 → 須紅

  紅（僅 1 failed，且只有 5.1 額外補的「不對稱」it 命中——delta spec 逐字規定的必要 it
  「雙打以兩隊平均分數計算預測勝率」用的是兩隊平均皆為 5.0 的對稱 fixture，總和剛好也
  相等（10.0 vs 10.0），無法區分取平均與誤用總和，屬 tie-fixture 陷阱；靠 5.1 額外補的
  「雙打隊伍平均分數不對稱時仍以平均而非總和計算預測勝率」單獨命中）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (30 tests | 1 failed) 11ms
       × 雙打隊伍平均分數不對稱時仍以平均而非總和計算預測勝率
  AssertionError: expected 0.013307105383290474 to be close to 0.05317650910902788, received difference is 0.039869403725737405, but expected 5e-11
   Tests  1 failed | 29 passed (30)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  30 passed (30)
  ```

- [x] 9.6 clamp 改為只夾不標記（`clamped` 恆為 `"none"`）→ 須紅

  紅（5 failed：§6 五個必要 it 中直接檢查 `clamped` 欄位的四個，加上 §7「撞邊界時群體
  總分不守恆且偏離可由標記觀測」也一併命中，因為它同時斷言 `clamped === "at-max"`）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (30 tests | 5 failed) 13ms
       × 分數達上限者獲勝後不再加分且標記已達上限
       × 分數達下限者落敗後不再扣分且標記已達下限
       × 撞邊界者仍照常參與計算不影響對手的扣分
       × 接近上限時賽後分數恰好夾至 8.00 不超出
       × 撞邊界時群體總分不守恆且偏離可由標記觀測
  AssertionError: expected 'none' to be 'at-max' // Object.is equality
   Tests  5 failed | 25 passed (30)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  30 passed (30)
  ```

- [x] 9.7 `expectedScore` 的分子分母顛倒（`E` 變成 `1 - E`）→ 須紅

  紅（2 failed：校準點、爆冷加分。分數相同與交換順序兩個 it 因對稱性不受單純符號翻轉影響，
  屬預期內不敏感，由校準點與爆冷加分兩個 it 補上殺傷力）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (12 tests | 2 failed) ...
       × D 為 3.0 時四個校準點的預測勝率符合規格
       × 爆冷獲勝者的加分明顯大於預期內獲勝者
  AssertionError: expected 0.18978065614162232 to be less than 0.01
  AssertionError: expected 0.009999999999999787 to be greater than 0.35999999999999943
   Tests  2 failed | 10 passed (12)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  12 passed (12)
  ```

- [x] 9.8 `after` 拿掉 `roundRating` → 須紅

  紅（僅 1 failed：4 個必要 it 選用的分數多半四捨五入後仍乾淨，未必能觀察到差異；
  由 tasks 4.1 額外補的「賽後分數維持兩位小數精度」防護測試單獨命中）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (12 tests | 1 failed) ...
       × 賽後分數維持兩位小數精度（確保套用 roundRating，不殘留浮點尾數）
  AssertionError: expected '5.396715794961714' to match /^\d+(\.\d{1,2})?$/
   Tests  1 failed | 11 passed (12)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  12 passed (12)
  ```

- [x] 9.10 clamp 的判定改成「賽後分數等於邊界值就標記」（`>=`／`<=` 取代 `>`／`<`）而非「clamp 真的改變了值」→ 須紅

  紅（僅 1 failed，且只有 6.1 額外補的「剛好算到上限」it 命中——delta spec 的五個必要 it
  都選在明確超出邊界的情境，不會踩到「理論值剛好等於邊界但未超出」這個分支，靠額外補的
  「剛好算到上限而未真正超出邊界時不標記已達上限」（7.85 + 0.15 = 8.00，理論值精確等於
  上限、未超出）單獨命中）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (30 tests | 1 failed) 12ms
       × 剛好算到上限而未真正超出邊界時不標記已達上限
  AssertionError: expected 'at-max' to be 'none' // Object.is equality
   Tests  1 failed | 29 passed (30)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  30 passed (30)
  ```

- [x] 9.11 把敗方扣分綁到勝方實際加分（Decision 2 明確否決的守恆修補：`loserDelta = -(Σ winnerDelta) / losers.length`）→ 須紅

  紅（10 failed，跨 §4／§6／§7／§8 四個小節，證明這個 mutation 對多個既有斷言都造成
  可觀測的偏差，不只是 §7 的專屬回歸）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (30 tests | 5 failed) 13ms
       × 勢均力敵時單場變動趨近 0.075，新手為 0.15
       × 分數達下限者落敗後不再扣分且標記已達下限
       × 撞邊界者仍照常參與計算不影響對手的扣分
       × 出場次數不同時勝方加分不等於敗方扣分
       × 撞邊界時群體總分不守恆且偏離可由標記觀測
  AssertionError: expected -0.08 to be greater than -0.076
  AssertionError: expected 0.99 to be 1 // Object.is equality
  AssertionError: expected -0 to be close to -0.02272727272727273, ...
  AssertionError: expected 0 to be greater than 0.01
  AssertionError: expected 13 to be less than 13
   Tests  5 failed | 25 passed (30)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  30 passed (30)
  ```

- [x] 9.12 `updateRatings` 改為原地修改輸入的 `player.rating`（`computePlayerChange` 內 `player.rating = after`）→ 須紅

  紅（10 failed，跨 §4／§5／§7／§8：一旦第一次呼叫改寫了輸入物件，後續讀取同一個 `player.rating`
  的計算與斷言全部被污染，含專門守備的「評分更新不修改輸入的參賽者物件」）：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   ❯ lib/matchmaker/rating.test.ts (30 tests | 10 failed) 16ms
       × 勢均力敵時單場變動趨近 0.075，新手為 0.15
       × 爆冷獲勝者的加分明顯大於預期內獲勝者
       × 出場次數少者的評分變動幅度大於出場次數多者
       × 勝方分數增加敗方分數減少
       × 雙打同隊出場次數不同時變動方向相同但幅度不同
       × 出場次數不同時勝方加分不等於敗方扣分
       × 相同輸入產生相同輸出
       × 評分更新不修改輸入的參賽者物件
       × 手動覆蓋後的分數直接作為輸入且不受過往比賽影響
       × 每筆變動含球員 id 與賽前賽後分數
   Tests  10 failed | 20 passed (30)
  ```
  還原後綠：
  ```
  $ pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts
   Test Files  1 passed (1)
        Tests  30 passed (30)
  ```

- [x] 9.9 **全部 12 項（9.1～9.8、9.10～9.12）皆一次全數殺死，無存活。**
      9.8（第 1 批）與 9.5／9.10（本批次）三項都證明「delta spec 逐字要求的必要 it」
      本身不足以偵測特定 mutation（roundRating 拿掉、雙打誤用總和、clamp 判定基準錯誤），
      皆是靠額外補在同一個 it 群組的防護測試單獨命中——這是本 change 兩批下來一致的模式：
      每個「多路徑公式在某個對稱／邊界輸入下退化」的風險點都需要額外補一個刻意不對稱或
      刻意貼著邊界的 fixture，不能只靠 spec 逐字要求的最小 it 集合。9.11／9.12 則相反，
      是「殺傷力過剩」的案例——分別命中 5 個與 10 個既有 it，顯示 §4／§5／§6／§7／§8 之間
      的既有測試彼此有交叉驗證效果，不是各自獨立的孤島。

## 10. 收尾驗證

- [ ] 10.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、it 名稱逐字相符。以腳本機械比對，不靠目視（本段共 27 個 Scenario）
- [ ] 10.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 全綠，貼出輸出
- [ ] 10.3 `pnpm lint` 通過，貼出輸出
- [ ] 10.4 `pnpm typecheck` 通過，貼出輸出
- [ ] 10.5 `pnpm test` 全套通過（確認未破壞第 1 段與 M1 既有測試），貼出輸出
- [ ] 10.6 本段無 UI，**不跑 E2E**；在此註明理由，避免日後誤判為漏跑
- [ ] 10.7 `DO_NOT_TRACK=1 openspec validate matchmaker-rating-engine --strict` 通過
