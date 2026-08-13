## Context

本 change 修的是「實作已落地、規格沒有提案紀錄」的流程漏洞，不是功能開發。
程式碼在 `0700d34` 已全部完成且測試全綠（本 change 撰寫時實跑 28 檔 161 測），因此**沒有任何一條 task 走 red-first**。
設計的重點只有兩個：MODIFIED 的基底該取哪一版，以及新契約該怎麼寫才不會變成實作日誌。

## TDD 分層判定（依 `openspec/config.yaml` 前端 TDD 範圍）

| 項目 | 分類 | 依據 |
|---|---|---|
| `openspec/specs/**` 的 spec 文字 | **例外層** | 非程式碼 |
| `nextjs-pickball/CLAUDE.md` | **例外層** | 純文件 |
| `components/guide/shared/PriceStars.tsx` | 行為邏輯，**但已完成** | `0700d34` 已含 `PriceStars.test.tsx`（4 個 it） |
| `data/guide/priceStars.test.ts` | 行為邏輯，**但已完成** | `0700d34` 已含（2 個 it） |

**本 change 沒有三步 TDD task。** 全部是例外層或 regression guard。

## 關鍵決策

### D1｜MODIFIED 的基底取「現行主規格全文」，不是「`0700d34` 之前的版本」

這是本 change 最容易寫錯的地方。兩種取法的差別：

- 取 `0700d34^` 的舊版 → archive 時會把 badge 文字**改回**「2025 完全入門指南」，直接推翻已上線的正確內容
- 取**現行版**（HEAD）→ archive 為 no-op，主 spec 內容不動，但 `changes/archive/` 從此能重播出現行主 spec

取現行版。本 change 的目的是**補紀錄**，不是改內容。

驗收方式因此也不同於一般 change：archive 後 `git diff openspec/specs/` **必須只出現 ADDED Requirement 那一段**。
若 MODIFIED 的兩條 Requirement 產生任何 diff，代表 delta 沒有逐字抄對現行主規格 —— 這是本 change 唯一的失敗模式，tasks.md 的 D2 專門守它。

### D2｜星級化寫成獨立的 ADDED Requirement，不塞進既有 Requirement

`priceStars` 橫跨三個資料檔（`brands`、`paddleMaterials`、`twMarketPrices`）、一個共用元件、以及一條跨檔守門規則。
若塞進「拆檔結構符合 components / data / hooks 三層」，它會被埋在檔案清單裡；
若塞進「首頁顯示完整匹克球指南」，它會和 TocBar 樣式混在一起。

獨立一條的另一個理由是**決策理由需要被記錄**：為什麼不寫金額？因為金額有時效性，會讓內容過期。
這個 why 屬於規格本文，不屬於 commit message —— 下一個想「順手加個參考售價」的人只會看規格。

### D3｜金額守門的掃描範圍跨出 capability 邊界，必須在 Requirement 內明寫

`data/guide/priceStars.test.ts:29-34` 的掃描目標是四個目錄：

```
data/guide、components/guide、components/guide/shared、app
```

`app/` 不屬於 `pickleball-guide-page` 的專屬領地（`app/layout.tsx`、`app/tour/`、`app/quiz/` 等歸其他 capability）。
一條 guide capability 的測試會因為別人在 `app/` 下寫 `NT$` 而變紅 —— 這種跨檔耦合**必須寫進規格**，否則對方只會看到一個沒頭沒尾的失敗。

先例：同一份 spec 的 tocItems 跨檔耦合守衛（`data/guide/tocItems.test.ts`）已是同樣寫法，
Scenario 內直接點名「改單邊即靜默失效的跨檔耦合，需有測試守住」。

正則以原文照抄：`/NT\$|US\$|NTD|TWD|USD/`。不要在規格裡寫「不得出現金額」這種模糊描述 ——
守門測試比對的是具體 pattern，規格與測試對不上就失去錨定意義。

### D4｜Scenario 全部錨定既有 it，且**禁止**為了湊 TDD 三步偽造紅燈

6 條 Scenario 對應的 6 個 it 全部已存在且全綠。合法的驗收方式只有「指令 EXIT=0」。
**不得**把 `>= 1` 改成 `>= 2` 看紅再改回 —— 那不是 TDD，是為了讓紀錄好看而說謊
（沿用 `2026-08-12-fix-guide-and-quiz-spec-drift/design.md` D-②-1 立下的規矩）。

### D5｜`CLAUDE.md` 改為與規格一致的存在式表述

`nextjs-pickball/CLAUDE.md:63` 寫「`shared/` 下 6 個共用元件」，實際 7 個（`ls` 實測：BrandCard、ComparisonTable、HighlightBox、MythRow、PriceStars、Section、TipCard）。

同一行的「頂層 16 個」仍正確，**不要動**。

修法與 `spec.md` 的「shared 目錄含全部必要共用元件」保持一致：列出元件名而非寫死數量。
理由與 `2026-08-12-fix-guide-and-quiz-spec-drift` 移除「恰好 N 個檔」的理由相同 ——
同目錄被多個 capability 共用時，數量斷言必然誤報。
