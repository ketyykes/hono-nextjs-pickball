## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- `nextjs-pickball/lib/matchmaker/` 目前為**扁平佈局**（`types.ts`、`roster.ts`、`colors.ts`、`storage.ts`、`allocation-types.ts`、`candidates.ts`、`pairing.ts`、`duplication.ts`、`allocation.ts`、`rating-math.ts`，各自鄰近一份 `*.test.ts`），本段沿用，不新增子目錄。
- **`rating-math.ts` 已存在**，但只有一個 `roundRating(value)`（`Math.round(v * 100) / 100`）。它是 M2 為了讓 `pairing.ts` 與 `duplication.ts` 共用同一條兩位小數規則而抽出的工具，檔頭註解明訂其職責為「隊伍分數四捨五入的共用工具」。**本段沿用它，不擴充它**（見 Decision 1）。除此之外，codebase 內**沒有任何 Elo、預測勝率或 `K_base` 相關實作**（已以 grep 確認），因此本段的評分行為全部是新行為。
- `types.ts` 的 `PlayerSchema` 已含 `rating`（`z.number().min(1).max(8)`）與 `gamesPlayed`（`z.number().int().nonnegative().default(0)`），是 M1 為了避開破壞性遷移刻意預留的。本段**唯讀取用**，不改該檔。
- `allocation-types.ts` 明訂自己是「純型別與常數，無執行期邏輯、無函式」，並宣告 `PLAYERS_PER_MATCH` 為「唯一人數來源——其他模組不得另行寫死 2／4」。本段的隊伍人數驗證必須遵守這條既有規則。
- `allocation-types.ts` 的 `Team.rating` 是隊內成員 `rating` 的**總和**（不是平均）。`prd.md` 6.4.4 要求以**平均**算 `E`。這兩者在雙打的 2 人隊伍上剛好差 2 倍，是本段最容易寫錯的地方。
- 專案 `tsconfig.json` 開 `strict` 與 `verbatimModuleSyntax`，型別匯入須用 `import type`。
- 本段輸出的 `before`／`after` 將由 M4 寫進歷史紀錄（`prd.md` 8.2 的「賽前分數」「賽後分數」欄位），由 M7 呈現、M8 匯出 CSV。三者同一 schema。

## Goals / Non-Goals

**Goals:**

- 把 `prd.md` 6.4 的數學做成**可被單元測試逐條驗證**的純函式：常數、預測勝率、K 遞減、雙打平均、邊界 clamp 各自可獨立斷言，而不是塞在一個大函式裡只能整體黑箱測試。
- 明確定案 PRD 未言明的兩處張力（6.4.3 逐人 K 對 6.4.4「同一數值」、6.4.5 零和對 6.4.6 clamp），並讓定案結果**寫進 spec 的 Scenario**，而非只留在註解裡。
- 讓輸出一次帶齊 M4／M5／M7／M8 需要的全部欄位（賽前、賽後、變動值、三個邊界旗標、兩隊預測勝率），避免日後改型別造成破壞性遷移——這是 M1 `restCount`／`gamesPlayed` 教訓的延續。

**Non-Goals:**

- 不做評分的**歷史重算**。`prd.md` 6.4.7 明訂手動覆蓋「只影響之後的比賽，不重算既有歷史」；本段為無狀態純函式，結構上就沒有重算路徑。
- 不提供手動覆蓋 API。M1 的 `updatePlayer`（覆寫語意）已完全滿足 6.4.7。
- 不驗證比分（空白／非數字／平局）。那屬於 M4，且 13.4 已明訂平局不得送出，因此本段不提供 `S = 0.5` 路徑。
- 不做效能最佳化與快取。單場更新是常數級運算，`prd.md` 12.1 的 8～40 人規模下每輪最多 8 場，遠低於一個 frame。
- 不校準常數。`D = 3.0`、`K_base = 0.15` 是 PRD 6.4.2 明訂的規格值，不是本段可調整的參數。

## Decisions

### Decision 1：新增 `rating.ts` 與 `rating-types.ts`，沿用而不擴充既有的 `rating-math.ts`

