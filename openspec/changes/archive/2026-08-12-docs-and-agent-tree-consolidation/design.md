## Context

本 change 收尾整批規格債工作：合併重複的 agent／docs 樹、補上 agent 治理的對外入口、
最後才畫結構圖。它是 8 個 change 中唯一一個**必須排在最後**的。

## TDD 分層判定

**全數例外層。零程式碼變更。**
驗收方式為檔案存在性 grep、`git ls-files` 計數，以及搬移後的迴歸測試。

## 關鍵決策

### D-⑦-1｜canonical 選 repo root

兩個候選：root 或 `nextjs-pickball/`。選 root，理由：

1. `.agents/skills/` 內含 `next-*`（前端）與通用 skill，未來後端也會用 ——
   放在前端 workspace 內會讓後端 agent 找不到
2. `openspec/` 已於先前遷移搬到 root，agent 資產與規格治理放在一起才一致
3. 實測 `diff -rq nextjs-pickball/.agents .agents` 顯示 workspace 是 root 的**嚴格子集**
   （`Only in .agents/skills:` 4 項，反向無命中，且無 `Files ... differ`），
   選 root 為 canonical 不會丟失任何內容

### D-⑦-2｜skills-lock.json 必須合併而非二選一

這是本 change 最容易做錯的一步。兩份 lock 檔**各自缺對方的條目**：

```
root 專有:      next-cache-components-adoption / -optimizer / next-dev-loop / next-partial-prefetching-adoption
workspace 專有: vercel-react-best-practices / vercel-react-view-transitions / web-design-guidelines
```

但那 7 個 skill 的**檔案全都在 root `.agents/skills/`**。
也就是說 root 的 lock 檔漏鎖了 3 個它自己擁有的 skill。

若直接「保留 root、刪 workspace」，那 3 個 skill 會變成無鎖定狀態。
正確做法是把兩份的 `skills` 合併（7 個）後寫回 root，再刪 workspace 那份。

**這正是重複樹的實際傷害**：不是「浪費空間」，而是兩份會各自漂移，
刪錯一份就靜默丟失資訊。

### D-⑦-3｜archived tasks.md 加註記但不補勾

稽核的原始發現是「6 個 archived change 的 task 全部 unchecked 就歸檔」。
本 change 以 `git show HEAD:<path>` 逐檔複核，發現**該陳述大部分不成立**：

7 個 archived change 中，5 個是 100% 勾選（48/48、11/11、33/33、20/20、24/24），
1 個差一項（8/9），只有 `2026-05-08-add-tour-experience` 是真的 0/45。

處置：
- 註記仍加（讓比例對讀者可見，並記錄新的歸檔紀律）
- 描述改為據實陳述，不再宣稱「大量未勾選」
- **不事後補勾** —— 那會偽造當時的執行紀錄。檔案是歷史，不是待辦清單

這也是本批 change 的一個通則：**稽核發現要在執行時再驗一次**。
本批已出現三次「稽核推估被實測推翻」（⑥ 的 navbar 溢出、本項的勾選比例、
以及 ④ 發現 pnpm 對缺少 script 是靜默成功）。

### D-⑦-4｜root AGENTS.md 不複製 workspace 那份

`nextjs-pickball/AGENTS.md` 全檔只有 5 行，內容是 `<!-- BEGIN:nextjs-agent-rules -->`
包住的「This is NOT the Next.js you know」vendor 區塊，`grep -c openspec` = 0。

那是**框架的版本警告**，不是專案規範。直接複製到 root 只會製造第三份無用文件。

root `AGENTS.md` 應寫的是非 Claude Code 的 agent 也踩得到的治理規則：
change 流程、TDD 三步、「紅燈要是真的」、測試指令的正確形式、
以及沙箱與埠號這類會讓 agent 卡住的環境細節。

### D-⑦-5｜結構圖最後才畫

`docs/` 與 `.agents/` 在本 change 內被搬動。若在搬移前先畫結構圖，
就得畫兩次而且中間那次是錯的。

另外 `nextjs-pickball/README.md:54` 把 `openspec/` 畫在 workspace 結構內是**錯的**，
而 root `README.md` 畫的位置是**對的** —— 修的是前者，不要「統一」成錯的那個。

## 不做的事

- **不刪 `nextjs-pickball/AGENTS.md`**：它的 vendor 區塊對前端 agent 仍有價值
  （Next.js 16 的 breaking change 提醒），只是不該是唯一的入口
- **不合併 `.claude/agent-memory`**：那是 agent 的執行時記憶，不是受版控的規範資產，
  與本 change 要解決的「規則來源重複」不同性質
- **不動 `nextjs-pickball/docs/pickleball-guide.html`**：已 gitignore 的本機設計原型，
  change ② 已把 spec 改為「不得作為驗收條件」，維持在 workspace 內即可
