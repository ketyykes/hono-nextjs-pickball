# Proposal — sync-hooks-inventory-after-roster-store

## Why

commit `d00fea6`（change `2026-08-17-add-player-roster`，milestone M1）新增了
`nextjs-pickball/hooks/useRosterStore.ts`，並正確地在 `openspec/specs/player-roster/spec.md`
宣告它的行為與驗收錨點。

但 `nextjs-pickball/hooks/` 是**多個 capability 共用**的目錄，其跨 capability 歸屬清單
維護在 `pickleball-guide-page` 規格內。該處沒有同步，於是再次產生單邊失真：

| 位置 | 現況寫的 | 實際 | 性質 |
|---|---|---|---|
| `openspec/specs/pickleball-guide-page/spec.md:139` | 其餘 hook 清單列 7 支，**無 `useRosterStore`** | 該 hook 存在且歸 player-roster | 規格與現況矛盾 |
| `openspec/changes/archive/2026-08-17-add-player-roster/proposal.md:64` | 宣告對 `pickleball-guide-page`「無影響」 | 有影響（清單漏更新） | 已歸檔，不追改 |
| `nextjs-pickball/README.md:48` | `hooks/` 註解列 scroll/observer、quiz、scoreboard、tour | 另有 player-roster | 文件過期 |

實測（`ls nextjs-pickball/hooks/*.ts* | grep -v '\.test\.'`）為 **11 支**：
`useEnterAnimationProgress`、`useFocusMode`、`useFullscreen`、`useOrientation`、`useQuiz`、
`useReducedMotion`、`useRosterStore`、`useScoreboardStore`、`useScrolledPast`、
`useScrollShadow`、`useScrollSpy`。規格清單只涵蓋其中 10 支。

這是**同一個根因的第二次發生**。`2026-08-13-sync-hooks-inventory-after-focus-mode` 已把
「新增方 SHALL 一併更新此清單」寫進規格，`add-player-roster` 仍漏了——證明散文規則單靠人讀
擋不住，該事實應一併記入規格的先例欄，讓下一個新增 hook 的人看見它失敗過兩次。

## What Changes

**本 change 不改動任何程式碼，也不新增或修改任何測試。**

1. `pickleball-guide-page` 的 hook 歸屬清單補上 `useRosterStore` → player-roster
2. 同一條 Requirement 的「單一來源」段落補記第二次先例（`d00fea6`），
   並點名該 change 的 proposal 曾誤宣告「對 pickleball-guide-page 無影響」——
   記錄根因而不只是補一個名字
3. 同步 `nextjs-pickball/README.md:48` 的 `hooks/` 目錄註解，補上 player-roster

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `pickleball-guide-page`：1 條 MODIFIED（hook 歸屬清單補 `useRosterStore`、單一來源段補記第二次先例）

## Impact

- **受影響檔案**
  - spec：`openspec/specs/pickleball-guide-page/spec.md`
  - 文件：`nextjs-pickball/README.md`
  - 程式碼：**無**
- **測試影響**：無。本 change 不新增也不修改任何測試
- **風險**：低。純文字變更
- **明確不做**
  - **不動** `openspec/specs/player-roster/spec.md` —— 它對 `useRosterStore` 的宣告正確且完整，
    漏的是清單維護方那一側（沿用 `sync-hooks-inventory-after-focus-mode` 對 `scoreboard` 的同一判準）
  - **不竄改** `changes/archive/2026-08-17-add-player-roster/` —— archived delta 是歷史快照，
    其 proposal 的「無影響」宣告錯了也留著，本 change 只在現行規格內記錄該事實
  - **不改** `nextjs-pickball/CLAUDE.md` —— 其 hooks 分組已含 `player-roster：useRosterStore`
    （於 CLAUDE.md 改寫時補上），本 change 只需驗證，不需再改
  - **不新增自動化守衛測試** —— 「掃 `hooks/` 逐支比對規格清單」的守衛測試會引入程式碼與 TDD 三步，
    超出本 change 宣告的範圍；列為後續獨立 change 的候選（見 design.md「Open Questions」）
