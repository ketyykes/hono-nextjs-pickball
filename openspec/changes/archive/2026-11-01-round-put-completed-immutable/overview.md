# Overview: round-put-completed-immutable

## Scope

雲端的回合 PUT 目前只防止「把未完成的場次改成已完成」，卻允許「把已完成的場次改回未完成」，已送出比分的場次因此可能被重新計分。
本 change 在後端補上反向規則：目前回合中已完成的場次，只要它的 id 還出現在新資料中，就必須保持原樣。
為了不讓停在舊回合的裝置從 409 退化成 400，這條規則只在版本相符時檢查。

- **規模：small**——只影響 1 個 capability（`round-lifecycle`），tasks 共 10 個，沒有新依賴與架構變更，只改一個 repository 檔案。
- **前端需求：否**——前端一行不改；新規則只擋下前端從不送出的請求。
- **資料庫結構：否**——沒有 schema 或 migration 變更。
- **資料遷移：否**——不搬移、不轉換既有資料。
- **跨元件流程：是**——判定順序要看兩台裝置的操作先後（一台送出比分、另一台以舊版本 PUT），屬於順序敏感的多步互動，所以附上時序圖。

## What Changes

- 回合 PUT 加入反向規則：目前回合中 `completed` 的場次，若 id 出現在新資料，MUST 仍為 `completed` 且內容相同；不出現則允許（整輪替換、部分移除）。
- 反向規則只在「讀到的 version ＝ 請求的 version」時檢查；版本不符照舊由寫入判為 409。
- 違反時回 400 `INVALID_BODY`，不送 batch（回合、分槽、版本下限皆不變）。
- `hono-pickball/CLAUDE.md` 的判定順序段落改為三段式。

下圖對照雲端回合為 `[m1 pending, m2 completed]`（v1）時，各種 PUT 在修改前後的結果：

```
請求（目前 v1：m1 pending, m2 completed）       Before      After
----------------------------------------------  ----------  ----------
[m1, m2 completed 相同]            version 1    200         200
[m1, m2 改比分]                    version 1    400         400
[m1 completed, m2]                 version 1    400         400
[m1, m2 改回 pending]              version 1    200 (缺口)  400
[m1, m2 改為 scoring]              version 1    200 (缺口)  400
[m1, m2 相同, m2 pending] 重複 id  version 1    200 (缺口)  400
[m1 換人, m2 相同]                 version 1    200         200
[n1, n2] 整輪替換                  version 1    200         200
[m2 completed 相同, m3] 部分移除   version 1    200         200
[m1, m2 改回 pending]  (v2 時)     version 0/1/3 409       409 (不是 400)
```

## Sequence Diagram

下圖說明為什麼反向規則必須排在版本比對之後：裝置 B 送出比分後，裝置 A 仍以舊版本操作同一輪。

```
 裝置 A (停在 v1)           裝置 B                 後端 putRound / score
     │                        │                            │
     │                        │ POST /score m2 (v1)        │
     │                        │───────────────────────────►│ m2 completed
     │                        │◄───────────────────────────│ 200, 回合 v2
     │                        │                            │
     │ 換人 m1：PUT {m1', m2 pending, version 1}           │
     │────────────────────────────────────────────────────►│
     │                        │                            │ 1. 正向規則：通過
     │                        │                            │ 2. 讀到 v2 != 1
     │                        │                            │    → 跳過反向規則
     │                        │                            │ 3. batch：UPDATE
     │                        │                            │    WHERE version=1
     │                        │                            │    影響 0 列
     │◄────────────────────────────────────────────────────│ 409 VERSION_CONFLICT
     │ conflict → load(true)  │                            │
     │ 整份重新載入（v2）      │                            │
     │                        │                            │
     │ (若反向規則排在版本之前：步驟 2 會回 400 → rejected，
     │  A 不重新載入，之後每次操作都 400，卡住)
```
