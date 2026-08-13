# Tasks — tour-scene-spec-cleanup

📋 **歸檔紀錄說明**：本檔 8/8 個 task 有勾選。
A2（archive 後的 diff 檢查）依其性質必須在 `openspec archive` 執行後才能驗證，
故於歸檔後補記實際結果並勾選 —— 該結果為真實執行所得，非事後補勾。

> 分類依 design.md「TDD 分層判定」。**本 change 沒有任何三步 TDD task**，也沒有任何程式碼變更。
> 所有指令從 repo root 執行。

## 執行中發現

1. **C2 的修法從「去數字化」改為「標明當時實測」**：`openspec/config.yaml:58` 的
   「（實測 15 檔 77 測）」是在說明「加了 `--` 會誤跑完整套」的後果，數字有敘事作用。
   直接刪掉會讓讀者失去「完整套會跑掉多少」的體感，因此改為
   「（當時實測 15 檔 77 測；該數字隨補測持續變動，勿當成驗收基準）」——
   保留敘事、同時關掉「拿它當驗收基準」這條路。這與本 change 對 `dev-workflow`
   新增的規範一致（該規範允許「標明為當時實測的歷史數值」）。
2. **本 change 撰寫期間，被修的問題又發生了一次**：main 上的 `4c5b724`
   （計分板專注模式，新增 `useFocusMode.test.ts`）讓測試基準從 27 檔 157 測
   變成 28 檔 161 測。若 `dev-workflow/spec.md:21` 仍寫「15 檔」，它會第三次過期。
   這是本 change 主張的即時佐證，已寫入 proposal。
3. **C1 的路徑修正順帶補上位置說明**：只把 `nextjs-pickball/docs/...` 改成
   `docs/...` 會讓讀者無從判斷是 workspace 相對還是 repo root 相對，
   故加註「，位於 repo root」。

## A. spec 文字（例外層，delta 已寫好）

- [x] **A1** 驗證兩份 delta（`specs/tour-experience/spec.md`、`specs/dev-workflow/spec.md`）可被 openspec 解析
  - 驗收：`DO_NOT_TRACK=1 openspec validate tour-scene-spec-cleanup --strict` EXIT=0
- [x] **A2** 確認 delta 內除了刻意修改處之外，與現行主規格逐字一致
  - 刻意修改處共四項：① reduced-motion 括號舉例去數值化 ② 新增「SHALL NOT 以動畫實作常數表述終點狀態」段與歷史說明 ③ 新增 2 條 Scenario ④ dev-workflow「15 檔」→「全部測試檔」與新增的統計值禁令段
  - 驗收：archive 後 `git diff openspec/specs/` 只出現上述四項
  - ✅ **實際結果（符合期望）**：`git diff --numstat openspec/specs/` 為
    `5	1	dev-workflow/spec.md`、`20	2	tour-experience/spec.md`。
    逐項對應：dev-workflow 的 1 刪除 = ④ 的「15 檔」該行改寫，4 行新增 = 統計值禁令段；
    tour-experience 的 2 刪除 = ① 括號舉例該行 + C1 的 design doc 路徑該行，
    18 行新增 = ②（2 段）+ ③（2 條 Scenario，共 14 行）+ 兩處改寫行。
    無任何非預期的刪除或改動。
  - 附帶：`pickleball-guide-page/spec.md` 的 `54	0` 屬姊妹 change
    `2026-08-13-formalize-price-stars-and-year-removal` 的 ADDED Requirement，不在本 change 範圍

## B. Regression guard（實作已存在，引用既有測試 — 不套三步）

> ⚠️ 5 個 it 全部已存在且全綠（`49ed54a` 隨程式碼一起進來）。合法驗收只有「指令 EXIT=0」。
> **禁止用 mutation check 偽造紅燈**（沿用 `2026-08-12-fix-guide-and-quiz-spec-drift/design.md` D-②-1）。

- [x] **B1** 確認 delta 引用的 5 個 it 名稱與測試檔逐字一致：
      `p=1 廚房區保留警示紅色調（終點狀態傳達違規）`、
      `p=1 幽靈軌跡與落點標記保持可見（reduced-motion 終點可讀）`、
      `撞擊前（p=0）與 p=1 皆無位移`、
      `p=1 所有波紋已淡出（終點畫面乾淨）`、
      `p=1 紅閃已完全退去（終點畫面乾淨）`
  - 驗收：`pnpm --filter ./nextjs-pickball test --run components/tour/stages/kitchenScene.test.ts` → 1 檔 25 測全綠
