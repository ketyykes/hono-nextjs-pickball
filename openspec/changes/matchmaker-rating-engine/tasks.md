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

## 1. 型別與常數

- [ ] 1.1 建立 `nextjs-pickball/lib/matchmaker/rating.ts`，匯出常數 `RATING_D = 3.0`、`K_BASE = 0.15`、`K_DECAY_GAMES = 20`、`MIN_RATING = 1.0`、`MAX_RATING = 8.0`
- [ ] 1.2 定義 `ClampFlag = "none" | "at-max" | "at-min"`
- [ ] 1.3 定義 `RatingChange`（`playerId`、`before`、`after`、`delta`、`rawDelta`、`clamped`）與 `RatingUpdateInput`（`winners: readonly Player[]`、`losers: readonly Player[]`）
- [ ] 1.4 型別匯入一律 `import type`；四捨五入**必須**取用 `./rating-math` 的 `roundRating`，不得另寫一份（design Decision 5）

## 2. 預測勝率（rating.ts）

- [ ] 2.1 🔴 新增 `nextjs-pickball/lib/matchmaker/rating.test.ts`，寫入四個 it：「分數相同時預測勝率為 0.5」、「D 為 3.0 時四個校準點的預測勝率符合規格」、「交換雙方順序時兩個預測勝率相加為 1」、「D、K_base 與上下限以具名常數匯出且值符合規格」。跑單檔確認紅燈並貼出輸出
- [ ] 2.2 🟢 實作 `expectedScore(ratingA, ratingB)`：`1 / (1 + 10 ** (-(ratingA - ratingB) / RATING_D))`
- [ ] 2.3 🟢 校準點斷言用容差 0.01：分差 0.5→≈0.595、1.0→≈0.683、2.0→≈0.823、3.0→≈0.909（PRD 6.4.2 表列的 60/68/82/91% 為四捨五入後的呈現值）
- [ ] 2.4 ♻️ refactor：確認常數只有一處定義，無魔術數字

## 3. K 依出場次數遞減（rating.ts）

- [ ] 3.1 🔴 補三個 it：「出場 0 場時 K_eff 為 K_base 的兩倍」、「出場 20 場時 K_eff 為 K_base 的一點五倍」、「K_eff 隨出場次數單調遞減且恆大於 K_base」。確認紅燈
- [ ] 3.2 🟢 實作 `effectiveK(gamesPlayed)`：`K_BASE * (1 + K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed))`
- [ ] 3.3 🟢 單調遞減的斷言以迴圈掃過 0～200，逐項比較前後值嚴格遞減，且每一項皆 `> K_BASE`
- [ ] 3.4 ♻️ refactor：確認 `effectiveK` 對 `gamesPlayed = 0` 不發生除以零

## 4. 單打賽後更新（rating.ts）

- [ ] 4.1 🔴 補四個 it：「勢均力敵時單場變動趨近 0.075，新手為 0.15」、「爆冷獲勝者的加分明顯大於預期內獲勝者」、「出場次數少者的評分變動幅度大於出場次數多者」、「勝方分數增加敗方分數減少」。確認紅燈
- [ ] 4.2 🟢 實作 `updateRatings(input)` 的單打路徑：每人以自身 `effectiveK(gamesPlayed)` 與相對於對手的 `expectedScore` 計算 `K_eff × (S - E)`
- [ ] 4.3 🟢 `after` 經 `roundRating` 取兩位小數；`delta` 在 round **之後**計算，`rawDelta` 保留完整精度（design Decision 5）
- [ ] 4.4 🟢 「勢均力敵趨近 0.075」的斷言注意 `K_eff` **恆大於** `K_base`：用大 `gamesPlayed`（例如 100000）逼近，斷言落在 0.075～0.076 之間，**不要**斷言等於 0.075（design Risks 第 3 點）
- [ ] 4.5 ♻️ refactor：單打與雙打共用的「一位球員的變動計算」抽成內部輔助函式

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

- [ ] 9.1 `RATING_D` 由 `3.0` 改為 `400`（標準 Elo 值）→ 須紅
- [ ] 9.2 `K_BASE` 由 `0.15` 改為 `0.30` → 須紅
- [ ] 9.3 `effectiveK` 的 `K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed)` 改為固定 `1`（等於停用遞減）→ 須紅
- [ ] 9.4 `effectiveK` 改用**隊伍平均** `gamesPlayed` 而非該員自己的（Decision 1 的反面）→ 須紅
- [ ] 9.5 雙打的 `E` 改用隊伍**總和**而非平均 → 須紅
- [ ] 9.6 clamp 改為只夾不標記（`clamped` 恆為 `"none"`）→ 須紅
- [ ] 9.7 `expectedScore` 的分子分母顛倒（`E` 變成 `1 - E`）→ 須紅
- [ ] 9.8 `after` 拿掉 `roundRating` → 須紅
- [ ] 9.9 任一項**存活**（改壞後仍全綠）時，補強對應測試直到它被殺掉，並記錄補了什麼

## 10. 收尾驗證

- [ ] 10.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、it 名稱逐字相符。以腳本機械比對，不靠目視（本段共 27 個 Scenario）
- [ ] 10.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 全綠，貼出輸出
- [ ] 10.3 `pnpm lint` 通過，貼出輸出
- [ ] 10.4 `pnpm typecheck` 通過，貼出輸出
- [ ] 10.5 `pnpm test` 全套通過（確認未破壞第 1 段與 M1 既有測試），貼出輸出
- [ ] 10.6 本段無 UI，**不跑 E2E**；在此註明理由，避免日後誤判為漏跑
- [ ] 10.7 `DO_NOT_TRACK=1 openspec validate matchmaker-rating-engine --strict` 通過
