> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts`
> 在 shell **實際看到紅燈**（把輸出貼進回報）② 最小實作至綠 ③ refactor
> （無壞味道可註記 skipped）。**`--run` 前不可加 `--`** —— 加了會讓 vitest 收不到路徑而跑完整套，
> 紅燈證據會被既有綠燈淹沒。
>
> **it 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **紅燈要是真的**。標為「⚠️ 預期 regression guard」的 task，代表該批 it 在寫入當下**預期就是綠燈**
> （前一個 GREEN 的實作已使其成立）。請如實記錄實測結果，
> **嚴禁用「改斷言看紅、再改回」偽造紅燈**。若實測意外為紅燈，照常走 GREEN 補齊。
>
> **本 change 全部在 `nextjs-pickball/lib/matchmaker/` 下新增檔案**：
> `rating-types.ts`、`rating.ts`、`rating.test.ts`。
> `rating-math.ts`、`types.ts`、`allocation-types.ts` 為**唯讀**，任何 task 都不得修改它們。

## 1. 常數與型別骨架（rating-types.ts）

- [x] 1.1 RED: 新增 `nextjs-pickball/lib/matchmaker/rating.test.ts`，寫入 it「評分常數以具名常數匯出，D 為 3.0、K_base 為 0.15」——由 `./rating-types` 匯入 `RATING_D`、`RATING_K_BASE`、`RATING_MIN`、`RATING_MAX`、`K_DECAY_GAMES` 並斷言依序為 `3.0`、`0.15`、`1`、`8`、`20`。跑單檔確認紅燈（此時應為模組解析失敗）並貼出輸出
- [x] 1.2 GREEN: 建立 `nextjs-pickball/lib/matchmaker/rating-types.ts`：匯出上述五個常數，並定義 `RatingPlayerInput`（`id`、`rating`、`gamesPlayed`）、`RatingUpdateInput`（`format`、`teams: readonly [Side, Side]`、`winnerIndex: 0 | 1`）、`RatingChange`（`id`、`before`、`after`、`delta`、`atUpperBound`、`atLowerBound`、`clamped`）、`RatingUpdateResult`（`changes`、`expectedScores`）。`MatchFormat` 由 `./allocation-types` **`import type` 取用**，不重新定義（design Decision 9）。本檔為純型別與常數、無函式，依 `nextjs-pickball/CLAUDE.md` 的 TDD 適用範圍**不建立 `rating-types.test.ts`**；常數的斷言掛在 `rating.test.ts`（沿用 M2 `allocation-types.ts` 的既有處理方式）

## 2. 預測勝率（rating.ts）

Depends on: §1

> 本群組**不設 REFACTOR**：`expectedScore` 是單一運算式，GREEN 完成時已無可抽出的重複。

- [x] 2.1 RED: 於 `rating.test.ts` 補兩個 it：「分差對應的預測勝率符合 D=3.0 的級距」（`expectedScore(4,4)=0.5`、`(4.5,4)≈0.5948`、`(5,4)≈0.6830`、`(6,4)≈0.8228`、`(7,4)≈0.9091`，以 `toBeCloseTo` 取小數 3 位）、「同一場雙方的預測勝率相加為 1」（對多組 `(a,b)` 斷言 `expectedScore(a,b)+expectedScore(b,a)` 等於 1，`toBeCloseTo` 取小數 10 位）。確認紅燈並貼出輸出
- [x] 2.2 GREEN: 新增 `nextjs-pickball/lib/matchmaker/rating.ts`，實作 `expectedScore(ratingA, ratingB)`：`1 / (1 + 10 ** (-(ratingA - ratingB) / RATING_D))`。`RATING_D` 由 `./rating-types` 匯入，**不得**在函式內寫死 `3`

## 3. K 依出場次數遞減（rating.ts）

Depends on: §1

> ⚠️ **浮點陷阱（已驗算，請照做）**：`effectiveK(20)` 的實際回傳值是 `0.22499999999999998`
> （`0.15 * 1.5` 在 IEEE754 下的結果），**`toBe(0.225)` 會直接失敗**——那不是實作錯誤。
> 三個斷言一律用 `toBeCloseTo(x, 10)`。`effectiveK(0)`（`0.3`）與 `effectiveK(60)`（`0.1875`）剛好是精確值。

- [x] 3.1 RED: 補兩個 it：「K_eff 在 0 場為 K_base 的 2 倍、20 場為 1.5 倍、60 場為 1.25 倍」（`effectiveK(0)=0.30`、`effectiveK(20)=0.225`、`effectiveK(60)=0.1875`，以 `toBeCloseTo` 斷言）、「K_eff 隨出場次數單調遞減且恆大於 K_base」（對序列 `[0,1,5,20,50,200,1000]` 斷言嚴格遞減，且每項大於 `RATING_K_BASE`）。確認紅燈並貼出輸出
- [x] 3.2 GREEN: 實作 `effectiveK(gamesPlayed)`：`RATING_K_BASE * (1 + K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed))`。兩個常數皆由 `./rating-types` 匯入，**不得**寫死 `0.15` 或 `20`

## 4. 單打評分更新與零和（rating.ts）

Depends on: §2, §3

> **本群組刻意在一個 RED 內寫入六個 it**。這六個 it 全部依賴 `updateRatings` 存在才能執行，
> 拆成兩批會讓第二批必然變成 regression guard（第一批的 GREEN 就是完整的單打公式，
> 沒有更小的實作能只滿足其中三個）。一次寫完、用單一 GREEN 補齊，是本群組唯一能保持**真紅燈**的切法。

- [x] 4.1 RED: 補六個 it，全部針對 `updateRatings`：
  - 「單打勢均力敵時勝方與敗方各變動 K_eff 的一半」——4.00 對 4.00（`gamesPlayed` 皆 0），第一位勝 → 賽後 `4.15` 與 `3.85`，`delta` 為 `+0.15` 與 `-0.15`
  - 「爆冷獲勝的加分明顯大於預期內獲勝的加分」——6.00 對 3.00（`gamesPlayed` 皆 20）：低分方勝時賽後 `3.20`（`delta` `0.20`），高分方勝時賽後 `6.02`（`delta` `0.02`），並斷言前者遠大於後者
  - 「輸出依隊伍順序攤平，每筆含 id、賽前分數、賽後分數與變動值」——`changes` 長度 2、順序為第一隊在前、`id` 對得上；每筆具備 `before`／`after`／`delta`／`atUpperBound`／`atLowerBound`／`clamped` 六個欄位（本批的三個旗標**皆應為 false**）；另帶 `expectedScores` 兩隊值
  - 「出場次數少者的評分變動幅度大於出場次數多者」——4.00（`gamesPlayed` 0）對 4.00（60），前者勝 → `delta` 為 `+0.15` 與 `-0.09`，且絕對值前者大於後者
  - 「雙方 K_eff 相同且未觸界時總分守恆」——5.00 對 4.00（`gamesPlayed` 皆 0），高分方勝 → 賽後 `5.10` 與 `3.90`，賽前總和 9.00 等於賽後總和 9.00
  - 「雙方 K_eff 不同時總分不守恆且不做事後補償」——4.00（0 場）對 4.00（60 場），前者勝 → 賽後 `4.15` 與 `3.91`，總和由 8.00 變 8.06；並斷言勝方加分**未**被縮減為 0.09
  確認紅燈並貼出輸出
- [x] 4.2 GREEN: 實作 `updateRatings(input)` 的**單打路徑**：以雙方 `rating` 取 `E`（`expectedScore`）→ 依 `winnerIndex` 決定各自的 `S`（勝 1、敗 0）→ **逐人**取 `effectiveK(gamesPlayed)` → `after = roundRating(before + K_eff * (S - E))`（`roundRating` 由 `./rating-math` 匯入，**不得**另寫一份兩位小數規則）→ `delta = roundRating(after - before)` → 三個邊界旗標本批一律回 `false`（真正的邊界邏輯在 §6）→ 回傳 `{ changes, expectedScores }`，`changes` 依 `teams` 順序攤平
- [x] 4.3 REFACTOR: 把「單一球員的更新」抽為具名內部函式（例如 `applyDelta`），使 §5 的雙打能直接沿用；確認 `RATING_D`／`RATING_K_BASE` 沒有以 magic number 形式出現在 `rating.ts` 內

## 5. 雙打評分更新（rating.ts）

Depends on: §4

> ⚠️ 若 4.2／4.3 已直接以「隊伍平均」實作（人數為 1 時平均即該員 `rating`），
> 5.1 的三個 it 會在寫入當下即為綠燈——**那是 regression guard，請如實標註於本行並貼出實測輸出**，
> 不得改斷言偽造紅燈。「雙打每隊 2 人」的人數推導在該情況下仍可能是紅燈，照常走 5.2。

- [x] 5.1 RED: 補三個 it：
  - 「雙打以兩隊平均分數計算預測勝率，而非以總和」——隊一 `[6.00, 4.00]`、隊二 `[4.50, 3.50]`、`gamesPlayed` 皆 0，隊一勝 → `expectedScores[0]` 約 `0.683`（非 `0.823`），四人賽後為 `6.10`／`4.10`／`4.40`／`3.40`
  - 「雙打同隊兩人出場次數相同時加減同一數值」——同上輸入，隊一兩人 `delta` 皆為 `+0.10`（完全相等）
  - 「雙打同隊兩人出場次數不同時各自套用自己的 K_eff」——四人皆 4.00，每隊各有 `gamesPlayed` 0 與 60 各一人，隊一勝 → 隊一 `delta` 為 `+0.15` 與 `+0.09`、隊二為 `-0.15` 與 `-0.09`，同隊方向相同
  確認紅燈並貼出輸出
  > **實測結果：全綠，本批為 regression guard（如實標註）**。§4 的 `updateRatings` 已以隊伍平均
  > （`sum / team.length`）與逐人 `effectiveK(player.gamesPlayed)` 實作，雙層迴圈本就能處理任意隊伍人數，
  > 因此這三個 it 在寫入當下即為綠燈（`Tests 14 passed (14)`）。Stage 1 已比對前一版 `rating.ts`
  > 確認此說明成立、非掩飾漏寫實作，且無「改斷言看紅再改回」的痕跡。5.2 的人數推導照常實作。
- [x] 5.2 GREEN: 把 `E` 的計算推廣為**兩隊平均 `rating`**（`sum / 隊伍人數`），並讓 `updateRatings` 依 `format` 處理每隊 1 人或 2 人。每隊人數由 `PLAYERS_PER_MATCH[format] / 2` 推導（`PLAYERS_PER_MATCH` 由 `./allocation-types` 匯入），**不得**寫死 `1` 或 `2`（design Decision 9）。同隊兩人共用同一個 `(S - E)`，各自以自己的 `K_eff` 放大（design Decision 3）
- [x] 5.3 REFACTOR: 確認單打與雙打**共用同一條路徑**（單打即隊伍人數 1 的特例，平均等於該員 `rating`），`rating.ts` 內不存在兩份平行的公式實作

## 6. 邊界 clamp 與觸界標示（rating.ts）

Depends on: §5

- [x] 6.1 RED: 補六個 it：
  - 「更新後超過 8.00 時夾為 8.00 並標示已達上限」——7.95 對 7.95（`gamesPlayed` 皆 0），第一位勝 → 勝方 `8.00`、`delta` `0.05`、`atUpperBound` 與 `clamped` 皆 true；敗方 `7.80` 且三旗標皆 false
  - 「更新後低於 1.00 時夾為 1.00 並標示已達下限」——1.05 對 1.05（`gamesPlayed` 皆 0），第二位勝 → 敗方 `1.00`、`delta` `-0.05`、`atLowerBound` 與 `clamped` 皆 true
  - 「未觸界時上下限與夾值旗標皆為 false」——4.00 對 4.00（`gamesPlayed` 皆 0）→ 兩筆三旗標皆 false
  - 「已達上限者落敗時分數照常下降且不再標示已達上限」——8.00 對 8.00（`gamesPlayed` 皆 0），第二位勝 → 敗方 `7.85`、`delta` `-0.15`、`atUpperBound` 與 `clamped` 皆 false
  - 「觸界時 clamp 優先於零和，總分不守恆」——同上輸入 → 勝方 `8.00` 且 `delta` 為 `0`，總和由 16.00 變 15.85，並斷言敗方**未**被少扣
  - 「賽後分數為兩位小數且可通過 PlayerSchema 的 rating 驗證」——6.00 對 3.00（`gamesPlayed` 皆 20）→ 每筆 `after` 滿足 `roundRating(after) === after` 且落在 `RATING_MIN`～`RATING_MAX`；以該 `after` 組成的 `Player` 通過 `PlayerSchema.safeParse`（`PlayerSchema` 由 `./types` **唯讀匯入**，不得修改該檔）
  確認紅燈並貼出輸出
  > **實測結果：真紅燈（3 failed｜17 passed）**。紅燈的三個為「更新後超過 8.00…」「更新後低於 1.00…」
  > 「觸界時 clamp 優先於零和，總分不守恆」——舊 `applyDelta` 無 clamp，賽後值分別為 8.10／0.90／8.15。
  > **另三個 it 在寫入當下即為綠燈（如實標註）**：「未觸界時上下限與夾值旗標皆為 false」「已達上限者落敗時
  > 分數照常下降且不再標示已達上限」「賽後分數為兩位小數且可通過 PlayerSchema 的 rating 驗證」——
  > 三者的輸入本來就不觸界（4.00 對 4.00；只斷言遠離上限的敗方；6.02／2.98 落在範圍內），
  > 舊實作的三旗標又本就硬編碼 `false`，故 clamp 有無都不影響結果。Stage 1 已用前一版 `applyDelta`
  > 邏輯逐一回代驗證，得到的紅／綠分布與實測完全一致，確認非掩飾漏寫實作、無偽造紅燈痕跡。
- [x] 6.2 GREEN: 在更新流程末端加入邊界處理，順序 MUST 為「先 `roundRating` 至兩位小數 → 再 clamp 於 `RATING_MIN`～`RATING_MAX`」（design Decision 5，順序不可顛倒）；接著 `delta = roundRating(after - before)` 由**夾值後**的 `after` 重算（design Decision 6）；產生三個旗標：`atUpperBound = after === RATING_MAX`、`atLowerBound = after === RATING_MIN`、`clamped = 捨入後的理論值超出範圍`
- [x] 6.3 REFACTOR: 確認 clamp 與四捨五入沒有各自散落在多個分支；`RATING_MIN`／`RATING_MAX` 只出現在單一處；`rating-math.ts` 未被修改（`git diff --stat` 確認）

## 7. 輸入驗證（rating.ts）

Depends on: §5

- [ ] 7.1 RED: 補四個 it：
  - 「隊伍人數與對戰方式不符時拒絕輸入」——`format: "singles"` 但某隊 2 人、`format: "doubles"` 但某隊 1 人 → 皆拋錯，訊息為繁體中文且含實際人數
  - 「rating 超出 1.00～8.00 時拒絕輸入而非靜默夾值」——任一員 `rating` 為 `0.99` 或 `8.01` → 拋錯；`1` 與 `8` 本身正常計算
  - 「gamesPlayed 為負數或非整數時拒絕輸入」——`-1` 或 `1.5` → 拋錯；`0` 正常
  - 「同一場出現重複的 player id 時拒絕輸入」——同一 `id` 同時在兩隊、或同時在同一隊兩個位置 → 皆拋錯
  確認紅燈並貼出輸出
- [ ] 7.2 GREEN: 在 `updateRatings` 入口加入輸入驗證，違反時 `throw new Error(...)`。錯誤訊息為**繁體中文**、說明可採取的修正方式並附上實際輸入值，格式對齊 `allocation.ts` 既有寫法（`場地數需為 1 到 8 之間的整數，請調整後再試一次（目前輸入：0）。`）。SHALL NOT 夾值、補值或忽略（design Decision 8）
- [ ] 7.3 REFACTOR: 把四類驗證抽為單一具名函式（例如 `assertValidInput`），訊息模板集中一處；確認驗證在任何計算之前執行（避免先算出 `NaN` 再報錯）

## 8. 純函式契約 regression guard（rating.ts）

Depends on: §7

> ⚠️ **本群組預期為 regression guard，如實標註**：`updateRatings` 自 §4 起就沒有就地修改輸入、
> 沒有亂數與時間、也沒有累加 `gamesPlayed`，因此這三個 it 在寫入當下**預期即為綠燈**。
> 它們的價值是把「純函式契約」變成會失敗的測試，鎖住日後的最佳化或 M4 的接線不把它破壞掉。
> 請貼出實測輸出並如實記錄；**嚴禁改斷言看紅再改回**。若實測為紅燈，代表 §4～§7 某處偏離設計，走 8.2 修正。

- [ ] 8.1 RED: 補三個 it：
  - 「評分更新不修改輸入的球員物件」——以 `structuredClone` 保存輸入，呼叫後深度比對輸入未變
  - 「相同輸入產生相同輸出」——同一份輸入連呼兩次，兩次結果 `toEqual`
  - 「評分更新不累加 gamesPlayed 與 restCount」——回傳的每筆 `RatingChange` 不含 `gamesPlayed`／`restCount` 欄位，且輸入球員的 `gamesPlayed` 維持原值
  跑單檔並如實貼出輸出（預期全綠，見本節開頭說明）
- [ ] 8.2 GREEN: 若 8.1 出現紅燈，修正 `rating.ts` 使其滿足純函式契約（不就地修改輸入、不引入亂數或時間、不回傳任何 `gamesPlayed`／`restCount` 新值）；若 8.1 實測全綠，標註 `skipped` 並把綠燈輸出記錄在本行，**不要**為了讓這一行有東西可寫而重構無關的程式碼