- [x] **B2** 確認這 5 個 it 斷言的是**性質**而非常數（`toBeGreaterThan(0)`、`toBe(0)`、`toEqual({ x: 0, y: 0 })`），
      引用它們不會把實作常數帶回規格
  - 依據：`nextjs-pickball/components/tour/stages/kitchenScene.test.ts:119-183`

## C. 直接編輯主檔（delta 無法承載，見 design.md D4）

- [x] **C1** `openspec/specs/tour-experience/spec.md:7` 的 design doc 路徑
      `nextjs-pickball/docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md`
      → `docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md`（repo root）
  - 依據：docs 樹於 `752a0b5` 合併，實測 `ls docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md` 存在、
    `ls nextjs-pickball/docs/superpowers/...` 為 `No such file or directory`
  - ⚠️ 該行位於 Purpose 之後、`## Requirements` 之前的引言區塊，不屬任何 Requirement，delta 套不到
  - 驗收：`ls $(grep -o 'docs/superpowers/specs/[^`]*' openspec/specs/tour-experience/spec.md | head -1)` EXIT=0
- [x] **C2** `openspec/config.yaml:58` 的「（實測 15 檔 77 測）」→ 標明為當時實測或去數字化
  - ⚠️ 只改括號內的統計值，**不要動**同一行「`--run` 前不可加 `--`」的規則本身
  - 驗收：`grep -n "15 檔 77 測" openspec/config.yaml` 若仍有輸出，該行須含「當時」字樣

## D. 不做的事（明確記錄，避免下一個人補上）

- [x] **D1** 確認**沒有**為 `kitchenScene.ts` / `closingScene.ts` 的純函式新增 Requirement
  - 理由見 design.md D2：動畫幾何屬實作細節；`tour-experience` 指向 `components/**` 的 TEST 標註維持在最小必要範圍
  - 驗收：`grep -c "closingScene" openspec/changes/tour-scene-spec-cleanup/specs/tour-experience/spec.md` 為 0
- [x] **D2** 確認**沒有**為 commit `2b7662c` 開任何 delta
  - 理由見 design.md D3：ClosingStage 的三項規格約束前後逐字未變，零漂移

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

# 1. 失效的實作常數已從「規範性敘述」移除
#    ⚠️ 本條原寫「期望無輸出」，實際執行時發現該寫法是錯的：
#    delta 刻意在 Requirement 內保留了一段引述舊值的歷史說明（spec.md:71 的 "> 前一版本此處寫…"），
#    用途是讓後人知道 0.85 為何消失。單純 grep 字串必然命中它，那是設計意圖而非殘留。
#    正確驗收＝規範性句子（SHALL 那句）不得再含該值：
grep -n "SHALL 以 \`useMotionValue(1)\` fallback" openspec/specs/tour-experience/spec.md | grep "0.85" \
  && echo "!! 規範性敘述仍釘實作常數" || echo "OK：規範性敘述已去數值化"
grep -c "廚房紅區 0.85" openspec/specs/tour-experience/spec.md   # 期望 1（僅歷史說明段那一處）

# 2. 規格不再寫死完整套件檔數
grep -n "完整套件的 15 檔" openspec/specs/dev-workflow/spec.md    # archive 後期望無輸出

# 3. design doc 路徑可解析
ls docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md

# 4. 引用的測試錨點有效
pnpm --filter ./nextjs-pickball test --run components/tour/stages/kitchenScene.test.ts   # 期望 1 檔 25 測

# 5. 全套測試與型別（本 change 零程式碼變更，應與變更前一致）
pnpm --filter ./nextjs-pickball test --run   # 全綠即可（撰寫時實測 28 檔 161 測，數字會隨補測變動）
pnpm lint
pnpm -r exec tsc --noEmit

# 6. openspec
DO_NOT_TRACK=1 openspec validate tour-scene-spec-cleanup --strict
DO_NOT_TRACK=1 openspec validate --all
```