| 檔案 | 職責 | 對應 PRD |
|---|---|---|
| `rating-types.ts` | 型別與常數（`RATING_D`、`RATING_K_BASE`、`K_DECAY_GAMES`、`RATING_MIN`、`RATING_MAX`、輸入與輸出型別） | 6.4.2、6.4.6 |
| `rating.ts` | 純函式 `expectedScore()`、`effectiveK()`、`updateRatings()` | 6.4.1、6.4.3～6.4.6 |
| `rating-math.ts` | **既有檔案，不修改**；本段 import 其 `roundRating` | — |

`rating-math.ts` 看起來是最順手的落腳處，但它的檔頭註解把自己定義為「隊伍分數四捨五入的共用工具」，且明文解釋了為何它不能放進 `allocation-types.ts`（那是純型別檔）。把整套 Elo 塞進一個名為「math」的四捨五入工具檔，會讓 `pairing.ts`／`duplication.ts` 這兩個**分配**模組間接相依於**評分**模組——兩者在 PRD 上是完全獨立的章節（第 5 節 vs 6.4），沒有理由耦合。

沿用 `roundRating` 而不自己寫一份 `Math.round(v * 100) / 100`：兩位小數是 `rating` 的**定義域規則**（`PlayerSchema` 與 PRD 都以兩位小數表述），同一條規則在 codebase 內只能有一份。M2 抽出這個函式的理由（避免同一個 magic number `100` 在兩處各自維護）在這裡同樣成立。

型別與常數另立 `rating-types.ts` 而非與函式同檔，是沿用 M2 `allocation-types.ts` 的既有前例：型別檔無執行期邏輯，本來就不在 TDD 適用範圍內，分開後這條界線是檔案層級的、不需要靠註解維持。

**替代方案**：(a) 全部塞進 `rating-math.ts` — 否決理由如上；(b) 單一 `rating.ts` 含型別、常數與函式 — 否決：常數有對外可觀察的值、型別無行為，兩者的測試義務不同，混在一起會讓「這個檔要不要有測試」變成逐行判斷；(c) 建立 `lib/matchmaker/rating/` 子目錄 — 否決：整個 `lib/matchmaker/` 是扁平佈局，只為兩個檔案破例會讓 import 路徑風格不一致。

### Decision 2：自訂 `RatingPlayerInput`，不直接吃 `Player` 或 `Team`

輸入型別只含 `id`、`rating`、`gamesPlayed` 三個欄位：

```
RatingPlayerInput { id: string; rating: number; gamesPlayed: number }
RatingUpdateInput { format: MatchFormat; teams: readonly [Side, Side]; winnerIndex: 0 | 1 }
```

三個理由：

1. **評分只需要這三項**。吃整個 `Player` 會讓每個測試案例都得造出 10 個欄位的假資料（`colorFrom`、`createdAt`⋯），測試意圖被雜訊淹沒。
2. **`Team.rating` 是總和不是平均**（見 Context）。若直接吃 `match-allocation` 的 `Team`，`updateRatings` 手邊就有一個現成的 `rating` 欄位，任何人都會很自然地拿它去算 `E`——那正好是 6.4.4 禁止的作法。不提供這個欄位，誤用就在型別上做不到。
3. **解耦 schema 演進**。`player-roster` 日後若新增欄位或改欄位語意，本 capability 不需要跟著動。

`Player` 在結構型別（structural typing）上滿足 `RatingPlayerInput`，因此 M4 仍可直接把 `Player` 傳進來，不需要額外的 mapping 函式——解耦沒有付出呼叫端的代價。

`winnerIndex: 0 | 1` 用索引而非 `"teamA" | "teamB"` 字串：`teams` 本身就是 tuple，索引直接對應；再引入一組字串名稱等於多開一個名稱空間，M4 的 `Match.teams` 也已是 `readonly [Team, Team]`，索引可直接沿用。

**替代方案**：直接吃 `Player[]` 與 `winner: Player[]` — 否決：需要以 id 比對判斷勝方，多一層可能失敗的比對；且無法在型別上表達「兩隊」。

### Decision 3：`K_eff` 逐人計算；同隊共用同一個 `(S - E)`

