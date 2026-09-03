> **RED 階段的事前承諾**。本檔只列「要先寫哪些測試、斷什麼」，**不描述實作邏輯**。
> apply 階段每次要決定「下一個 RED 寫什麼」都回來讀這份。

## 測試檔與 Tier 慣例

- 全部測試集中在 `nextjs-pickball/lib/matchmaker/rating.test.ts`（Vitest，happy-dom），與 `lib/matchmaker/` 既有模組的鄰近佈局一致。
- **Test name 一律使用中文 it 名稱，且必須與 delta spec 的「驗收」錨點逐字一致**——`/opsx:verify` 靠這個做機械核對，改一個字就對不上。
- **Tier 定義**（本 change 內的一致解讀）：
  - `unit`：直接對單一匯出函式或常數斷言，不跨檔（`RATING_D` 等常數、`expectedScore`、`effectiveK`）。
  - `integration`：透過 `updateRatings` 斷言。該函式組合了同檔的 `expectedScore`／`effectiveK`、跨檔的 `rating-math.ts` `roundRating` 與 `allocation-types.ts` `PLAYERS_PER_MATCH`，測的是這些零件串起來的行為。
  - `e2e`：**本 change 為 0 筆**。本段全部是 `lib/` 下的純函式，沒有 `app/**/page.tsx`、沒有元件、沒有 CSS，因此**不存在** `nextjs-pickball/CLAUDE.md` TDD 節所列的「例外層」（純樣式／型別／入口與配置／API proxy／測試基礎建設）。唯一沾到例外層邊的是 `rating-types.ts`（純型別與常數、無函式），它本身不建立測試檔，其常數的可觀察值改在 `rating.test.ts` 斷言——沿用 M2 `allocation-types.ts` 的既有處理方式。評分結果的視覺呈現（「已達上限／下限」標示、爆冷加分）屬於 M5，其 e2e 由 M5 自己的 change 負責。
- **浮點斷言的選擇**（已實際驗算過，照做可避開一個必踩的坑）：
  - `expectedScore()` 與 `effectiveK()` 的回傳值**一律用 `toBeCloseTo`**。特別注意 `effectiveK(20)`：`0.15 * 1.5` 在 IEEE754 下是 `0.22499999999999998`，**`toBe(0.225)` 會直接失敗**——那不是實作錯誤，改用 `toBeCloseTo(0.225, 10)`。`effectiveK(0)`（`0.3`）與 `effectiveK(60)`（`0.1875`）則剛好是精確值。
  - 賽後分數 `after` 與變動值 `delta` **可以用 `toBe`**：兩者都經過 `roundRating`（`Math.round(v * 100) / 100`），結果與 `4.15`、`3.91`、`-0.09` 這類字面值是同一個 double。
- **Why first 欄的 `regression guard` 標註是誠實紀錄，不是免死金牌**：標為 regression guard 者，代表它在被寫入的當下**預期就是綠燈**（前一個 GREEN 的實作已使其成立）。apply 時必須如實記錄實測結果，**嚴禁以「改斷言看紅、再改回」的方式偽造紅燈**。若實測意外為紅燈，代表前一個 GREEN 偏離設計，照常走 GREEN 修正。

## match-rating

### Requirement: 評分更新公式與常數

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 評分常數以具名常數匯出，D 為 3.0、K_base 為 0.15 | 常數以具名常數匯出 | 讀取 `RATING_D`／`RATING_K_BASE`／`RATING_MIN`／`RATING_MAX`／`K_DECAY_GAMES` → 依序為 `3.0`／`0.15`／`1`／`8`／`20` | 常數是整份規格的地基，值錯則後面每個斷言都連帶錯；也是逼出 `rating-types.ts` 存在的第一個測試 | unit |
| 分差對應的預測勝率符合 D=3.0 的級距 | 分差對應的預測勝率 | `expectedScore(4,4)=0.5`、`(4.5,4)≈0.5948`、`(5,4)≈0.6830`、`(6,4)≈0.8228`、`(7,4)≈0.9091`（`toBeCloseTo` 取小數 3 位） | golden path：`D=3.0` 選對與否只能靠這張級距表驗證，PRD 6.4.2 的四個數字就是驗收基準 | unit |
| 同一場雙方的預測勝率相加為 1 | 雙方預測勝率互補 | 對多組 `(a,b)` 斷言 `expectedScore(a,b)+expectedScore(b,a)` 等於 1（`toBeCloseTo` 取小數 10 位） | 這是「雙方共用同一個 E」的最小可測形式，零和的結構保證（design Decision 4）建立在它之上 | unit |

