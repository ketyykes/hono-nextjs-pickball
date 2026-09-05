# Specification: match-stage

## MODIFIED Requirements

### Requirement: 手動輸入比分與送出

每個未完成場次 MUST 提供兩個比分欄位（分別對應第一隊與第二隊）與一個送出控制
（`prd.md` 6.3）。手動輸入是 `prd.md` 6.3 明訂**不得移除**的 fallback，MUST 能獨立完成一場，
SHALL NOT 依賴場邊計分路徑存在。

比分欄位 MUST 設定 `inputMode="numeric"` 以在行動裝置喚起數字鍵盤（`prd.md` 12.3）。

送出 MUST 委派回合 capability 的送出 pipeline（記錄最終比分 → 更新評分 → 寫入歷史），
SHALL NOT 在 UI 層自行更新任何評分或歷史資料。比分驗證規則（空白、非數字、平局、場次已完成）
歸屬回合 capability，UI SHALL NOT 複製一份——**含「兩隊比分相同是否可送出」這條規則本身**：
計時回合（`round.timer !== null`）下兩隊比分相同 MUST 被 pipeline 接受為平局，非計時回合維持
拒絕，UI 元件 SHALL NOT 依 `round.timer` 自行攔截或另外判斷，一律把欄位原樣往上傳、讓
`round-lifecycle` 的 `validateScoreInput` 決定是否接受（見該 capability 的「比分驗證」）。
UI 的責任是把 pipeline 回傳的驗證失敗以**繁體中文**呈現在該場次區塊內，並帶 `role="alert"`
使讀屏能即時播報（`prd.md` 6.3.2、第 11 節、12.5）；非計時回合的平局拒絕訊息 MUST 明確指出
「非計時回合不得送出平局」，不得只顯示「無法判定勝方」這類未區分原因的舊文案。

已完成場次的比分欄位與送出控制 MUST 為 `disabled`，使同一份比分無法再次送出
（`prd.md` 6.5）。

#### Scenario: 比分欄位喚起數字鍵盤

- **WHEN** 渲染一場未完成的對戰
- **THEN** 兩個比分欄位皆帶 `inputMode="numeric"`，且各有可讀的標籤或 `aria-label` 指出屬於哪一隊
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「比分欄位為 inputMode numeric 並標示所屬隊伍」

#### Scenario: 送出委派回合 capability

- **WHEN** 於某場次填入 11 與 7 後按下送出
- **THEN** 回合 capability 的送出函式被呼叫一次，帶入該場次識別與兩隊分數
- **AND** UI 自身不呼叫任何評分或歷史寫入函式
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「送出比分會以場次識別與兩隊分數呼叫回合送出函式一次」

#### Scenario: 驗證失敗以繁體中文呈現

- **WHEN** 送出 pipeline 回傳驗證失敗（欄位空白、非數字或平局）
- **THEN** 該場次區塊內出現 `role="alert"` 的繁體中文訊息，說明原因與可採取的修正方式
- **AND** 訊息不含未經轉譯的技術錯誤碼
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「送出失敗時於該場次以 role alert 顯示繁體中文錯誤訊息」

#### Scenario: 已完成場次不可再送出

- **WHEN** 場次狀態為已完成
- **THEN** 兩個比分欄位與送出控制皆帶 `disabled` 屬性
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「已完成場次的比分欄位與送出按鈕皆為 disabled」

#### Scenario: 兩隊比分相同時 UI 仍照常委派送出不自行攔截

- **WHEN** 於某場次的兩個比分欄位皆填入 `11` 後按下送出（不論本回合是否為計時制）
- **THEN** 回合 capability 的送出函式仍被呼叫一次，帶入該場次識別與兩隊相同的分數
- **AND** UI 自身不因兩隊比分相同而提前阻擋送出或另外顯示錯誤
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「兩隊比分相同時 UI 仍照常委派送出而不自行攔截」

---

### Requirement: 完成場次的視覺與資訊

已完成的場次 MUST 以**半透明、低飽和度**樣式呈現，與未完成場次形成明顯區隔
（`prd.md` 6.5）。該樣式 MUST 由 `nextjs-pickball/lib/matchmaker/tile-style.ts` 的純函式
推導，SHALL NOT 散落在各元件的 class 字串裡。

已完成場次 MUST 顯示最終比分、勝方與完成時間。勝方 MUST 以**文字標籤**標示（例如「勝」），
SHALL NOT 僅以顏色或飽和度差異表達——色彩不得作為唯一資訊來源（`prd.md` 12.5）。

平局場次（`match.winner === "draw"`，僅計時回合可能出現）MUST NOT 為任一隊顯示「勝」文字
標籤，MUST 改顯示可判讀的「平手」文字標籤，理由與上一段相同——色彩（若有）不得為唯一資訊
來源，且顯示任一隊「勝」會誤導使用者以為該隊真的獲勝。

#### Scenario: 完成場次為半透明低飽和

- **WHEN** 以 `completed: true` 呼叫色塊樣式函式
- **THEN** 回傳的樣式相對未完成版本降低了不透明度並降低了飽和度
- **AND** `completed: false` 時不帶這兩項減弱
- **驗收**：`nextjs-pickball/lib/matchmaker/tile-style.test.ts`，it 名稱「已完成場次的色塊樣式降低不透明度與飽和度」

#### Scenario: 完成場次顯示比分勝方與時間

- **WHEN** 渲染一場已完成、比分 11:7、第一隊獲勝的對戰
- **THEN** 顯示 11 與 7 兩個分數、勝方所屬隊伍，以及該場次的完成時間
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「已完成場次顯示最終比分勝方與完成時間」

#### Scenario: 勝方以文字標示

- **WHEN** 渲染一場已完成的對戰
- **THEN** 勝方隊伍帶有可讀的文字標籤，非勝方沒有該標籤
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「勝方以文字標籤標示而非僅以顏色區分」

#### Scenario: 平局場次不顯示任一隊勝方標籤而顯示平手標籤

- **WHEN** 渲染一場已完成、比分 11:11、`winner` 為 `"draw"` 的對戰
- **THEN** 第一隊與第二隊皆不出現「勝」文字標籤
- **AND** 畫面另外顯示可判讀的「平手」文字標籤
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「平局場次不顯示任一隊勝方標籤而顯示平手標籤」
