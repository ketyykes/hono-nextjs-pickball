---
name: matchmaker-allocation-engine-tdd-pattern
description: matchmaker-allocation-engine change 的批次進度、「regression guard 紅燈」記錄慣例、tie-fixture 退化陷阱、以及用手算＋scratch 腳本設計 avoidRepeats fixture 的方法
type: project
---

## 現況（2026-08-17，commit ad1db49，branch feat/matchmaker-allocation-engine）

`openspec/changes/matchmaker-allocation-engine/tasks.md` §1～§14 全數完成（型別骨架 → candidates →
pairing → duplication → `allocateRound` 入口與整體優先序保證 → §10 邊界條件 → §11 跨批次缺口
A/B/C → §12 第 3 批 review 追加項 D1-D5 → §13 收尾驗證 → §14 第 6 批 review 修正 M1～M7）。
§13.7（`openspec validate --strict`）留給主 agent 執行，其餘皆已完成。33 個 spec 驗收錨點全數
對上（腳本機械比對，見下）。lib/matchmaker/ 測試數 73 → 74（§14.M7 新增 1 個真紅燈測試）。

### §14（M1～M7）新增：`lib/matchmaker/rating-math.ts`

`pairing.ts` 的 `buildTeam` 與 `duplication.ts` 的 `rebuildMatch` 原本各自維護一行
`Math.round(sum * 100) / 100`（11.B.3 記錄的技術債），已抽成 `roundRating(value)`，放獨立新檔
（不放 `allocation-types.ts`——該檔明訂純型別無執行期邏輯；`duplication.ts` 不 import
`pairing.ts`，兩者改共同依賴 `rating-math.ts`，維持單向依賴 design Decision 1）。下次若在
`lib/matchmaker/` 見到內聯的 `Math.round(x * 100) / 100`，先檢查是否該改用這個共用函式。

**這是整個 change 唯一一批出現真紅燈的小節**：§10.1 的五個邊界 it 中，四個（單打/雙打人數
不足、全員暫停、空名單）是既有子模組保證透過 `allocateRound` 曝光的 regression guard（加入
當下立即全綠），只有「場地數超出 1～8 時拒絕輸入而非靜默夾值」是傳統紅燈——因為
`allocateRound` 在此之前完全沒做範圍檢查。實測：15 tests 中 1 failed / 14 passed（紅），
實作 `assertValidCourtCount` 後 15 passed（綠）。

## 跨批次缺口修補（A/B/C）與第 3 批 review 追加項（D1-D5）都在同一個 commit 完成

第 4 批 code review 記錄了兩個跨批次缺口（doublesComposition 換人後未重算、rebuildMatch 未
四捨五入），第 3 批 code review 追加了 D1-D5（補記紅燈證據、修正假的浮點防護測試、補
`avoidRepeats` 的 `<=` 判準與雙打階段②測試覆蓋、countRepeats 計數語意 JSDoc）。主 agent 在
下達 §10 任務的過程中途插入這些追加要求，**全部在同一個 commit `e72c252` 一併處理**，沒有
另開分支——這是主 agent 明確指示的（"請在你目前的工作完成後、同一個 commit 或緊接的第二個
commit內一併處理，不要另開分支"）。

## 設計 avoidRepeats 的 doubles fixture：手算會出錯，務必用 scratch 腳本驗證

`avoidRepeats` 的三階段貪婪試探（跨場地換人→隊內換隊友→相鄰強度重排）對雙打的候選枚舉順序
複雜到手算極易出錯（曾經手算「p1 vs p2 對手重複」該用哪個玩家當「便宜」的替換對象，算出
`spread` 不會增加，結果實際跑出來完全不是那組——因為忽略了某個更早的候選會先被嘗試並接受）。

**可靠做法**：在 `lib/matchmaker/` 下建一個 `_scratch.test.ts`（不納入 commit，用完即刪），
直接呼叫 `pairDoubles`／`avoidRepeats`／`countRepeats`／`ratingSpread`，用
`throw new Error(JSON.stringify(...))` 把中間結果印出來（vitest 預設吃掉 `console.log`，
但會完整顯示 `throw` 的訊息）。反覆調整 rating／gender 直到觀察到預期行為，再把驗證過的
數字寫進正式測試。**不要跳過這一步直接手算後寫測試**——第 4 批遺留的 review 已經指出好幾個
「手算出來看似合理但實測不成立」的案例。

驗證過的可重用 fixture 家族（item A：doublesComposition 重算 / item B：rebuildMatch 四捨五入
/ D4：avoidRepeats 階段②）：
- 8 人雙打分兩場，court1 全員同性別（4 人 rating 緊鄰、如 8.0/7.9/7.0/6.9），court2 全員另一
  性別但**最低位的球員與 court1 最低位「精確同分」**（如都是 6.9）。歷史紀錄用「填充球員」
  孤立出 court1 兩個相鄰位置球員（如第 3、4 名）之間的**交叉對手**重複（不要用完整隊伍重複，
  雙打的貪婪法對完整隊伍重複束手無策，見下方已知盲點）。因為分數精確相等，任何涉及這兩人的
  跨場地互換都會讓 spread **完全不變**（非只是不增加），是最可預測、最容易手算驗證的組合。
