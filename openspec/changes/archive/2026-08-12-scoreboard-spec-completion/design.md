## Context

本 change 是 8 個規格債 change 中**唯一零程式碼變更**的一個，
也是唯一有客觀 exit code 可驗收的一個（`openspec validate` 從 fail 變 pass）。

因此設計上只有兩個問題要回答：
1. 補進去的本文要寫什麼才不是廢話？
2. 錨點怎麼挑才不會又造出一批失效引用？

## TDD 分層判定

**全數例外層。零程式碼變更，因此無任何 TDD 適用對象。**

`openspec/specs/**` 不在 `config.yaml:9-10` 的 TDD 範圍（`nextjs-pickball/{app,components,hooks,lib,data}/**`）內。
驗收方式為 `openspec validate --all` 的 exit code 與錨點存在性 grep。

## 關鍵決策

### D-③-1｜SHALL/MUST 必須放在 Requirement 的第一行

change ① 執行時實測發現：openspec 的關鍵字檢查**只解析 Requirement heading 之後的第一行**，
不是整段本文。當時 `dev-workflow` 有兩條 Requirement 把 SHALL 寫在第二行，validate 仍報：

```
✗ [ERROR] ADDED "部署前品質門檻" must contain SHALL or MUST
```

本 change 的 7 條 MODIFIED 全部把規範性語句放在第一行，說明性段落放第二段之後。
**這是 ③ 能否一次通過的關鍵**，寫錯會白跑一輪 validate。

### D-③-2｜本文要承載「為什麼」，不是把 Scenario 換句話說

補本文最容易的做法是把底下 Scenario 的 WHEN/THEN 濃縮成一句 SHALL。
那樣做能通過 validate，但規格價值等於零 —— 讀者從 Scenario 就能看出來的事，不需要再寫一次。

真正該進本文的是**只存在於實作者腦中、Scenario 表達不了的約束與理由**：

| Requirement | 本文承載的理由 | 若不寫下來會怎樣 |
|---|---|---|
| Undo 機制 | MUST 用 replay 而非反向運算，因為 side-out 與 serverNumber 轉移不可逆推 | 有人會為了效能改寫成反向運算，然後在雙打 side-out 情境靜默算錯 |
| RWD 排版 | 關閉狀態 MUST 用 sessionStorage，SHALL NOT 用 localStorage | 有人「順手」改成 localStorage，使用者換方向後永遠看不到提示 |
| 視覺回饋 Toast | SHALL NOT 在得分時顯示，因為分數大字已是足夠回饋 | 有人覺得「得分也該有 toast」而加上去，造成資訊重複 |
| 按鈕版面穩定性 | 版面穩定性是**功能需求**不是美觀偏好——快速連點介面的位移會造成誤觸 | 有人在重構時把 `invisible` 改成條件式不渲染，省了一個 DOM 節點卻製造誤觸 |
| 全螢幕模式 | 不支援時 MUST 隱藏，SHALL NOT 顯示按了沒反應的控制項 | 有人改成 disabled 樣式保留按鈕，iOS 使用者以為壞掉 |
| 賽前設定 | 比賽中改規則會讓已累積的分數失去意義 | 有人為了「彈性」放寬鎖定 |

### D-③-3｜錨點只引用已驗證存在的 it 名稱

quiz spec 就是引用了兩個不存在的 it 名稱（`-t` 過濾抓不到任何案例）才被稽核抓出來。
本 change 引用的每一個名稱都先 grep 確認過：

- `reducer.test.ts` 14 個 it（`:6 / :18 / :29 / :37 / :46 / :52 / :61 / :67 / :78 / :86 / :98 / :111 / :117 / :128 / :138`）
- `scoreboard.spec.ts` 6 個 E2E test（`:22 / :30 / :46 / :58 / :78 / :97`）

引用時**逐字複製**，不重新措辭。

### D-③-4｜驗收硬門檻用非 strict，strict 列為 nice-to-have

`openspec validate --all` 是 ERROR 級檢查，必須全過。
`--strict` 多出的是 `[WARNING] Purpose too brief` 與 `[INFO] Requirement > 500 characters`，
兩者都不是 ERROR。本 change 順手把 Purpose 補長（成本極低），
但**不以 strict 全綠作為完成條件** —— 為了消 INFO 而拆分內容完整的 Requirement 是本末倒置。

## 不做的事

- **不補任何測試**：setup 與 RESET 的行為已由 `reducer.test.ts` 7 個 it 與 E2E 1 個 test 完整覆蓋。
  再補一輪只會製造冗餘測試，且違反「補測試前先確認沒被覆蓋」的原則
- **不改 `ActionBar.tsx` 的 `disabled`**：spec `:64` 寫 `aria-disabled` 是**規格錯**不是實作錯。
  原生 `disabled` 讓按鈕真的不可點且不可聚焦，`aria-disabled` 只影響輔助技術朗讀。
  這裡要修的是 spec
- **不動 Scenario 的 WHEN/THEN 語意**：既有 Scenario 描述準確，只在必要處補「驗收」行
