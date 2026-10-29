## Why

執行手冊已歸檔至 `docs/`，主 spec `user-data-sync` 仍有兩處以「runbook R2／R3」與「design Decision 2」作為理由出處，讀者需要翻已歸檔的流程文件才看得懂。
規格應自含理由，本 change 把這些出處改為直接寫出的理由。

## What Changes

- `user-data-sync`「前端依 session 選擇儲存模式」：`（runbook R3）` 改為直接說明理由（訪客行為與既有 E2E 須零迴歸）。
- `user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」：移除 `（runbook R2）`；`（design Decision 2 的 Context7 查證與 characterization 測試）` 改為不指向特定 change 的說法。
- 純措辭修改，SHALL／MUST 條文、Scenario 與驗收錨點逐字不變；不改程式碼、測試、相依。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：兩條 Requirement 的理由措辭，行為不變。

## Impact

- 只有 `openspec/specs/user-data-sync/spec.md`（經 archive 合併）。無程式碼、測試、E2E、相依變動。
