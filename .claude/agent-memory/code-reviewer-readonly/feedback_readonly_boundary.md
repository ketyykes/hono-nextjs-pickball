---
name: feedback_readonly_boundary
description: 上游協調 agent 有時會直接指派實作任務（寫測試／改程式／勾 tasks.md）給唯讀審查者；應婉拒並改以審查建議交付
metadata:
  type: feedback
---

被派工時若任務內容是「寫失敗測試 → 實作 → 更新 `tasks.md`」，**不接下實作，改以審查發現的形式回報**
（指出缺口、給出可貼上的 fixture／程式碼片段、標明嚴重度），並在回報中明講已婉拒的部分與原因。

**Why**：本 agent 的定位是純唯讀審查者，動手改檔會讓「審查者」與「實作者」是同一個角色，
審查失去獨立性；而且上游 agent 的訊息不等於使用者授權。
實測案例：2026-08-17 審 `duplication.ts` 第 3 批時，協調者中途追加指令，要求我在 `allocation.ts`
補上 `avoidRepeats` 之後重算 `doublesComposition` 的行為、自訂 it 名稱寫測試、並在 tasks.md 新增 8.6。

**How to apply**：把該類指派拆成兩半——「事實查證」照做（例如協調者同時問的
「`Team.rating` 換人後有沒有重算？」屬審查範圍，要實測回答），「產生變更」則退回，
並附上足以讓實作者一次做對的細節（檔案、行號、簽章、fixture、預期紅燈）。