### Requirement: K 依出場次數遞減

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| K_eff 在 0 場為 K_base 的 2 倍、20 場為 1.5 倍、60 場為 1.25 倍 | K_eff 在關鍵出場次數的取值 | `effectiveK(0)=0.30`、`effectiveK(20)=0.225`、`effectiveK(60)=0.1875`（`toBeCloseTo`；`effectiveK(20)` 的實際值為 `0.22499999999999998`，見上方浮點斷言說明） | golden path：PRD 6.4.3 只舉了 0 場與 20 場兩個錨點，寫死這三點可鎖住 `20/(20+n)` 的形狀，避免寫成 `20/n` 或 `n/(20+n)` | unit |
| K_eff 隨出場次數單調遞減且恆大於 K_base | K_eff 單調遞減且恆大於 K_base | 對遞增序列 `[0,1,5,20,50,200,1000]` 取值 → 嚴格遞減，且每項 `> RATING_K_BASE` | edge case：鎖住「趨近但不等於 `K_base`」的漸近行為，防止實作寫成會跌破 `K_base` 的形式 | unit |
| 出場次數少者的評分變動幅度大於出場次數多者 | 出場次數少者變動幅度較大 | 單打 4.00（`gamesPlayed` 0）對 4.00（60），前者勝 → 變動值 `+0.15` 對 `-0.09`，且 `abs` 前者大於後者 | PRD 13.4 驗收項「K 遞減生效」；同時是「逐人取 K」（design Decision 3）在 `updateRatings` 層的唯一可觀察證據 | integration |

### Requirement: 單打評分更新

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 單打勢均力敵時勝方與敗方各變動 K_eff 的一半 | 勢均力敵時各變動 K_eff 的一半 | 4.00 對 4.00（`gamesPlayed` 皆 0），第一位勝 → 賽後 `4.15` 與 `3.85`，變動值 `+0.15`／`-0.15` | golden path：`E=0.5` 時公式退化為 `±K_eff/2`，是整條更新路徑最容易人工驗算的一組數字 | integration |
| 爆冷獲勝的加分明顯大於預期內獲勝的加分 | 爆冷獲勝的加分明顯較大 | 6.00 對 3.00（`gamesPlayed` 皆 20）→ 低分方勝時加 `0.20`（賽後 `3.20`）；高分方勝時加 `0.02`（賽後 `6.02`）；前者遠大於後者 | PRD 13.4 驗收項「爆冷加分較大」；同時鎖住 `(S-E)` 的方向，防止把 `E` 算反 | integration |
| 輸出依隊伍順序攤平，每筆含 id、賽前分數、賽後分數與變動值 | 輸出形狀與順序 | 單打一場 → `changes` 長度 2、順序為第一隊在前、`id` 對得上；每筆具備 `before`／`after`／`delta`／`atUpperBound`／`atLowerBound`／`clamped`；另帶兩隊 `expectedScores` | 輸出型別會被 M4 持久化（design Risks），形狀先鎖住才不會在 M4 才發現要改 | integration |

