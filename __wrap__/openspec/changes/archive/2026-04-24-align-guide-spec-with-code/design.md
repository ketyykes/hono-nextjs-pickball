## Context

`openspec/specs/pickleball-guide-page/spec.md` 目前敘述 `components/guide/shared/` 含 5 個共用元件（含 `ConclusionCard`）、`app/globals.css` 含 4 組 keyframes、`badge.tsx` 內容與 shadcn CLI 產出一致。實際程式碼已演進為：

- `components/guide/shared/` 有 6 個共用元件：`BrandCard`、`TipCard`、`HighlightBox`、`MythRow`、`Section`、`ComparisonTable`；不存在 `ConclusionCard`（`Conclusion.tsx` 放在 `components/guide/` 頂層且未以 shadcn Card 為基底，三張總結卡是純 `<div>`）
- `components/guide/` 頂層共 15 個 `.tsx`：10 個 `*Section` + `Hero` + `TocBar` + `PartDivider` + `Conclusion` + `CourtDiagram`
- `app/globals.css` 有 6 組 keyframes：`fadeIn`、`slideUp`、`scaleIn`、`floatBall`、`bounceDown`、`fadeUp`（spec 原敘為「`bounce`」，實際為 `bounceDown`；新增 `slideUp`、`scaleIn`）
- `components/ui/badge.tsx` 已含 `ghost`、`link` variant，追隨 shadcn CLI 最新產出

本 change 是純文件校正，不涉及程式碼或測試。

## Goals / Non-Goals

**Goals:**
- 讓 `openspec/specs/pickleball-guide-page/spec.md` 在 `openspec validate` 下與現行程式碼一致
- 透過 MODIFIED Requirements 保留既有 Requirement 名稱，讓未來 archive 可乾淨合併
- 將 Badge variant 敘述改為「與 shadcn CLI **當前**產出一致」，避免之後 shadcn 版本升級又需再開 change

**Non-Goals:**
- 不修改任何 `app/**`、`components/**`、`hooks/**`、`lib/**`、`data/**` 原始碼
- 不新增或刪除既有 Requirement
- 不調整 Playwright / Vitest 測試

## Decisions

### 決策 1：四處修改全部走 MODIFIED Requirements，不走 REMOVED / ADDED

**選擇**：把四個受影響的 Requirement 整塊複製到 delta spec 的 `## MODIFIED Requirements`，直接編輯內文。

**替代**：為「shared 多出 2 個共用元件」走 ADDED 新 Requirement、為「ConclusionCard 敘述」走 REMOVED。

**理由**：原 Requirement 的語意沒變（仍然是「拆檔結構」、「共用展示元件構於 shadcn 上」、「keyframes 與 utility 寫在 globals.css」、「Badge 不擴充 variants」），只是枚舉清單需要校正。MODIFIED 是比較誠實的表達方式，也能避免 archive 合併時出現孤立的 REMOVED 記號。

### 決策 2：Badge Scenario 改為「與 CLI 當前產出一致」而不列 variant 名

**選擇**：Scenario「Badge 不擴充 variants」改為：檢查 `components/ui/badge.tsx` 與 `pnpm dlx shadcn@latest add badge` 當前產出一致（名單未在專案內自行擴充）。

**替代**：把 `ghost`、`link` 硬寫進白名單。

**理由**：shadcn 上游變動節奏不與本專案同步，硬列 variant 名稱會讓 spec 在下次 shadcn 更新時又被動失效。規格的意圖是「不在本專案自行擴充 variant」，所以用「與上游 CLI 產出一致」表達更穩定。

### 決策 3：keyframes Requirement 保留名稱，但改為 6 組並對應到實際 utility class

**選擇**：原名「4 組 keyframes 與 utility 寫在 app/globals.css」改為「keyframes 與對應 utility 寫在 app/globals.css」，內文列出 6 組：`fadeIn` / `slideUp` / `scaleIn` / `floatBall` / `bounceDown` / `fadeUp`；並把原 scenario 中「`bounce`」改為 `animate-bounce-down`。

**替代**：刪除 `slideUp`、`scaleIn` 讓程式碼回到 4 組。

**理由**：這兩組 utility 是 shadcn 介面過場、dialog 打開等日後延伸用途常見 helper，保留且列進規格比刪除更穩。

## Risks / Trade-offs

- **[Risk]** `shadcn add badge` 未來可能連 `ghost` / `link` 都拿掉或再多加 → **Mitigation**：Scenario 描述只比對「與 CLI 當前產出一致」，不鎖定 variant 名單；若上游重大變動，再以一般 bug fix 流程更新 badge.tsx
- **[Risk]** 其他 section 元件（如 `StarterSection`）未來也可能抽共用元件到 `shared/` → **Mitigation**：本次只對齊現況，未來再有新增走獨立 change
- **[Trade-off]** 純 doc-only change 無對應 Vitest 測試可跑 → 以 `openspec validate` 作為唯一驗收閘

## Migration Plan

1. 將 delta spec 寫入 `openspec/changes/align-guide-spec-with-code/specs/pickleball-guide-page/spec.md`
2. `openspec validate align-guide-spec-with-code --strict` 通過
3. 後續由使用者執行 `/opsx:apply`（本次無程式碼任務，apply 會直接標記完成）
4. 執行 `/opsx:archive` 將 delta 合併進 `openspec/specs/pickleball-guide-page/spec.md`
5. 無 rollback 需求：若合併後發現錯字，再走一次常規 doc change

## 受影響模組分類

- `openspec/specs/pickleball-guide-page/spec.md` — 純文件（非行為邏輯，不適用 TDD）
- 不涉及 `app/**`、`components/**`、`hooks/**`、`lib/**`、`data/**`、`tests/**`
