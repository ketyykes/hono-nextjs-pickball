# Test Plan: local-fallback-export-reminder

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（前端 Vitest＋happy-dom）；`e2e`（Playwright，僅作回歸）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **授權改寫的既有測試（僅限下列；其餘既有 it／test 的名稱、斷言與 setup 一律不得修改）**：
> `nextjs-pickball/lib/sync/sync-status.test.ts` 的 it「unavailable 取代內容，按鈕與本機提示文案為固定值」：`LOCAL_FALLBACK_NOTICE` 的字面值斷言改為新文案（名稱與其他斷言不變）。
> 這是**真紅**：改寫前後常數仍是舊字面值，改寫後測試必紅；GREEN 才改常數。
>
> 本 change 沒有新增 Scenario；delta spec 內三個 Scenario（固定值、本機提示只在本機備援時出現、E2E 本機備援）只更新文案。其中後兩者的測試經常數引用，**不需改**，作為回歸。

## user-data-sync

### Requirement: session 無法確認時的阻擋畫面與本機備援

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `unavailable 取代內容，按鈕與本機提示文案為固定值`（改寫既有 it） | 無法確認的顯示狀態取代內容且新文案為固定值 | `LOCAL_FALLBACK_NOTICE` 等於「目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端」；`isContentBlocked("unavailable")` 為 true、按鈕文字與 load-failed 文案不變 | 真紅：以字面值斷言新文案，GREEN 前常數仍為舊文案；是文案唯一的字面值鎖定點 | unit |
| `只在本機備援時顯示修改只存在這台裝置的提示，其餘快照不渲染`（`LocalFallbackBanner.test.tsx`，不改） | 本機提示只在本機備援時出現 | 渲染文字取自常數、class 含 `fixed`、`pointer-events-none`、`print:hidden`、`z-30`、`[.sb-focus_&]:bottom-16`；其餘六種快照為空 | regression guard：文案變長不得影響顯示條件與不擋操作的樣式 | unit |
| `有上次登入提示而 session 請求失敗時先擋住畫面，按下先用這台裝置的資料後顯示本機名單與本機提示`（`data-pending.spec.ts`，不改） | 有上次登入提示而 session 請求失敗時先擋住畫面，選擇後改用本機名單 | 按下後 `getByText(LOCAL_FALLBACK_NOTICE)` 可見 | regression guard：換行後的長提示仍整句可見（含 mobile project） | e2e |

## 指令驗收

| 編號 | 指令與期望 |
|------|-----------|
| C1 | 三段 typecheck：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`、後端、核心 `typecheck` 皆 exit 0 |
| C2 | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖）0 errors、warning 不多於基線 |
| C3 | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖）三組皆綠；前端測試數與檔數＝基線（無新增 it） |
| C4 | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖）exit 0；建置後 `git status --porcelain` 為空 |
| C5 | 全瀏覽器 gate（coordinator）：`/tmp/cgate2.sh local-fallback-export-reminder`，各 project 數量＝基線、0 failed |
| C6 | 舊文案消失：`grep -rn "重新整理頁面可再次連線雲端" /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball /Users/m2_24gb/Desktop/project/nextjs-pickball/packages --exclude-dir=node_modules --exclude-dir=.next` 無輸出（exit 1） |
| C7 | 主 spec 以外不留舊字串：`grep -rln "重新整理頁面可再次連線雲端" /Users/m2_24gb/Desktop/project/nextjs-pickball/openspec/changes/local-fallback-export-reminder/specs` 無輸出（本 change 的 proposal／design／overview 以引號描述「舊文案」屬說明，不計）；主 spec（`openspec/specs/**`）在 archive 同步前仍含舊字串屬預期，archive 同步後 `grep -rn "重新整理頁面可再次連線雲端" /Users/m2_24gb/Desktop/project/nextjs-pickball/openspec/specs` 無輸出 |
| C8 | 範圍：`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat` 只含 `nextjs-pickball/lib/sync/sync-status.ts`、`nextjs-pickball/lib/sync/sync-status.test.ts`、`nextjs-pickball/CLAUDE.md` 與本 change 的 artifact；`openspec/specs/**`、`openspec/schemas/**` 無改動 |
| C9 | 既有測試只改授權處：`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main -- nextjs-pickball/lib/sync/sync-status.test.ts` 的刪除行只有舊字面值那一行 |
| C10 | `DO_NOT_TRACK=1 openspec validate local-fallback-export-reminder --strict` 通過 |

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names use imperative form（本 change 沿用既有 it 名稱，不新增）