### Requirement: 雙打評分更新

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雙打以兩隊平均分數計算預測勝率，而非以總和 | 以隊伍平均而非總和計算預測勝率 | 隊一 `[6.00, 4.00]`、隊二 `[4.50, 3.50]`、`gamesPlayed` 皆 0，隊一勝 → `expectedScores[0]≈0.683`（非 0.823）；四人賽後為 `6.10`／`4.10`／`4.40`／`3.40` | 這組輸入是刻意挑的：用總和算不會拋錯、不會越界，只會靜默把級距砍半（design Risks），唯一能現形的方式就是寫死這組數字 | integration |
| 雙打同隊兩人出場次數相同時加減同一數值 | 同隊兩人出場次數相同時加減同一數值 | 同上輸入，隊一兩人賽前 6.00 與 4.00 但 `gamesPlayed` 皆 0 → 兩人變動值皆為 `+0.10`（完全相等） | PRD 6.4.4 的字面要求；鎖住「`(S-E)` 來自隊伍平均、與個人分數無關」 | integration |
| 雙打同隊兩人出場次數不同時各自套用自己的 K_eff | 同隊兩人出場次數不同時各自套用自己的 K_eff | 四人皆 4.00，每隊各有 `gamesPlayed` 0 與 60 各一人，隊一勝 → 隊一為 `+0.15`／`+0.09`，隊二為 `-0.15`／`-0.09`；同隊方向相同 | design Decision 3 的定案（6.4.3 優先於 6.4.4）唯一的可執行證據；PRD 未言明，沒有這個測試日後會被當成 bug 改掉 | integration |

### Requirement: 零和的成立條件

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雙方 K_eff 相同且未觸界時總分守恆 | K_eff 相同且未觸界時總分守恆 | 單打 5.00 對 4.00（`gamesPlayed` 皆 0），高分方勝 → 賽後 `5.10` 與 `3.90`，賽前總和 9.00 等於賽後總和 9.00 | golden path：PRD 6.4.5 的零和在此條件下必須精確成立，這是「共用同一個 E」的直接後果 | integration |
| 雙方 K_eff 不同時總分不守恆且不做事後補償 | K_eff 不同時總分不守恆且不做事後補償 | 單打 4.00（0 場）對 4.00（60 場），前者勝 → 賽後 `4.15` 與 `3.91`，總和由 8.00 變 8.06；勝方加分未被縮減為 0.09 | design Decision 4 的定案。**若沒有這個測試，日後看到總和漂移的人會「修好」它，順手把 K 遞減破壞掉** | integration |
| 觸界時 clamp 優先於零和，總分不守恆 | 觸界時 clamp 優先於零和 | 單打 8.00 對 8.00（`gamesPlayed` 皆 0），第二位勝 → 敗方 `7.85`（變動 `-0.15`）、勝方 `8.00`（變動 `0`），總和由 16.00 變 15.85 | design Decision 5 的定案；PRD 6.4.5 與 6.4.6 的正面衝突，必須有測試指明誰贏 | integration |

### Requirement: 邊界 clamp 與觸界標示

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 更新後超過 8.00 時夾為 8.00 並標示已達上限 | 更新後超過上限時夾為 8.00 | 單打 7.95 對 7.95（`gamesPlayed` 皆 0），第一位勝 → 勝方賽後 `8.00`、變動值 `0.05`、`atUpperBound` 與 `clamped` 皆 true；敗方 `7.80` 且三旗標皆 false | PRD 6.4.6 與第 11 節「評分更新後撞到邊界」的核心情境；同時驗證變動值是重算而非理論值（design Decision 6） | integration |
| 更新後低於 1.00 時夾為 1.00 並標示已達下限 | 更新後低於下限時夾為 1.00 | 單打 1.05 對 1.05（`gamesPlayed` 皆 0），第二位勝 → 敗方賽後 `1.00`、變動值 `-0.05`、`atLowerBound` 與 `clamped` 皆 true | 下限是上限的鏡像，兩端都要有測試——只測一端時把 `Math.min`／`Math.max` 寫反不會被抓到 | integration |
| 未觸界時上下限與夾值旗標皆為 false | 未觸界時旗標皆為 false | 單打 4.00 對 4.00（`gamesPlayed` 皆 0）→ 兩筆的 `atUpperBound`／`atLowerBound`／`clamped` 皆 false | 反向驗證：沒有這條，把三個旗標寫死成 true 也能通過前兩個測試 | integration |
| 已達上限者落敗時分數照常下降且不再標示已達上限 | 已達上限者落敗時照常下降 | 單打 8.00 對 8.00（`gamesPlayed` 皆 0），第二位勝 → 敗方賽後 `7.85`、變動 `-0.15`、`atUpperBound` 與 `clamped` 皆 false | PRD 6.4.6「已達上限或下限者仍照常參與計算」；區分 `atUpperBound` 與 `clamped` 的關鍵情境（design Decision 7） | integration |
| 賽後分數為兩位小數且可通過 PlayerSchema 的 rating 驗證 | 賽後分數可寫回名單 | 單打 6.00 對 3.00（`gamesPlayed` 皆 20，理論值為無限小數）→ 每筆 `after` 滿足 `roundRating(after) === after` 且落在 `RATING_MIN`～`RATING_MAX`；以該 `after` 組成的 `Player` 通過 `PlayerSchema.safeParse` | 這是本段與 M1 的交界：M4 會把 `after` 寫回名單，沒過 `PlayerSchema` 就是整筆資料寫不進去 | integration |

