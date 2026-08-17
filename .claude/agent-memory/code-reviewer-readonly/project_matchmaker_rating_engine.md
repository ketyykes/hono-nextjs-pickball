---
name: matchmaker-rating-engine-review
description: M2 評分引擎（rating.ts）分批審查記錄：第 1 批 mutation 存活清單、round-half-up 造成的 +0.01 零和越界（會讓 §7 用 spec 自訂的 0.01 界線失敗）、tasks.md 證據查核法
metadata:
  type: project
---

`openspec/changes/matchmaker-rating-engine/` 分批實作，第 1 批（commit `cf81151`，branch
`feat/matchmaker-rating-engine`）為 §1～§4：`expectedScore`、`effectiveK`、單打 `updateRatings`。
§5 雙打／§6 clamp／§7 零和／§8 無狀態由另一個 agent 並行接手。

**Why**：這批的公式全部驗算正確、慣例全過、tasks.md 證據經數值重算確認為真，但測試對
「敗方側」與「`delta` 的 round 後語意」幾乎沒有約束；且有一個規格自身界線不成立的數值事實，
後續批次不知道就會踩到。

**How to apply**：接手審 §5～§8 時直接沿用下列結論，不必重跑整套。

## 第 1 批的 mutation 存活清單（32 項中 8 項存活，皆為測試覆蓋缺口而非實作錯誤）

敗方側完全未被約束（4 項全存活）：把敗方 `sMinusE` 由 `winnerExpected - 1` 改成
`-winnerExpected`、`-(1 - winnerExpected)`、固定 `-0.5`，或讓敗方 `effectiveK` 改吃勝方的
`gamesPlayed`，全套測試都不會紅。根因：4 個必要 it 中三個用同分 fixture（`E = 0.5` 時
正確式與錯誤式同值），唯一分差不對稱的 it 只斷言「敗方分數變小」這個方向性。
→ 殺死它需要一個分差不對稱、且斷言敗方**幅度**的 it（例如 `|loserDelta|` 應等於
`kEff × E_loser`，或直接比對勝敗雙方 `rawDelta` 的絕對值關係）。

`delta` 的 round 後語意未被約束（2 項存活）：`delta: after - player.rating` 改成 `rawDelta`
或 `roundRating(rawDelta)` 都不會紅。design Decision 5 明訂 `delta` 必須在 round **之後**算，
§7 的零和斷言正建立在這個語意上。

`clamped` 與 `before` 未被約束（2 項存活）：`clamped` 改成恆為 `"at-max"`、`before` 改成
`after`，皆不紅。這兩項分別由 §6（mutation 9.6）與 §8（Scenario「每筆變動帶有球員識別與
賽前賽後分數」）負責，屬預期內。

## round-half-up 造成的 +0.01 零和越界（§7 必踩）

delta spec 的 Scenario「出場次數相同且未撞邊界時守恆」寫「誤差在四捨五入殘差 `0.01` 以內」，
**這個界線本身不成立**。`roundRating` 用 `Math.round`（half-up），當勝敗雙方的
`rating ± rawDelta` 尾數同時落在 `.xx5`，兩側殘差同號（+0.005 / +0.005）相加而非相消，
合計恰為 `0.01`，再加浮點雜訊後超出。

實測反例：`rating = 5.27` 對 `5.27`、`gamesPlayed = 10`（`E = 0.5`、`kEff = 0.25`、
`rawDelta = 0.125`）→ 5.395 進位成 5.40、5.145 進位成 5.15 →
`w.delta + l.delta = 0.010000000000001563`，`< 0.01` 與 `<= 0.01` **都失敗**。
同分同場次的 fixture 掃描（rating 1.00～8.00 × n ∈ {0,5,10,15,20,30,40,80}，5608 組）
有 **8.45%（474 組）** 殘差 > 0.01。
→ §7 的零和 it 必須用 `toBeCloseTo(0, 1)` 之類 ≥0.011 的容差，或改比對「round 前的
`rawDelta`」；`toBeCloseTo(x, 2)`（容差 0.005）與硬寫 `< 0.01` 都會偽紅。
另外 design.md 第 86 行「`delta` 必然是兩位小數的差」在 IEEE754 下不成立——n=0 同分掃 701 組
rating，**100%** 的 `delta` 都帶浮點尾數（例如 `5.15 - 5.0 = 0.15000000000000036`）。

## 已驗證正確、不必重查的部分

`expectedScore` 指數符號、敗方 `S − E = winnerExpected − 1` 的代數（`E_loser = 1 − E_winner`、
`S_loser = 0`）、PRD 6.4.2 四校準點（實測 59.48／68.30／82.27／90.91%）、
`effectiveK` 對 `gamesPlayed = 0` 不除以零。`computePlayerChange(player, sMinusE)` 的介面
讓「同隊共用 `S − E`、各自套用自己的 `K_eff`」在 §5 自然成立（`kEff` 在函式內部由
`player.gamesPlayed` 取得，結構上無法傳入共用的 K），**沒有留陷阱**。

## tasks.md 證據的查核法（本批通過）

不要只看格式，把貼出的浮點斷言值重算一次即可判斷真偽。本批 9.7 的
`expected 0.009999999999999787 to be greater than 0.35999999999999943` 與 9.8 的
`'5.396715794961714'` 皆與我獨立重算的值**逐位相符**；2.1 的「4 tests | 3 failed」也用
「砍掉三個函式的 rating.ts + 只留前 4 個 it」重建並得到一字不差的輸出。
2.1 第 4 個 it 在該步即綠燈（常數已於 1.1 匯出）且有標註理由，符合 root CLAUDE.md
「紅燈要是真的、早已實作就誠實標註」的要求。
