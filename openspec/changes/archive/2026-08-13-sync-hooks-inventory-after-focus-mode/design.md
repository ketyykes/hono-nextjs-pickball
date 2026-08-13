## Context

本 change 修的是一個**結構性**問題，不是單純的筆誤：
`nextjs-pickball/hooks/` 由四個 capability 共用，但它的分工清單只維護在其中一個
（`pickleball-guide-page`）的規格裡。任何 capability 往該目錄新增 hook，都得回頭更新別人的規格。
`4c5b724` 沒有這麼做，於是清單失真。

只補一個 `useFocusMode` 名字會讓同樣的事在下一支 hook 再發生一次，所以 design 的重點是**訂規則**。

## TDD 分層判定（依 `openspec/config.yaml` 前端 TDD 範圍）

| 項目 | 分類 | 依據 |
|---|---|---|
| `openspec/specs/**` 的 spec 文字 | **例外層** | 非程式碼 |
| `nextjs-pickball/CLAUDE.md`、`README.md` | **例外層** | 純文件 |

**本 change 沒有三步 TDD task，也沒有任何程式碼與測試變更。**

## 關鍵決策

### D1｜把清單訂為「單一來源」，並要求新增方回頭更新

三種可能的修法：

1. 只補 `useFocusMode` 一個名字 → 下次新增 hook 時原樣重演
2. 把清單搬到某個中立位置（例如 `dev-workflow`）→ 動到三個 capability 的規格，
   為了一行清單付出的代價過高，且 `pickleball-guide-page` 本來就是 hooks 目錄的最大使用方
3. **維持清單在原處，但明訂它是單一來源，並把「新增方 SHALL 一併更新」寫進 Requirement** ← 採用

選 3 的理由：漂移的根因是「沒人規定要同步」，不是「清單放錯地方」。
規則寫進規格後，下一個往 `hooks/` 新增檔案的 change 在讀自己的 capability 規格時
就會被引導過來，成本只有一行。

Requirement 內同時寫下先例（`4c5b724` 漏更新），讓規則有具體的因由，而不是憑空的紀律要求。

### D2｜「另有 6 支」去數字化，與姊妹 change 同一判準

`spec.md:203` 的「目錄下另有 6 支歸屬其他 capability」是典型的**他人可改變的數量**：
本 capability 一行程式碼都沒動，這個數字卻會因為別人新增 hook 而過期。

這與 `2026-08-13-tour-scene-spec-cleanup` 移除 `dev-workflow`「完整套件的 15 檔」是同一件事，
判準一致：**規格不寫死會隨他人增修而變動的統計值**。

保留的是本 capability 自己擁有的「3 支」—— 那個數字由本 capability 全權決定，不會被他人改變。

### D3｜不動 scoreboard 規格

`scoreboard/spec.md:169` 對 `useFocusMode` 的宣告完整且正確
（含實作路徑、對外介面、`sb-focus` 全域副作用與 unmount 清理），
四條 Scenario 也都錨定 `useFocusMode.test.ts` 的實際 it 名稱。

該側沒有任何漂移，動它只會擴大本 change 的影響範圍。
