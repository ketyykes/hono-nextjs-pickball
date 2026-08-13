# Tasks — formalize-price-stars-and-year-removal

📋 **歸檔紀錄說明**：本檔 7/7 個 task 有勾選。
D1（archive 後的 diff 檢查）依其性質必須在 `openspec archive` 執行後才能驗證，
故於歸檔後補記實際結果並勾選 —— 該結果為真實執行所得，非事後補勾。

> 分類依 design.md「TDD 分層判定」。**本 change 沒有任何三步 TDD task** ——
> 程式碼在 `0700d34` 已全部完成，這裡只補提案紀錄、規格契約與文件同步。
> 所有指令從 repo root 執行。

## 執行中發現

1. **`0700d34` 的主規格編輯確認為 no-op 基底**：以腳本逐字比對 delta 的三條 MODIFIED
   與現行主規格，全部相同（`首頁顯示完整匹克球指南`、`拆檔結構符合 components / data / hooks 三層`、
   `Hero 入場動畫直接顯示全部內容`）。archive 對這三條不會產生 diff。
2. **撰寫期間 main 前進了一個 commit**（`4c5b724` 計分板專注模式）。它動的是
   `scoreboard` 與 `site-navbar` 兩份規格，與本 change 的三份不重疊；rebase 後重跑
   比對，三條 MODIFIED 仍為 no-op。
3. **測試基準隨之變動**：27 檔 157 測 → **28 檔 161 測**。本檔原先寫死的基準已改為
   「全綠即可」加註撰寫時實測值 —— 這正是姊妹 change `tour-scene-spec-cleanup` 要
   禁止的寫法，在自己的 tasks 裡踩到同一個坑，一併修正。
4. **另發現一處同類漂移，本 change 不處理**：`nextjs-pickball/CLAUDE.md:65` 寫
   「`hooks/` — 共 9 支」，但 `4c5b724` 新增了 `useFocusMode`，實際已是 10 支。
   那屬 scoreboard capability 的文件同步範圍，不在本 change 的 delta 內，
   擅自修改會讓本 change 的影響範圍超出 proposal 宣告。

## A. spec 文字（例外層，delta 已寫好，此處只列驗證動作）

- [x] **A1** 驗證兩份 delta（`specs/pickleball-guide-page/spec.md`、`specs/tour-experience/spec.md`）可被 openspec 解析
  - 驗收：`DO_NOT_TRACK=1 openspec validate formalize-price-stars-and-year-removal --strict` EXIT=0
- [x] **A2** 逐字比對 delta 內兩條 MODIFIED Requirement 與**現行主規格**是否完全一致
  - ⚠️ 基底必須取現行版（HEAD），**不是** `0700d34^` 的舊版（見 design.md D1）
  - 驗收方式見下方 D1 的 archive no-op 檢查

## B. Regression guard（實作已存在，寫測試會直接綠燈 — 不套三步）

> ⚠️ 6 個 it 全部已存在且全綠。合法驗收只有「指令 EXIT=0」。
> **禁止用 mutation check 偽造紅燈**（見 design.md D4）。

- [x] **B1** 確認 `PriceStars` 的 4 個 it 存在且全綠，名稱與 delta 的 Scenario 錨點逐字一致：
      `以 aria-label 表達 1~10 星的價位語意`、`渲染 10 顆星，其中實心星數量等於 stars`、
      `stars 超出範圍時收斂至 1~10 的邊界`、`stars 為 NaN 時仍收斂至最小值，不產生 NaN 標籤`
  - 驗收：`pnpm --filter ./nextjs-pickball test --run components/guide/shared/PriceStars.test.tsx` → 1 檔 4 測全綠
- [x] **B2** 確認資料層 2 個 it 存在且全綠：
      `每筆資料的 priceStars 都是 1~10 的整數`、`guide 原始碼（資料檔、元件、首頁）不得殘留金額字樣`
  - 驗收：`pnpm --filter ./nextjs-pickball test --run data/guide/priceStars.test.ts` → 1 檔 2 測全綠
- [x] **B3** 確認守門測試的掃描範圍與 delta 內寫的一致（`data/guide`、`components/guide`、`components/guide/shared`、`app`，pattern `/NT\$|US\$|NTD|TWD|USD/`）
  - 依據：`nextjs-pickball/data/guide/priceStars.test.ts:29-35`
  - 驗收：規格文字與測試原文逐字對得上

## C. 文件同步（例外層）

- [x] **C1** `nextjs-pickball/CLAUDE.md:63`「`shared/` 下 6 個共用元件」→ 改為列出 7 個元件名（BrandCard、TipCard、HighlightBox、MythRow、Section、ComparisonTable、PriceStars），與 spec 的存在式斷言一致
  - ⚠️ 同一行的「頂層 16 個」仍正確，**不要動**
  - 驗收：`ls nextjs-pickball/components/guide/shared/*.tsx | grep -v test | wc -l` 為 7，且 CLAUDE.md 不再寫死 shared 數量

## D. Archive 驗收（本 change 專屬，最重要的一條）

- [x] **D1** archive 後確認主 spec 的 diff **只有** ADDED Requirement 一段
  ```bash
  DO_NOT_TRACK=1 openspec archive formalize-price-stars-and-year-removal
  git diff openspec/specs/
  ```
  - 期望：`pickleball-guide-page/spec.md` 只新增「價位以 1~10 星級呈現，不揭露實際金額」整段；
    `tour-experience/spec.md` **零 diff**
  - ⚠️ 若兩條 MODIFIED Requirement 產生任何 diff，代表 delta 沒有逐字抄對現行主規格 —— 這是本 change 唯一的失敗模式，必須回頭修 delta 而非接受 diff
  - ✅ **實際結果（符合期望）**：openspec CLI 回報 `pickleball-guide-page: + 1 added, ~ 2 modified`、
    `tour-experience: ~ 1 modified`，但 `git diff --numstat openspec/specs/` 為
    **`54	0	openspec/specs/pickleball-guide-page/spec.md`** —— 54 行新增、**0 行刪除**，
    且 `tour-experience/spec.md` 完全未出現在 diff 中。
    CLI 說的「modified」指 delta 宣告了該 Requirement，不代表內容有變；實際落地為 no-op，符合 design.md D1。

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

# 1. 規格契約已錨定既有測試
pnpm --filter ./nextjs-pickball test --run components/guide/shared/PriceStars.test.tsx   # 期望 1 檔 4 測
pnpm --filter ./nextjs-pickball test --run data/guide/priceStars.test.ts                 # 期望 1 檔 2 測

# 2. 金額字樣在 guide 與 app 下歸零（與守門測試同 pattern）
grep -rnE "NT\\\$|US\\\$|NTD|TWD|USD" nextjs-pickball/data/guide nextjs-pickball/components/guide nextjs-pickball/app --include="*.ts" --include="*.tsx" | grep -v "\.test\."   # 期望無輸出

# 3. 文件數量與實測一致
ls nextjs-pickball/components/guide/shared/*.tsx | grep -v test | wc -l   # 期望 7

# 4. 全套測試與型別
pnpm --filter ./nextjs-pickball test --run   # 全綠即可（撰寫時實測 28 檔 161 測，數字會隨補測變動）
pnpm lint
pnpm -r exec tsc --noEmit

# 5. openspec
DO_NOT_TRACK=1 openspec validate formalize-price-stars-and-year-removal --strict
DO_NOT_TRACK=1 openspec validate --all
```
