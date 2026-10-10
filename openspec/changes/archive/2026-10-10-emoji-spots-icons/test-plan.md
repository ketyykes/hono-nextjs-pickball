# Test Plan: emoji-spots-icons

## emoji-free-ui

### Requirement: 介面文字不含 emoji，國旗除外

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `國旗 emoji 不視為違規，落單的區域指示符號仍會被攔下` | 國旗 emoji 不視為違規 | 片段第 1 行字串 `"🇺🇸 美國・加州"`、第 2 行 JSX 文字 `🇹🇼 台灣本土品牌`、第 3 行字串只含一個區域指示符號 → `[3]`（目前回傳 `[1, 2, 3]`，真紅燈） | 使用者指示的新例外 | unit |
| `品牌產地以國旗 emoji 加國家或地區名稱開頭` | 品牌產地保留國旗 emoji | 每筆 `origin` 符合 `/^[\u{1F1E6}-\u{1F1FF}]{2} (美國\|德國\|奧地利\|台灣)/u`（目前無國旗，真紅燈；取代舊 it「品牌產地不含國旗且以國家或地區名稱開頭」） | 資料還原的直接驗收 | unit |
| `app、components、data、lib、hooks 的介面文字不含 emoji 或 emoji 類符號` | 介面文字掃描無 emoji | 既有測試；國旗還原後仍為 `[]`（regression guard，驗證例外生效） | regression guard | unit |
| `註解中的 emoji 不視為違規`、`字串、樣板字串與 JSX 文字中的 emoji 會被攔下` | 同名 Scenario | 既有測試照舊（regression guard） | regression guard | unit |

### Requirement: emoji 所在位置改以圖示呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `三個分數區間的鼓勵文字各搭配對應的 lucide 圖示` | 測驗結果鼓勵文字搭配對應圖示 | 答對 9／6／2（共 10）→ 三句文字精確比對，同段落 svg 的 class 依序含 `lucide-trophy`、`lucide-biceps-flexed`、`lucide-book-open`（目前無 svg，真紅燈；取代舊 it「三個分數區間的鼓勵文字皆為純文字」） | golden path | unit |
| `獲勝標題以 lucide 獎盃圖示搭配勝方文字` | 比賽結束對話框標題搭配獎盃圖示 | `finished`＋勝方 us → 標題 textContent === 「我方獲勝」，且內含 class 含 `lucide-trophy` 的 svg（目前無 svg，真紅燈；取代舊 it「獲勝標題為純文字不含獎盃 emoji」） | golden path | unit |
| navbar、結論卡、迷思列、價位星、橫向提示的 5 條既有測試 | 同名 Scenario | 既有測試照舊（regression guard） | regression guard | unit |

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names use imperative form (avoid `test_1`, `it_works`)