`prd.md` 6.4.3 說「`K_eff = K_base × (1 + 20 / (20 + **該員**累計出場次數))」，6.4.4 說「同隊兩人各自加減**同一數值**」。當同隊兩人的 `gamesPlayed` 不同時，這兩句**無法同時成立**——PRD 未言明如何取捨。

定案：**6.4.3 的逐人要求優先**。同隊兩人共用同一個 `(S - E)`（那是隊伍層級的預測落差，本來就與個人分數無關），但各自以自己的 `K_eff` 放大。`gamesPlayed` 相同時兩人的變動值完全相同，6.4.4 的字面要求在此情形下仍然成立；不同時則新手變動較大。

理由是 6.4.3 有明確的**產品目的**（「讓主持人初始估錯的人在約 3 個活動夜內回到正確名次」），而 6.4.4 的「同一數值」讀起來更像是在描述「同隊兩人同增同減、不因個人分數高低而分化」這件事，並非要求逐分位相等。若反過來讓 6.4.4 優先，一個第一次來的新手只要跟老手同隊，他的 K 就會被老手拉低，快速定位機制在雙打場合直接失效——而本 App 的預設情境（`prd.md` 15 雖以單打為預設，但雙打是 8 人以上場合的常態）會大量出現這種組合。

**替代方案**：(a) 同隊取兩人 `K_eff` 的平均 — 否決：兩人都得到一個誰也不屬於的幅度，新手變慢、老手變快，兩邊的設計意圖同時被稀釋，且「平均」在 PRD 沒有任何依據；(b) 同隊取較大的 `K_eff` — 否決：老手會因為跟新手同隊而承受新手級的波動，違反 6.4.3「老手的分數不會因單場意外大幅跳動」的明文目的；(c) 同隊取較小的 `K_eff` — 否決：即 (a) 的極端版本，新手定位失效更嚴重。

### Decision 4：零和是「共用同一個 `E` 且方向相反」的結構保證，數值守恆只在特定條件下成立

`prd.md` 6.4.5 宣稱「一方增加多少，另一方即減少多少，群體總分守恆」。這在**雙方 `K_eff` 相同且未觸界**時精確成立，但一旦引入 6.4.3 的 K 遞減，數值守恆就不再普遍成立：勝方變動 `+K_a × (S - E)`、敗方變動 `-K_b × (S - E)`，總和變動為 `(K_a - K_b) × (S - E)`，只有 `K_a = K_b` 時為 0。這是 Elo 加上 K 衰減後的已知性質，不是實作瑕疵。

定案：把 6.4.5 拆成兩層。

- **結構保證（永遠成立，寫進 spec）**：同一場雙方 MUST 共用同一個 `E`；一方拿 `E`、另一方拿 `1 - E`；變動方向必定相反。這才是「評分為相對值」的真正來源。
- **數值守恆（條件成立）**：僅在雙方 `K_eff` 相同且無人觸界時成立。其餘情況 SHALL NOT 事後補償。

**替代方案**：(a) 全場強制共用單一 `K_eff`（例如取平均）以保證守恆 — 否決：直接違反 6.4.3 明文的「該員累計出場次數」，且與 Decision 3 相斥；(b) 事後把差額攤回另一方 — 否決：攤回的分數會再次觸發 clamp 檢查，形成需要迭代收斂的再分配，行為變得無法用一句話向使用者解釋；且被攤到的人會發現自己的扣分跟公式對不上，主持人無從驗算。

**外溢約束**：M5／M7 的 UI SHALL NOT 對使用者宣稱「群體總分恆定」，也不得顯示「群體總分」這種會隨 K 差異緩慢漂移的數字。這條已寫進 spec 的零和 Requirement。

### Decision 5：clamp 優先於零和；順序為「先四捨五入至兩位小數 → 再 clamp」

`prd.md` 6.4.6 要求 clamp 於 1.00～8.00，6.4.5 要求零和。當勝方已在 8.00 附近時兩者衝突：要嘛勝方超出 8.00（違反 6.4.6），要嘛敗方少扣（違反 6.4.5）。定案為 **clamp 優先**——6.4.6 是硬邊界（超出範圍的 `rating` 連 `PlayerSchema` 都過不了，會讓 M4 寫回名單時整筆驗證失敗），6.4.5 已在 Decision 4 降級為條件性保證。

**四捨五入與 clamp 的順序**選「先 round 再 clamp」：`rating` 的定義域是「兩位小數且落在 1.00～8.00」，正規化順序應與定義域一致。若先 clamp 再 round，理論值 `8.0049` 會被判定為「被上限截斷」——但它捨入後本來就是 `8.00`，使用者其實一分都沒少拿，M5 卻會對他顯示「已被上限截斷」的提示。先 round 再 clamp 則只有真正損失分數的情況才會被標記。clamp 的兩個界本身就是兩位小數，所以 clamp 之後不會破壞「恆為兩位小數」這個不變量。

**替代方案**：(a) 先 clamp 再 round — 否決理由如上；(b) 不做 round，只 clamp — 否決：浮點尾數會經由 M4 寫進 LocalStorage、經由 M8 寫進 CSV 匯出，使用者會看到 `4.104999999999999`；且 M4 若要比對零和會被浮點雜訊干擾（M2 的 `roundRating` 檔頭已記錄過同一類問題）。

### Decision 6：變動值由「賽後減賽前」重算，不回傳理論變動值

`RatingChange.delta` MUST 等於 `roundRating(after - before)`，而非 `K_eff × (S - E)`。理由是觸界時兩者會矛盾：一個賽前 7.95 的勝方賽後是 8.00，理論變動 `+0.15` 但實際只拿到 `+0.05`；若回傳理論值，M5 顯示「+0.15」而分數只動了 0.05，M7 的歷史紀錄也會前後對不上。

`delta` 本身也要過一次 `roundRating`：`4.15 - 4.00` 在 IEEE754 下是 `0.1499999999999999`，直接回傳會讓 M5 顯示 `+0.1499999999999999`。

### Decision 7：三個邊界旗標，而非一個

回傳 `atUpperBound`、`atLowerBound`、`clamped` 三個布林值，語意各自獨立：

- `atUpperBound` / `atLowerBound`：**賽後分數等於 8.00 / 1.00**。這是 6.4.6 要求 UI 標示「已達上限／下限」的直接依據——不論這一場有沒有被夾，只要停在界上就要標示。
- `clamped`：**這一場的理論值超出範圍而被截斷**。這是「本場少拿了分數」的依據，也是 M4 判斷零和不成立的依據。

拆開的理由是兩者會分歧：一個賽前就在 8.00 的人打贏，`atUpperBound = true` 且 `clamped = true`；同一個人打輸掉到 7.85，兩者皆 false；一個從 7.95 贏到 8.00 的人，兩者皆 true；而一個理論值 8.0049 捨入後為 8.00 的人（見 Decision 5），`atUpperBound = true` 但 `clamped = false`。用單一旗標無法表達第四種情況。

**替代方案**：(a) 只回 `after`，讓 UI 自己跟 8.00 比 — 否決：等於把 `RATING_MAX` 這個常數複製到 UI 層，違反本 spec「常數由本 capability 匯出、消費端不得寫死」的要求；(b) 回一個 `boundary: "upper" | "lower" | null` 列舉 — 否決：無法同時表達「在界上」與「被截斷」兩件事。

### Decision 8：輸入非法時拋錯，不夾值也不補值

與 `player-roster`（「`rating` 超出 1.00～8.00 時 MUST 驗證失敗，SHALL NOT 靜默夾值或改寫」）以及 `match-allocation`（M2 Decision 7：場地數超出 1～8 時拋錯）一致。靜默夾值的失敗模式是**沉默的**：一個 `rating` 被存成 `8.5` 的損壞資料會被靜默當成 `8.0` 照常計算，主持人永遠不知道名單壞了。拋錯讓 M4 能接住並顯示 `prd.md` 第 11 節要求的繁體中文錯誤訊息。

錯誤訊息格式沿用 `allocation.ts` 既有的寫法（說明修正方式 + 附上實際輸入值），例如：`場地數需為 1 到 8 之間的整數，請調整後再試一次（目前輸入：0）。`

「同一場出現重複的球員 id」也拋錯：這不是使用者能製造的輸入，而是 M4 接線錯誤（例如同一人被分到兩隊）的早期警報。若不擋，該員會被更新兩次且第二次覆蓋第一次，分數靜默錯誤且無跡可循。

### Decision 9：每隊人數由 `PLAYERS_PER_MATCH` 推導

`allocation-types.ts` 明訂 `PLAYERS_PER_MATCH` 是「唯一人數來源——其他模組不得另行寫死 2／4」。本段的每隊人數為 `PLAYERS_PER_MATCH[format] / 2`，SHALL NOT 寫死 1／2。這讓 `match-rating` 對 `match-allocation` 產生一條**只讀常數與型別**的相依，但那是既有規則明文要求的方向，且不構成循環（`match-allocation` 不 import 本段任何東西）。

## Risks / Trade-offs

- **[PRD 6.4.2 表格的「單場變動 ±0.075」是漸近值，不是實際值]** → `0.075 = K_base × 0.5` 只在 `gamesPlayed → ∞` 時成立。實際上新手（0 場）勢均力敵的單場變動是 `±0.15`（`K_eff = 0.30`），20 場時是 `±0.1125`。這不是矛盾，是 6.4.2 表格在描述基礎常數的效果、6.4.3 才引入遞減。**記錄於此以免 M5 的 UI 文案照抄 0.075**，那個數字對絕大多數使用者的實際體驗是錯的。

- **[零和在 K_eff 不同時不成立，若 UI 顯示「群體總分」會看到緩慢漂移]** → 見 Decision 4 的外溢約束，已寫進 spec 的零和 Requirement 作為對 M5／M7 的 SHALL NOT。

- **[觸界者的 `delta` 為 0，M5 若以 `delta === 0` 推論「沒打過」會出錯]** → 一個賽前已在 8.00 的人打贏，`delta` 就是 `0`。M5 必須以 `atUpperBound` 標示「已達上限」，SHALL NOT 從 `delta === 0` 反推任何語意。已在 spec 的邊界 Scenario 中把「已達上限者落敗照常下降」與「勝方被夾 delta 為 0」拆成可分辨的情境。

- **[輸出型別將被 M4 持久化，日後改型別即是破壞性遷移]** → 這是 M1 `restCount`／`gamesPlayed`、M2 `Match` 欄位的教訓延續。`RatingChange` 一次帶齊 `prd.md` 8.2 歷史紀錄所需的「賽前分數」「賽後分數」，加上 M5 需要的三個旗標與變動值，即使 M4 暫時用不到某欄也先放進去。

- **[雙打的「平均 vs 總和」是最容易寫錯且測不出來的地方]** → 在 2 人隊伍上，用總和算 `E` 不會拋錯、不會產生越界分數，只會讓級距悄悄變成 `D = 1.5`，行為看起來仍然「合理」。緩解方式是 spec 的 Scenario 直接寫死一組**用平均與用總和會得到不同結果**的輸入（平均差 1.00 對總和差 2.00，`E` 為 0.683 對 0.823），讓這個錯誤在測試上必定現形。

- **[`gamesPlayed` 由 M4 累加，M3 無法驗證它真的會被累加]** → 若 M4 忘了累加，`K_eff` 會永遠停在 2 倍，所有人的分數都會劇烈跳動而沒有任何錯誤訊息。本段無法防守這件事（不累加是本段明訂的 Non-Goal），但 spec 已把「本 capability 只讀取不累加」寫成明文，M4 的 verify 階段應對照此句確認累加確實有人做。

## Open Questions

- **平局路徑**：`prd.md` 13.4 明訂平局不得送出，因此本段不提供 `S = 0.5`。若未來開放平局（例如計時制），需另開 change 補 `S = 0.5` 的 Scenario 與 clamp 行為——屆時零和的成立條件不變。
- **雙打是否應改以隊伍總和搭配放大的 `D`**：本段依 6.4.4 明文採平均。若日後實測發現雙打的分數流動過慢（每人只承擔一半的隊伍分差），正確的調整方向是校準 `D`，而不是改成總和——記錄於此以免日後有人把它當 bug 修。
- **`RatingUpdateResult` 是否該一併回傳建議的 `gamesPlayed` 新值**：目前不回傳（Non-Goal）。若 M4 實作時發現「更新評分」與「累加場次」總是成對出現而容易漏做其中一半，可在 M4 的 change 內討論是否把兩者合併為一個回合層級的函式；本段不預留該欄位，避免回傳一個自己不負責的值。
