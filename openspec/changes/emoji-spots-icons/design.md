# Design: emoji-spots-icons

## Context

`remove-emoji` 的 design Decision 3 判定測驗結果與獲勝對話框的 emoji 只是裝飾，直接刪除。使用者不同意：emoji 原本的位置要有圖示。國旗方面，使用者選擇保留 emoji，而不是改用國旗 SVG 套件、自繪國旗或 AI 生圖。

## Goals

- 每個原本是 emoji 的位置都有對應的圖示，沒有任何一處只剩純文字
- 國旗維持 emoji，守門測試不再把它當違規

## Non-Goals

- 不改其他五處已換好的圖示（navbar、結論卡、迷思列、價位星、橫向提示）
- 不改配色、字型、版面；不新增 npm 相依
- 不使用 AI 產生的點陣圖

## Decisions

### Decision 1: 測驗結果與獲勝對話框用 lucide 圖示

**Choice**: `ResultScreen` 依分數區間回傳 `{ text, Icon }`：≥80% `Trophy`、≥50% `BicepsFlexed`、其餘 `BookOpen`，圖示放在句尾（原本 emoji 的位置），`size-5`，顏色沿用段落文字色。`GameOverDialog` 標題前放 `Trophy`（原本 🏆 在標題開頭），`size-5`；標題改為 flex 對齊時要維持 `DialogHeader` 原本「手機置中、sm 以上靠左」的對齊。

**Rationale**: 獎盃、手臂、書本都是通用圖形，lucide 已有且專案按鈕圖示本來就用 lucide（`remove-emoji` design Decision 2 的原則）；跟著文字色走，配色不變。

**Alternatives considered**:
- 自繪 SVG：通用圖形自己畫沒有比 lucide 好，只是多維護三個元件
- AI 生圖：點陣圖不跟文字色、檔案較大；這兩處是小圖示，不需要插畫

### Decision 2: 國旗保留 emoji，守門以「成對區域指示符號」判定例外

**Choice**: `brands.ts` 以 `git checkout main -- nextjs-pickball/data/guide/brands.ts` 還原原文。守門的掃描函式在套用 pattern 前先移除 `/[\u{1F1E6}-\u{1F1FF}]{2}/gu`（國旗序列），落單的區域指示符號仍會被 `\p{Emoji_Presentation}` 攔下。

**Rationale**: 國旗是品牌產地的資訊本身，使用者選擇保留 emoji。只放行「成對」的序列，避免把例外開得太寬。

**Alternatives considered**:
- 國旗 SVG 套件（如 country-flag-icons）：需要新增相依，使用者未選
- 把 `data/` 整個排除在掃描外：會連帶放行資料檔裡其他 emoji，範圍太寬

## Risks / Trade-offs

- [Risk] Windows 的系統字型不支援國旗 emoji，會顯示成兩個字母（如「US」） → Mitigation：這是 `main` 原本就有的行為，使用者已選擇保留 emoji；記錄為已知限制
- [Risk] `GameOverDialog` 標題改成 flex 後，手機寬度下的置中對齊跑掉 → Mitigation：以 `justify-center sm:justify-start` 對齊 `DialogHeader` 的 `text-center sm:text-left`，並以截圖確認

## Migration Plan

純前端呈現變更。併入 `main` 並推送後由 Workers Builds 自動部署；回滾為 revert。

## Open Questions

（無）
