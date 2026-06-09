# nextjs-pickball

匹克球新手完全入門：規則與球拍選購一次搞懂。Next.js 16 App Router + React 19 + Tailwind v4 + shadcn/ui 打造的單頁指南。

## 技術棧

- Next.js 16 (App Router)
- React 19
- TypeScript（strict、verbatimModuleSyntax）
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- shadcn/ui（new-york 風格、slate base color）
- Vitest 4 + happy-dom + @testing-library/react（單元測試）
- Playwright（E2E，五個 browser project）
- pnpm（套件管理）
- OpenSpec（spec-driven TDD 治理）

## 快速開始

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev        # http://localhost:3000
```

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `pnpm dev` | 啟動開發伺服器 |
| `pnpm build` | 正式建置 |
| `pnpm start` | 執行正式建置產物 |
| `pnpm lint` | ESLint 檢查 |
| `pnpm test` | Vitest watch 模式 |
| `pnpm test:coverage` | v8 覆蓋率報告 |
| `pnpm test:e2e` | Playwright E2E |

## 專案結構

```
app/              # Next.js App Router 進入點
├── layout.tsx    # Root Layout（含 next/font/google 三家族）
├── page.tsx      # 首頁（/）
└── globals.css   # Tailwind + 自訂 keyframes + OKLCH 主題

components/
├── ui/           # shadcn/ui 元件（8 個）
└── guide/        # 指南專用元件（Hero、TocBar、11 個 Section、shared/）

hooks/            # 4 支 scroll/observer hooks + tests
lib/utils.ts      # cn() = clsx + tailwind-merge
data/guide/       # 7 個 TS 資料檔
tests/            # Vitest setup 與 Playwright E2E
docs/             # 設計原型（pickleball-guide.html）
openspec/         # 規格驅動流程檔

legacy-react-pickball/  # 原 Vite 版本保留為對照組（驗證完成後可刪除）
```

## 開發指引

專案採 OpenSpec spec-driven TDD。新增功能前請參考 `openspec/specs/` 與 `CLAUDE.md`。
