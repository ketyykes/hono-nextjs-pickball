## Context

本 change 是 8 個之中最小的一個：三份 spec、零程式碼、零測試。
但它有一個容易被做錯的地方，值得寫下來。

## TDD 分層判定

**全數例外層。零程式碼變更，因此無任何 TDD 適用對象。**
驗收方式為 `openspec validate` 與「spec 敘述是否與 `ls app/` 的實際狀態一致」。

## 關鍵決策

### D-⑥b-1｜規格不得描述未實作的產物

`tour-experience/spec.md:146` 的「sitemap 不給高 priority」是一句**懸空敘述** ——
它假設 sitemap 存在，但 `app/` 下沒有 `sitemap.ts` 也沒有 `robots.ts`。

這類敘述比「規格過時」更麻煩：過時的敘述至少指向一個存在過的東西，
懸空敘述指向的是從未存在的東西，讀者會花時間去找一個找不到的設定。

修法有兩種：
- (A) 改措辭，把它變成條件式（「若日後新增」）
- (B) 真的新增 `app/sitemap.ts`

採 **A**（決策 D4）。理由見下。

### D-⑥b-2｜新增 sitemap 是產品決策，不是規格債

要不要讓搜尋引擎索引、索引哪些路由、priority 怎麼配，這些是**產品層面的取捨**，
需要考慮內容策略與流量目標。把它夾帶在「清理規格債」的 change 裡，
等於用技術債的名義做產品決定。

本批 8 個 change 的共同目標是**讓規格與現實一致**，不是擴充功能。
一旦破例，「順便加個功能」就會變成常態。

未來要做時，`app/sitemap.ts` 有導出邏輯、屬 `app/**` 的行為模組，需走三步 TDD。

### D-⑥b-3｜追認既有 metadata 時必須同時寫下「不得 noindex」

`/quiz` 與 `/scoreboard` 的 metadata 已存在且正確，補 spec 只是追認。
但這裡有個真實風險：change ⑤ 剛為 `/health` 加了 `robots: { index: false }`。

如果只寫「這兩個路由有 metadata」而不寫「不得設 noindex」，
日後很容易有人看到 `/health` 的寫法之後「順手統一」，把公開內容頁一起 noindex 掉 ——
這種錯誤不會有任何測試或型別檢查擋下，而且要等到搜尋排名掉了才會被發現。

因此兩條新 Requirement 都明寫「公開內容頁，SHALL NOT 設定 `robots.index: false`」，
並註明 noindex 只適用於 `/health` 這類內部診斷路由。
這是**規格能擋、測試擋不了**的那類錯誤，正是規格存在的價值。

## 不做的事

- **不建 `app/quiz/page.test.ts` 與 `app/scoreboard/page.test.ts`**：
  metadata 已存在，寫測試會直接綠燈。這種 characterization test 不是不能寫，
  而是此刻投報比低 —— 兩個常數物件被誤刪的機率遠低於邏輯被改壞。
  等 spec 新增尚未實作的 metadata 欄位（`openGraph` / `canonical`）時才有真紅燈可寫
- **不動 root `layout.tsx` 的預設 metadata**：現況正確，且它屬於全站而非任一 capability，
  要規格化需要一個新的 capability，超出本 change 範圍