### Requirement: 純函式契約與輸入驗證

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 隊伍人數與對戰方式不符時拒絕輸入 | 隊伍人數與對戰方式不符 | `format: "singles"` 但某隊 2 人 → 拋錯；`format: "doubles"` 但某隊 1 人 → 拋錯；訊息為繁體中文且含實際人數 | edge case：M4 接線錯誤的第一道防線；也逼出「人數由 `PLAYERS_PER_MATCH` 推導」（design Decision 9） | integration |
| rating 超出 1.00～8.00 時拒絕輸入而非靜默夾值 | rating 超出合法範圍 | 任一員 `rating` 為 `0.99` 或 `8.01` → 拋錯；`1` 與 `8` 則正常計算，且不得出現「先夾成 8.00 再照常算」的行為 | 與 `player-roster`「SHALL NOT 靜默夾值」立場一致（design Decision 8）；靜默夾值的失敗模式無聲無息 | integration |
| gamesPlayed 為負數或非整數時拒絕輸入 | gamesPlayed 非法 | `gamesPlayed` 為 `-1` 或 `1.5` → 拋錯；`0` 正常 | edge case：負值會讓 `20/(20+n)` 在 `n=-20` 時除以零並回傳 `Infinity`，分數瞬間變 `NaN`——擋在入口比在公式裡防呆乾淨 | integration |
| 同一場出現重複的 player id 時拒絕輸入 | 同一場出現重複球員 | 同一 `id` 同時在兩隊、或同時在同一隊兩個位置 → 拋錯 | edge case：不擋會讓該員被更新兩次且後者覆蓋前者，分數靜默錯誤且無跡可循（design Decision 8） | integration |
| 評分更新不修改輸入的球員物件 | 不修改輸入物件 | 以 `structuredClone` 保存輸入 → 呼叫後深度比對輸入未變（`rating`／`gamesPlayed` 皆原值） | **regression guard**：`updateRatings` 的最小實作本來就不會就地改輸入，此測試預期一寫就綠。寫入是為了鎖住「輸入唯讀」不被日後的最佳化破壞 | integration |
| 相同輸入產生相同輸出 | 相同輸入產生相同輸出 | 同一份輸入連呼兩次 → 兩次結果 `toEqual` | **regression guard**：純函式無亂數／無時間，預期一寫就綠。寫入是為了鎖住決定性，M4 的回合重播依賴它 | integration |
| 評分更新不累加 gamesPlayed 與 restCount | 不累加出場與休息次數 | 回傳的每筆 `RatingChange` 不含 `gamesPlayed`／`restCount` 欄位；輸入球員的 `gamesPlayed` 維持原值 | **regression guard**：本段明訂不累加（Non-Goal），預期一寫就綠。寫入是為了讓 M4 的 verify 有明確依據確認「累加確實有人做」（design Risks 最後一項） | integration |
