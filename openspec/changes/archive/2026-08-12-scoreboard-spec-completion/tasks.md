# Tasks — scoreboard-spec-completion

> **全數例外層，零程式碼變更，無 TDD**（依據見 design.md「TDD 分層判定」）。
> 驗收方式為 `openspec validate` 的 exit code 與錨點存在性 grep。

## A. 補規範性本文（每條第一行即含 SHALL/MUST）

> ⚠️ openspec 的關鍵字檢查**只看 Requirement 的第一行**（change ① 實測）。
> 寫在第二行會被判 ERROR。

- [x] **A1** 「計分規則 — Traditional Side-Out」補 SHALL 於第一行 + 實作檔與測試檔路徑
- [x] **A2** 「Undo 機制」新寫本文：SHALL 提供 Undo；MUST 用 replay，SHALL NOT 用反向運算（理由：side-out 與 serverNumber 轉移不可逆推）
- [x] **A3** 「localStorage 持久化」新寫本文：MUST 經 zod 驗證；失敗 MUST 清 key 並 fallback，SHALL NOT 崩潰
- [x] **A4** 「RWD 排版」新寫本文：橫幅關閉狀態 MUST 用 sessionStorage，SHALL NOT 用 localStorage（理由：方向偏好不該跨分頁持久保留）
- [x] **A5** 「全螢幕模式」新寫本文：不支援時 SHALL 隱藏，SHALL NOT 顯示按了沒反應的控制項
- [x] **A6** 「視覺回饋 Toast」新寫本文：SHALL 僅在分數未變時顯示，SHALL NOT 在得分時顯示（理由：與分數大字資訊重複）
- [x] **A7** 「按鈕版面穩定性」新寫本文：indicator SHALL 永遠佔位，MUST 用 `invisible` 而非條件式不渲染（理由：快速連點介面的位移會造成誤觸）

## B. 新增 Requirement

- [x] **B1** 新增「賽前設定與階段鎖定」，涵蓋：
  - `SET_MODE` / `SET_FIRST_SERVER` 僅在 `status === "setup"` 生效
  - UI 以原生 `disabled` 表達鎖定，兩個控制項各有 `aria-label`（「比賽形式」「先發球方」）
  - RESET 保留 `mode` / `firstServer`、清空分數與 history、`status` 回 `setup`
  - 重置 MUST 二次確認（誤觸會讓整場分數消失且無法 Undo）
  - 5 個 Scenario，全部引用既有測試錨點

## C. 補路徑與測試錨點

- [x] **C1** 每條 Requirement 本文標明實作檔路徑（`lib/scoreboard/{rules,reducer,storage}.ts`、`hooks/use{Fullscreen,Orientation}.ts`、`components/scoreboard/*.tsx`）
- [x] **C2** 14 個 Scenario 補「驗收」行，引用既有 it / test 名稱
  - 引用前已逐一 grep 確認存在：`reducer.test.ts` 14 個 it、`scoreboard.spec.ts` 6 個 test
  - 逐字複製，不重新措辭（quiz spec 就是因為重新措辭而造出兩個失效錨點）

## D. 修正誤述

- [x] **D1** Scenario「空 history 不能 Undo」的 `aria-disabled` → 原生 `disabled`
  - 依據：`components/scoreboard/ActionBar.tsx:27` 是 `disabled={!canUndo}`；全 repo 無元件輸出 `aria-disabled`
  - **要修的是 spec 不是實作** —— 原生 `disabled` 讓按鈕真的不可點且不可聚焦，才是正確做法

## E. Purpose 補長（直接改主 spec）

- [x] **E1** `openspec/specs/scoreboard/spec.md` 的 Purpose 補到 50 字以上
  - 依據：Purpose 不是 Requirement，delta 機制無法承載
  - 這是 nice-to-have（strict 的 WARNING），非本 change 的硬門檻

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

# 1. 硬門檻：change 本身 validate 通過（含 strict）
DO_NOT_TRACK=1 openspec validate scoreboard-spec-completion --strict   # 期望 valid

# ⚠️ 重要：`openspec validate --all` 中的 `spec/scoreboard`（主 spec）**在 archive 之前仍會 fail**。
# delta 要等 `openspec archive` 或 sync 才會套用到 openspec/specs/scoreboard/spec.md。
# 因此「validate --all 全綠」是本批 change **全部 archive 之後**的驗收，不是 ③ 單獨完成的當下狀態。
DO_NOT_TRACK=1 openspec validate --all           # 現階段預期：spec/scoreboard 仍 ✗，change/* 全 ✓

# 2. 規範性關鍵字與錨點
grep -c "SHALL\|MUST" openspec/changes/scoreboard-spec-completion/specs/scoreboard/spec.md   # 期望 >= 7
grep -c "nextjs-pickball" openspec/changes/scoreboard-spec-completion/specs/scoreboard/spec.md  # 期望 > 0

# 3. 引用的錨點確實存在（抽驗）
grep -c "setup 階段可切換 mode" nextjs-pickball/lib/scoreboard/reducer.test.ts     # 期望 1
grep -c "重置含二次確認" nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts        # 期望 1

# 4. 零程式碼變更（本 change 不該碰任何原始碼）
git status --short -- nextjs-pickball/ hono-pickball/    # 期望無輸出

# 5. 迴歸：測試不變
pnpm --filter ./nextjs-pickball test --run       # 期望 19 檔 93 測全綠
```