- 若要專門測 `avoidRepeats` 階段②（隊內換隊友），**只放一個場地**（`crossCourtSwapCandidates`
  需要至少兩個場次才有候選，單場自然把階段①關閉），並用**精確斷言重建後的隊伍組成**
  （而非只斷言「重複數下降」）——因為即使停用階段②，階段③（相鄰強度重排）在單場 2v2 的
  結構下**必然**存在至少一個跨隊伍的相鄰候選（4 人分兩隊排序後，組間邊界必產生跨隊相鄰對），
  用「重複數下降」當斷言時 mutation test（停用階段②）不會被抓到，只有精確斷言隊伍組成
  才能證明是階段②而非階段③在起作用（已實測：全員同分 5.0 時，階段②的候選順序產生
  `team0=[c,b],team1=[a,d]`，階段③的候選順序產生不同的 `[a,c]/[b,d]`）。

## `countRepeats` 與 doubles 的已知盲點（design 明文取捨，非 bug）

`countRepeats` 回傳的是「有命中的場次數」而非「命中次數」。貪婪法對「完全重複的雙打場次」
束手無策：單次交換只能拆掉一支隊伍，另一支隊伍的 teammate key 仍命中，場次數不變，嚴格
`repeats < current.repeats` 判準全數回退——即使場上存在能讓 repeats/spread 同時歸零的其他
重排方式也找不到。已記錄於 `duplication.ts` 的 `countRepeats` JSDoc、
`openspec/changes/matchmaker-allocation-engine/design.md` 的 Risks、以及本檔上一版。
**設計 fixture 時要避開「完整隊伍重複」，改用「交叉對手重複」或「隊友重複」單一類型**，
否則貪婪法可能完全不會觸發任何交換，fixture 會失敗。

## 「regression guard 紅燈」慣例（本 change 反覆出現，§8/§9/§10 皆有）

多個 🔴 步驟在**加入測試的當下就直接全綠**，不是傳統意義的紅燈——因為子模組在前面批次已各自
驗證為純函式、不修改輸入，後續步驟只是組合它們，行為透過組合自然成立。

**處理方式**（CLAUDE.md「紅燈要是真的」條款的具體落地）：
1. 仍然照做——先寫測試、跑一次 shell、貼出輸出，即使輸出是綠燈也貼。
2. **不得**用 mutation check（先改斷言故意失敗、截圖、再改回）偽造紅燈。
3. 在 tasks.md 對應小節開頭寫一段 ⚠️ 說明區塊，寫清楚為什麼這是必然結果、唯一的「真」紅燈是什麼。

D2/D3/D4/misc.2 這類「修正既有測試假紅燈」或「補測試 pin 住既有正確行為」的項目，正確流程是
**mutation test**：先確認新 fixture 在原始碼下綠燈，再刻意注入退化（拿掉某行防護／改鬆某個
判準）觀察紅燈，最後還原確認綠燈——三段輸出都要貼，這與「偽造紅燈」（改斷言）不同，是驗證
fixture 真的有偵測力，非常值得在類似任務中沿用。

## 測試檔慣例（每個 `lib/matchmaker/*.test.ts` 共通）

每個測試檔都**故意重複定義**自己的 `makePlayer(overrides)` 建構器（不共用 helper 檔），
理由是保持測試檔彼此獨立。新開 `lib/matchmaker/` 測試檔時比照這個慣例，不要抽共用檔案。

## Tie-fixture 退化陷阱：全相異／全相等的 fixture 測不到「相等分支」（§14 M1/M2/M4 同一根因）

第 6 批 review 一口氣抓到三個獨立測試（M1、M2、M4）犯同一種錯：comparator 是多層 fallback
（`restCount` 不等時決勝負 → 不等時比 `rating` → 都相等時走穩定排序／tiebreak），但 fixture
選的數值讓資料**永遠不會走到「都相等」那一分支**，導致「相等分支該有的行為」完全沒被驗證到：

- M1（`allocation.test.ts`）：5 人 rating 全相異，`compareCandidates` 的相等分支從未執行，
  若有人手滑加了 `gender` tiebreak（真實會發生的「求確定性」誤植）測不到。
- M2（`allocation.test.ts`）：8 人 rating 全相異，`restCount` 雖有 tie 但 rating 不等時
  comparator 提早返回，穩定排序分支（`Array.sort` 對相等元素保留原順序）從未行使，comparator
  的相等分支若返回 `Math.random()` 也測不到。
- M4（`candidates.test.ts`）：fixture 全部相等（`restCount`／`rating` 皆同）—— 這次是反過來，
  刻意的「全相等」剛好讓「排序後陣列內容順序」這個唯讀斷言**恆真**（穩定排序對全相等輸入，
  原地排序與複製後排序的內容順序永遠一樣），實測拿掉 `sortCandidates` 的 `.slice()` 依然全綠。

**通用檢查法**：寫「相等時如何 tiebreak／保序」的測試前，先問「這個 fixture 真的會讓 comparator
走到我要測的那個分支嗎？」——用具體數值在腦中（或用 `_scratch.test.ts`）跑一次 comparator 的
判斷路徑，不要只看「有沒有 tie」。

**唯讀不變式的更穩健寫法**：當 spec 的 WHEN 條件強制要求「全相等」（如 M4 那個錨點），無法換
fixture 讓內容順序改變時，改用**參照相等檢查** `expect(sorted).not.toBe(players)` 而非比較
`.map(id)` 內容——`slice()` 保證回傳新陣列、原地 `.sort()` 保證回傳同一參照，這個斷言與資料是
否全相等無關，任何 fixture 下都能抓到「忘記複製」的 mutation。比只比對內容順序更可靠。

## 尚未處理的技術債

（原 `Math.round(sum*100)/100` 重複的技術債已於 §14 M6 解決，見上方「§14 新增」一節，
`buildTeam`／`rebuildMatch` 均已改用 `rating-math.ts` 的 `roundRating`。）
