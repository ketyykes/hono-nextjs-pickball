## ADDED Requirements

### Requirement: 手動比分輸入的鍵盤送出與場地區分

每個場地的手動比分輸入 MUST 可由鍵盤獨立完成送出：在任一比分欄位按 Enter MUST 與點擊「送出比分」走**同一個**送出路徑，
以該場次識別與兩欄的**原始字串**委派回合 capability（與「手動輸入比分與送出」相同，UI SHALL NOT 自行驗證、SHALL NOT 先轉成數字）；
按 Enter SHALL NOT 造成頁面重新載入或導覽。已完成場次的比分欄位與送出按鈕為 disabled，按 Enter SHALL NOT 送出。

同一頁有多個場地時，比分控制項 MUST 可依場地區分：每個場地的兩個比分欄位與送出按鈕 MUST 包在同一個 `role="group"` 的容器內，
該群組的可存取名稱 MUST 為「第 N 場地比分」（N 為該場地的場地編號）。欄位與按鈕本身的可存取名稱 MUST 維持「第一隊比分」「第二隊比分」「送出比分」——
場地資訊由群組提供，SHALL NOT 改寫進個別控制項的名稱。

#### Scenario: 在比分欄位按 Enter 送出

- **GIVEN** 一場未完成的場次，id 為 `match-42`
- **WHEN** 在第一隊比分欄位輸入「11」、第二隊比分欄位輸入「7」，並在第二隊比分欄位按 Enter
- **THEN** 回合送出函式被呼叫恰好一次，參數為 `("match-42", "11", "7")`
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「在比分欄位按 Enter 會以場次識別與兩隊分數送出一次」

#### Scenario: 按 Enter 與按送出按鈕同樣原樣上傳空白欄位

- **GIVEN** 一場未完成的場次，id 為 `match-42`
- **WHEN** 只在第一隊比分欄位輸入「11」並在該欄位按 Enter
- **THEN** 回合送出函式以 `("match-42", "11", "")` 被呼叫一次——空白欄位傳原始空字串，是否拒絕交由回合 capability 判斷
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「只填一欄比分按 Enter 時與按送出按鈕同樣傳遞原始空字串」

#### Scenario: 已完成場次按 Enter 不送出

- **GIVEN** 一場已完成的場次
- **WHEN** 對其比分欄位觸發 Enter
- **THEN** 回合送出函式未被呼叫
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「已完成場次的比分欄位按 Enter 不會送出」

#### Scenario: 比分控制項包在以場地編號命名的群組內

- **GIVEN** 一場場地編號為 2 的場次
- **WHEN** 渲染該場地
- **THEN** 存在可存取名稱為「第 2 場地比分」的 group，且第一隊比分欄位、第二隊比分欄位與「送出比分」按鈕皆位於該 group 內；三者自身的可存取名稱維持「第一隊比分」「第二隊比分」「送出比分」
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「比分欄位與送出按鈕包在以場地編號命名的群組內」

#### Scenario: E2E 多場地時依場地群組定位並以 Enter 送出

- **GIVEN** 對戰頁有兩個場地的未完成場次
- **WHEN** 以可存取名稱「第 2 場地比分」的 group 定位，於其中填入「11」與「7」並在第二隊比分欄位按 Enter
- **THEN** 第 2 場地進入完成狀態（該 group 內的欄位與按鈕皆 disabled），第 1 場地的比分欄位仍可輸入
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「多場地時可依場地群組定位比分欄位並以 Enter 送出」
