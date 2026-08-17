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

- [ ] 5.1 🔴 補四個 it：「雙打以兩隊平均分數計算預測勝率」、「雙打同隊兩人出場次數相同時分數變動相同」、「雙打同隊出場次數不同時變動方向相同但幅度不同」、「雙打回傳四位球員各自的評分變動」。確認紅燈
- [ ] 5.2 🟢 實作雙打路徑：`E` 取**兩隊平均分數**（`sum / players.length`），**不可**用總和（總和會讓分差放大一倍，脫離 `D = 3.0` 的校準）
- [ ] 5.3 🟢 同隊兩人共用同一個 `(S - E)`，但各自套用自己的 `effectiveK`（design Decision 1——這是 PRD 6.4.3 與 6.4.4 衝突的擇一結果，理由見 design）
- [ ] 5.4 ♻️ refactor：確認單打其實是「每隊 1 人」的雙打特例，若能自然統一就統一，不能就在註解說明為何分開

## 6. 上下限與撞邊界標記（rating.ts）

- [ ] 6.1 🔴 補五個 it：「分數達上限者獲勝後不再加分且標記已達上限」、「分數達下限者落敗後不再扣分且標記已達下限」、「賽後分數在範圍內時不帶撞邊界標記」、「撞邊界者仍照常參與計算不影響對手的扣分」、「接近上限時賽後分數恰好夾至 8.00 不超出」。確認紅燈
- [ ] 6.2 🟢 實作 clamp 至 `MIN_RATING`～`MAX_RATING`，並依 clamp 是否生效設定 `clamped`
- [ ] 6.3 🟢 撞邊界者的分數仍照常參與 `expectedScore` 與 `effectiveK` 的計算，只有**自身寫回值**被夾（PRD 6.4.6：「已達上限或下限者仍照常參與計算與配對」）
- [ ] 6.4 🟢 `clamped` 的判定基準是「clamp 是否真的改變了值」，不是「賽後分數是否等於邊界值」——恰好算到 8.00 而未被夾的情況 MUST 為 `"none"`
- [ ] 6.5 ♻️ refactor：clamp 邏輯集中一處，單打與雙打共用

## 7. 零和的適用範圍（rating.ts）

- [ ] 7.1 🔴 補三個 it：「出場次數相同且未撞邊界時勝方加分等於敗方扣分」、「出場次數不同時勝方加分不等於敗方扣分」、「撞邊界時群體總分不守恆且偏離可由標記觀測」。確認紅燈
- [ ] 7.2 🟢 確認實作**不做**任何為了維持守恆的修補（例如把敗方扣分綁到勝方實際加分）——design Decision 2 明確否決該做法
- [ ] 7.3 🟢 守恆斷言的容差取 `0.01`（四捨五入至兩位小數的殘差），不要用 `toBe`
- [ ] 7.4 ♻️ refactor：在 `rating.ts` 檔頭註解說明零和成立的三個條件，引用 design Decision 2

## 8. 無狀態與決定性（rating.ts）

- [ ] 8.1 🔴 補四個 it：「相同輸入產生相同輸出」、「評分更新不修改輸入的參賽者物件」、「手動覆蓋後的分數直接作為輸入且不受過往比賽影響」、「每筆變動含球員 id 與賽前賽後分數」。確認紅燈
- [ ] 8.2 🟢 確認模組層級無可變狀態、無 `Math.random`、無 `Date.now`／`new Date()`
- [ ] 8.3 🟢 「不修改輸入」以 `structuredClone` 前後比對驗證（比對 `rating` 與 `gamesPlayed` 兩個欄位皆未變）
- [ ] 8.4 ♻️ refactor：確認 `updateRatings` 不依賴任何呼叫順序或外部狀態

## 9. Mutation 自我驗證（**不可跳過**）

對每一項改壞實作、跑 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts` 確認**變紅**，再還原確認**變綠**。兩次輸出都要貼進 tasks.md。

> **本批次只驗證與 §1～§4 實作相關的 5 項（9.1、9.2、9.3、9.7、9.8）**。9.4（隊伍平均
> `gamesPlayed`）、9.5（雙打總和 vs 平均）屬 §5 雙打路徑，9.6（clamp 標記）屬 §6，
> 本批次尚未實作對應程式碼，無法驗證，留給後續批次。9.9 待全部 9 項跑完才能下最終結論，
> 本批次先記錄「已驗證的 5 項皆一次全數殺死，無存活」。

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

- [ ] 9.4 `effectiveK` 改用**隊伍平均** `gamesPlayed` 而非該員自己的（Decision 1 的反面）→ **不適用於本批次**：雙打路徑（§5）尚未實作，無此程式碼可改壞，留給 §5 批次驗證，非本批次遺漏
- [ ] 9.5 雙打的 `E` 改用隊伍**總和**而非平均 → **不適用於本批次**：雙打路徑（§5）尚未實作，留給 §5 批次驗證
- [ ] 9.6 clamp 改為只夾不標記（`clamped` 恆為 `"none"`）→ **不適用於本批次**：`clamped` 本就恆為 `"none"`（§6 尚未實作，clamp 邏輯不存在），留給 §6 批次驗證

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

- [ ] 9.9 尚未完整——**本批次已驗證的 5 項（9.1、9.2、9.3、9.7、9.8）皆一次全數殺死，無存活**，
      但 9.4～9.6 待後續批次跑完後才能對整個 §9 下最終結論，故本項暫不勾選。
      其中 9.8 特別暴露了「4 個必要 it 不夠」的風險——改壞後 4 個必要 it 全數通過，只有
      1 個額外補的防護測試命中。因此在 4.1 額外補了「賽後分數維持兩位小數精度」這個測試
      （用 `String(after)` 比對正規表示式，確保沒有超過兩位小數的浮點尾數殘留），不重算
      公式、純粹檢查「輸出契約是否為兩位小數」，避免與實作邏輯耦合。9.4～9.6 因本批次
      未實作對應程式碼而無法驗證，留給實作雙打（§5）與 clamp（§6）的後續批次補上真正的
      紅／綠證據——上面的「本批次未實作」只是說明現況，不構成通過。

## 10. 收尾驗證

- [ ] 10.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、it 名稱逐字相符。以腳本機械比對，不靠目視（本段共 27 個 Scenario）
- [ ] 10.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 全綠，貼出輸出
- [ ] 10.3 `pnpm lint` 通過，貼出輸出
- [ ] 10.4 `pnpm typecheck` 通過，貼出輸出
- [ ] 10.5 `pnpm test` 全套通過（確認未破壞第 1 段與 M1 既有測試），貼出輸出
- [ ] 10.6 本段無 UI，**不跑 E2E**；在此註明理由，避免日後誤判為漏跑
- [ ] 10.7 `DO_NOT_TRACK=1 openspec validate matchmaker-rating-engine --strict` 通過
