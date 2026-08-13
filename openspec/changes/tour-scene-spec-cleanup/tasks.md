# Tasks — tour-scene-spec-cleanup

> 分類依 design.md「TDD 分層判定」。**本 change 沒有任何三步 TDD task**，也沒有任何程式碼變更。
> 所有指令從 repo root 執行。

## A. spec 文字（例外層，delta 已寫好）

- [ ] **A1** 驗證兩份 delta（`specs/tour-experience/spec.md`、`specs/dev-workflow/spec.md`）可被 openspec 解析
  - 驗收：`DO_NOT_TRACK=1 openspec validate tour-scene-spec-cleanup --strict` EXIT=0
- [ ] **A2** 確認 delta 內除了刻意修改處之外，與現行主規格逐字一致
  - 刻意修改處共四項：① reduced-motion 括號舉例去數值化 ② 新增「SHALL NOT 以動畫實作常數表述終點狀態」段與歷史說明 ③ 新增 2 條 Scenario ④ dev-workflow「15 檔」→「全部測試檔」與新增的統計值禁令段
  - 驗收：archive 後 `git diff openspec/specs/` 只出現上述四項

## B. Regression guard（實作已存在，引用既有測試 — 不套三步）

> ⚠️ 5 個 it 全部已存在且全綠（`49ed54a` 隨程式碼一起進來）。合法驗收只有「指令 EXIT=0」。
> **禁止用 mutation check 偽造紅燈**（沿用 `2026-08-12-fix-guide-and-quiz-spec-drift/design.md` D-②-1）。

- [ ] **B1** 確認 delta 引用的 5 個 it 名稱與測試檔逐字一致：
      `p=1 廚房區保留警示紅色調（終點狀態傳達違規）`、
      `p=1 幽靈軌跡與落點標記保持可見（reduced-motion 終點可讀）`、
      `撞擊前（p=0）與 p=1 皆無位移`、
      `p=1 所有波紋已淡出（終點畫面乾淨）`、
      `p=1 紅閃已完全退去（終點畫面乾淨）`
  - 驗收：`pnpm --filter ./nextjs-pickball test --run components/tour/stages/kitchenScene.test.ts` → 1 檔 25 測全綠
- [ ] **B2** 確認這 5 個 it 斷言的是**性質**而非常數（`toBeGreaterThan(0)`、`toBe(0)`、`toEqual({ x: 0, y: 0 })`），
      引用它們不會把實作常數帶回規格
  - 依據：`nextjs-pickball/components/tour/stages/kitchenScene.test.ts:119-183`

## C. 直接編輯主檔（delta 無法承載，見 design.md D4）

- [ ] **C1** `openspec/specs/tour-experience/spec.md:7` 的 design doc 路徑
      `nextjs-pickball/docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md`
      → `docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md`（repo root）
  - 依據：docs 樹於 `752a0b5` 合併，實測 `ls docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md` 存在、
    `ls nextjs-pickball/docs/superpowers/...` 為 `No such file or directory`
  - ⚠️ 該行位於 Purpose 之後、`## Requirements` 之前的引言區塊，不屬任何 Requirement，delta 套不到
  - 驗收：`ls $(grep -o 'docs/superpowers/specs/[^`]*' openspec/specs/tour-experience/spec.md | head -1)` EXIT=0
- [ ] **C2** `openspec/config.yaml:58` 的「（實測 15 檔 77 測）」→ 標明為當時實測或去數字化
  - ⚠️ 只改括號內的統計值，**不要動**同一行「`--run` 前不可加 `--`」的規則本身
  - 驗收：`grep -n "15 檔 77 測" openspec/config.yaml` 若仍有輸出，該行須含「當時」字樣

## D. 不做的事（明確記錄，避免下一個人補上）

- [ ] **D1** 確認**沒有**為 `kitchenScene.ts` / `closingScene.ts` 的純函式新增 Requirement
  - 理由見 design.md D2：動畫幾何屬實作細節；`tour-experience` 指向 `components/**` 的 TEST 標註維持在最小必要範圍
  - 驗收：`grep -c "closingScene" openspec/changes/tour-scene-spec-cleanup/specs/tour-experience/spec.md` 為 0
- [ ] **D2** 確認**沒有**為 commit `2b7662c` 開任何 delta
  - 理由見 design.md D3：ClosingStage 的三項規格約束前後逐字未變，零漂移

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

# 1. 失效的實作常數已從規格移除
grep -n "廚房紅區 0.85" openspec/specs/tour-experience/spec.md   # archive 後期望無輸出

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
