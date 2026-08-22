# 多頁式內容深化 Phase A Implementation Plan

> ⚠️ 本檔為歷史紀錄，指令原文刻意保留未改。
> 文中 `pnpm ... test -- --run <path>` 已知失效：那個 `--` 會讓 vitest 收不到路徑而跑完整套，
> 紅燈證據會被既有綠燈淹沒。正確寫法為 `pnpm --filter ./<workspace> test --run <path>`，
> 見 root `CLAUDE.md` 的「常用指令」節（原載於 `openspec/config.yaml`，該檔已只放 openspec
> workflow schema 與輸出語言設定）。（change: fix-tdd-toolchain-and-config → sync-doc-drift-and-guard-hooks-inventory）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把既有單頁指南拆為五主題分頁（`/learn`、`/rules`、`/equipment`、`/skills`、`/play`），同時把球拍價格全面改為低/中/高 Badge 分級。Phase B（互動深化）與 Phase C（`/skills` 進階戰術內容）另外規劃。

**Architecture:** 以 Next.js App Router 路由為頁面分界，每個主題頁是一個 server component page 拼裝既有 client `<Section>` 元件；既有 `SiteNavbar` 升級為列五主題並支援 mobile hamburger；新增 `PriceTier` 純函式判定 + `PriceTierBadge` 共用 UI 元件取代既有零散價格字串；用 client-side `HashRedirector` 把舊 hash 深連結導到新頁。所有變動逐 Task 提交 commit，每個 Task 自帶測試。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript（strict + verbatimModuleSyntax）、Tailwind CSS v4、shadcn/ui（Badge、Sheet）、Vitest + happy-dom + @testing-library/react、Playwright

---

## 檔案總覽

| 操作 | 路徑 | 用途 |
| --- | --- | --- |
| 新增 | `data/guide/priceTier.ts` | `PriceTier` 型別、門檻常數、`priceRangeToTier()` helper |
| 新增 | `data/guide/priceTier.test.ts` | helper 邊界值測試 |
| 新增 | `components/guide/shared/PriceTierBadge.tsx` | 顯示用 Badge 元件 |
| 新增 | `components/guide/shared/PriceTierBadge.test.tsx` | Badge 文字 / 樣式 / a11y 測試 |
| 修改 | `data/guide/brands.ts` | schema 改為 `priceTier` + `rawPriceRangeTwd` + `lastVerified` |
| 修改 | `data/guide/twMarketPrices.ts` | schema 改為 `priceTier` + `category` |
| 修改 | `components/guide/shared/BrandCard.tsx` | 顯示 `PriceTierBadge` 取代字串 |
| 修改 | `components/guide/TwMarketSection.tsx` | 改名「市場價格分級」、表格使用 Badge |
| 修改 | `components/guide/Conclusion.tsx` | 移除嵌入價格字串、改述敘述 |
| 修改 | `components/layout/SiteNavbar.tsx` | NAV_LINKS 改為五主題 + mobile hamburger |
| 修改 | `components/layout/SiteNavbar.test.tsx`（若無則新增） | 五主題 active 高亮 + hamburger 行為 |
| 新增 | `components/layout/HashRedirector.tsx` | client-side 偵測舊 hash 並 redirect |
| 新增 | `components/layout/HashRedirector.test.tsx` | hash → path map 命中測試 |
| 新增 | `components/layout/SiteFooter.tsx` | 五主題 sitemap + 版本資訊 |
| 新增 | `components/site/HomeTopicCard.tsx` | Landing 三張主題入口卡 |
| 修改 | `app/layout.tsx` | 加入 `SiteFooter` 與 `HashRedirector` |
| 修改 | `app/page.tsx` | Landing：Hero + 主題卡 + 簡化 Conclusion |
| 新增 | `app/learn/page.tsx` | `/learn` 新手必讀 |
| 新增 | `app/rules/page.tsx` | `/rules` 規則速查 |
| 新增 | `app/equipment/page.tsx` | `/equipment` 球拍選購 |
| 新增 | `app/skills/page.tsx` | `/skills` 佔位「即將推出」 |
| 新增 | `app/play/page.tsx` | `/play` Hub |
| 修改 | `components/guide/TocBar.tsx` | 改為接 `items` props，作為頁內目錄重用 |
| 修改 | `components/guide/TocBar.test.tsx`（若無則新增） | items props 行為測試 |
| 修改 | `data/guide/tocItems.ts` | 拆為 `rulesTocItems`、`equipmentTocItems` |
| 新增 | `tests/e2e/specs/multipage.spec.ts` | 五主題頁可進入、hash redirect、既有功能不退化 |
| 修改 | `openspec/specs/site-navbar/spec.md` | 同步五主題連結需求（OpenSpec change） |

---

## Mini-Sprint 1：價格分級資料模型 + Badge（Tasks 1–4）

目標：建立 `PriceTier` 純函式基礎與 `PriceTierBadge`，把既有資料 schema 與 UI 全部切換到新模型。完成後既有單頁仍能跑，但價格欄已全面 Badge 化。

---

### Task 1：建立 `PriceTier` 型別與 helper

**Files:**
- Create: `data/guide/priceTier.ts`
- Test: `data/guide/priceTier.test.ts`

- [ ] **Step 1：先寫 failing 測試**

Create `data/guide/priceTier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	PRICE_TIER_LABEL,
	PRICE_TIER_THRESHOLD_TWD,
	priceRangeToTier,
	type PriceTier,
} from "./priceTier";

describe("priceTier", () => {
	it("PRICE_TIER_THRESHOLD_TWD 為已知門檻", () => {
		expect(PRICE_TIER_THRESHOLD_TWD.lowMaxExclusive).toBe(2000);
		expect(PRICE_TIER_THRESHOLD_TWD.midMaxInclusive).toBe(6000);
	});

	it("PRICE_TIER_LABEL 提供三組中文標籤", () => {
		const labels: Record<PriceTier, string> = PRICE_TIER_LABEL;
		expect(labels.low).toBe("入門價位");
		expect(labels.mid).toBe("中階價位");
		expect(labels.high).toBe("高階價位");
	});

	it("priceRangeToTier 依下限判定 low", () => {
		expect(priceRangeToTier([320, 800])).toBe("low");
		expect(priceRangeToTier([1500, 3000])).toBe("low");
		expect(priceRangeToTier([1999, 5000])).toBe("low");
	});

	it("priceRangeToTier 依下限判定 mid", () => {
		expect(priceRangeToTier([2000, 3000])).toBe("mid");
		expect(priceRangeToTier([5000, 8000])).toBe("mid");
		expect(priceRangeToTier([6000, 10000])).toBe("mid");
	});

	it("priceRangeToTier 依下限判定 high", () => {
		expect(priceRangeToTier([6001, 7000])).toBe("high");
		expect(priceRangeToTier([8000, 15000])).toBe("high");
	});

	it("priceRangeToTier 對非法輸入丟錯", () => {
		expect(() => priceRangeToTier([100, 50])).toThrow(/min.*max/);
		expect(() => priceRangeToTier([-10, 500])).toThrow(/non-negative/);
	});
});
```

- [ ] **Step 2：跑測試確認 FAIL**

Run: `pnpm test -- --run data/guide/priceTier.test.ts`
Expected: FAIL — 找不到 `./priceTier` 模組。

- [ ] **Step 3：寫最小實作**

Create `data/guide/priceTier.ts`:

```ts
export type PriceTier = "low" | "mid" | "high";

export const PRICE_TIER_THRESHOLD_TWD = {
	lowMaxExclusive: 2000,
	midMaxInclusive: 6000,
} as const;

export const PRICE_TIER_LABEL: Record<PriceTier, string> = {
	low: "入門價位",
	mid: "中階價位",
	high: "高階價位",
};

export function priceRangeToTier(range: readonly [number, number]): PriceTier {
	const [min, max] = range;
	if (min < 0 || max < 0) {
		throw new Error("priceRangeToTier: range must be non-negative");
	}
	if (min > max) {
		throw new Error("priceRangeToTier: min must be <= max");
	}
	if (min < PRICE_TIER_THRESHOLD_TWD.lowMaxExclusive) return "low";
	if (min <= PRICE_TIER_THRESHOLD_TWD.midMaxInclusive) return "mid";
	return "high";
}
```

- [ ] **Step 4：跑測試確認 PASS**

Run: `pnpm test -- --run data/guide/priceTier.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5：型別檢查 & lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 無錯誤

- [ ] **Step 6：commit**

```bash
git add data/guide/priceTier.ts data/guide/priceTier.test.ts
git commit -m "feat(guide): 新增 PriceTier 型別與 priceRangeToTier helper"
```

---

### Task 2：`PriceTierBadge` 共用元件

**Files:**
- Create: `components/guide/shared/PriceTierBadge.tsx`
- Test: `components/guide/shared/PriceTierBadge.test.tsx`

- [ ] **Step 1：先寫 failing 測試**

Create `components/guide/shared/PriceTierBadge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceTierBadge } from "./PriceTierBadge";

describe("PriceTierBadge", () => {
	it("low tier 顯示「入門價位」", () => {
		render(<PriceTierBadge tier="low" />);
		expect(screen.getByText("入門價位")).toBeDefined();
	});

	it("mid tier 顯示「中階價位」", () => {
		render(<PriceTierBadge tier="mid" />);
		expect(screen.getByText("中階價位")).toBeDefined();
	});

	it("high tier 顯示「高階價位」", () => {
		render(<PriceTierBadge tier="high" />);
		expect(screen.getByText("高階價位")).toBeDefined();
	});

	it("aria-label 描述 tier", () => {
		render(<PriceTierBadge tier="high" />);
		const badge = screen.getByLabelText("價位等級：高階價位");
		expect(badge).toBeDefined();
	});
});
```

- [ ] **Step 2：跑測試確認 FAIL**

Run: `pnpm test -- --run components/guide/shared/PriceTierBadge.test.tsx`
Expected: FAIL — 找不到 PriceTierBadge。

- [ ] **Step 3：寫最小實作**

Create `components/guide/shared/PriceTierBadge.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import {
	PRICE_TIER_LABEL,
	type PriceTier,
} from "@/data/guide/priceTier";
import { cn } from "@/lib/utils";

interface PriceTierBadgeProps {
	tier: PriceTier;
	className?: string;
}

const TIER_STYLE: Record<PriceTier, string> = {
	low: "bg-slate-100 text-slate-700 hover:bg-slate-100",
	mid: "bg-lime-100 text-lime-900 hover:bg-lime-100",
	high: "bg-amber-100 text-amber-900 hover:bg-amber-100",
};

export function PriceTierBadge({ tier, className }: PriceTierBadgeProps) {
	const label = PRICE_TIER_LABEL[tier];
	return (
		<Badge
			aria-label={`價位等級：${label}`}
			className={cn(
				"font-medium",
				TIER_STYLE[tier],
				className,
			)}
		>
			{label}
		</Badge>
	);
}
```

- [ ] **Step 4：跑測試確認 PASS**

Run: `pnpm test -- --run components/guide/shared/PriceTierBadge.test.tsx`
Expected: PASS（4 tests）

- [ ] **Step 5：commit**

```bash
git add components/guide/shared/PriceTierBadge.tsx components/guide/shared/PriceTierBadge.test.tsx
git commit -m "feat(guide): 新增 PriceTierBadge 元件"
```

---

### Task 3：改造 `brands.ts` 資料 schema

**Files:**
- Modify: `data/guide/brands.ts`
- Modify: `components/guide/shared/BrandCard.tsx`

> 既有 BrandCard 直接顯示 `brand.price` 字串。資料 schema 改成 `priceTier` 後 UI 也要切換用 `PriceTierBadge`。

- [ ] **Step 1：更新型別與資料**

Replace `data/guide/brands.ts` with:

```ts
import { priceRangeToTier, type PriceTier } from "./priceTier";

export interface BrandCardData {
	readonly name: string;
	readonly origin: string;
	readonly description: string;
	readonly priceTier: PriceTier;
	readonly rawPriceRangeTwd: readonly [number, number];
	readonly lastVerified: `${number}-${number}-${number}`;
}

export const brands: readonly BrandCardData[] = [
	{
		name: "Selkirk",
		origin: "🇺🇸 美國・愛達荷州",
		description:
			"匹克球界領導品牌，以控球和觸球手感著稱。獨家 InfiniGrit 拍面技術提供出色旋轉能力。",
		rawPriceRangeTwd: [1500, 11000],
		priceTier: priceRangeToTier([1500, 11000]),
		lastVerified: "2026-05-14",
	},
	{
		name: "JOOLA",
		origin: "🇩🇪 德國（原桌球品牌）",
		description:
			"贊助世界排名第一的 Ben Johns。碳纖維摩擦表面被認為旋轉性能最強之一。",
		rawPriceRangeTwd: [1700, 9300],
		priceTier: priceRangeToTier([1700, 9300]),
		lastVerified: "2026-05-14",
	},
	{
		name: "HEAD",
		origin: "🇦🇹 奧地利（台灣有正式代理）",
		description:
			"全球知名網球品牌跨足匹克球，台灣最容易買到且選擇最多的國際品牌。",
		rawPriceRangeTwd: [1700, 7200],
		priceTier: priceRangeToTier([1700, 7200]),
		lastVerified: "2026-05-14",
	},
	{
		name: "Onix",
		origin: "🇺🇸 美國・加州",
		description:
			"最老牌的匹克球品牌之一，經典 Z5 Graphite 是全球最暢銷的入門到中階球拍。",
		rawPriceRangeTwd: [2300, 3000],
		priceTier: priceRangeToTier([2300, 3000]),
		lastVerified: "2026-05-14",
	},
	{
		name: "JNICE 久奈司",
		origin: "🇹🇼 台灣本土品牌",
		description:
			"知名羽球品牌跨足匹克球，提供 Play / Game / Tour / Pro 四個等級的完整產品線。",
		rawPriceRangeTwd: [1500, 5000],
		priceTier: priceRangeToTier([1500, 5000]),
		lastVerified: "2026-05-14",
	},
	{
		name: "MARC 馬克匹克球",
		origin: "🇹🇼 台灣在地品牌",
		description:
			"產品涵蓋木拍到碳纖維拍，也提供球網、場地標線等配件，以及教學和賽事服務。",
		rawPriceRangeTwd: [320, 4200],
		priceTier: priceRangeToTier([320, 4200]),
		lastVerified: "2026-05-14",
	},
] as const;
```

- [ ] **Step 2：更新 `BrandCard` 改用 Badge**

Replace `components/guide/shared/BrandCard.tsx` with:

```tsx
"use client";

import { Card } from "@/components/ui/card";
import type { BrandCardData } from "@/data/guide/brands";
import { PriceTierBadge } from "./PriceTierBadge";

interface BrandCardProps {
	brand: BrandCardData;
}

export function BrandCard({ brand }: BrandCardProps) {
	return (
		<Card className="gap-2 rounded-2xl border border-border p-7 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
			<div className="font-outfit text-lg font-extrabold text-foreground">
				{brand.name}
			</div>
			<div className="text-xs text-muted-foreground">{brand.origin}</div>
			<p className="mt-2 text-sm leading-relaxed text-foreground/70">
				{brand.description}
			</p>
			<div className="mt-2 inline-block w-fit">
				<PriceTierBadge tier={brand.priceTier} />
			</div>
		</Card>
	);
}
```

- [ ] **Step 3：跑既有 `BrandsSection` 相關測試（若無則 lint + tsc 即可）**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 無錯誤

- [ ] **Step 4：smoke 啟動 dev 看 `/` 渲染**

Run: `pnpm dev`，於瀏覽器確認 BrandsSection 顯示六個 Badge（兩個入門、三個中階、一個高階等視資料），無 console error。確認後關閉 dev。

- [ ] **Step 5：commit**

```bash
git add data/guide/brands.ts components/guide/shared/BrandCard.tsx
git commit -m "refactor(guide): brands 改用 PriceTier，BrandCard 換 PriceTierBadge"
```

---

### Task 4：改造 `twMarketPrices.ts` 與 `TwMarketSection`

**Files:**
- Modify: `data/guide/twMarketPrices.ts`
- Modify: `components/guide/TwMarketSection.tsx`
- Modify: `components/guide/Conclusion.tsx`（移除價格字串）

- [ ] **Step 1：更新型別與資料**

Replace `data/guide/twMarketPrices.ts` with:

```ts
import { priceRangeToTier, type PriceTier } from "./priceTier";

export interface MarketPriceRow {
	readonly tier: PriceTier;
	readonly category: string;
	readonly example: string;
	readonly recommended?: boolean;
	readonly rawPriceRangeTwd: readonly [number, number];
	readonly lastVerified: `${number}-${number}-${number}`;
}

export const twMarketHeaders = ["等級", "類別", "代表產品"] as const;

const rows: readonly Omit<MarketPriceRow, "tier">[] = [
	{
		category: "木拍 / 最入門",
		example: "INFMARC 木拍",
		rawPriceRangeTwd: [320, 800],
		lastVerified: "2026-05-14",
	},
	{
		category: "入門（玻纖/複合）",
		example: "HEAD Kickstarter、INFMARC MARC001",
		recommended: true,
		rawPriceRangeTwd: [1500, 3000],
		lastVerified: "2026-05-14",
	},
	{
		category: "中階（碳纖維）",
		example: "HEAD Radical PRO、JOOLA 入門款",
		rawPriceRangeTwd: [3000, 5000],
		lastVerified: "2026-05-14",
	},
	{
		category: "進階 / 選手級",
		example: "HEAD Gravity Tour、adidas Adipower PRO",
		rawPriceRangeTwd: [5000, 8000],
		lastVerified: "2026-05-14",
	},
	{
		category: "精品 / 頂級",
		example: "MON CARBONE 設計師款",
		rawPriceRangeTwd: [8000, 15000],
		lastVerified: "2026-05-14",
	},
	{
		category: "入門雙拍套組",
		example: "HEICK 入門組、HEAD Pack Spark",
		recommended: true,
		rawPriceRangeTwd: [1500, 5000],
		lastVerified: "2026-05-14",
	},
];

export const twMarketPrices: readonly MarketPriceRow[] = rows.map((row) => ({
	...row,
	tier: priceRangeToTier(row.rawPriceRangeTwd),
}));
```

- [ ] **Step 2：更新 `TwMarketSection`**

Replace `components/guide/TwMarketSection.tsx` with:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { twMarketHeaders, twMarketPrices } from "@/data/guide/twMarketPrices";
import { ComparisonTable } from "./shared/ComparisonTable";
import { PriceTierBadge } from "./shared/PriceTierBadge";
import { Section } from "./shared/Section";
import { TipCard } from "./shared/TipCard";

export function TwMarketSection() {
	return (
		<Section
			id="tw-market"
			tag="台灣市場"
			title="市場價格分級與購買管道"
		>
			<p>
				台灣主要購買管道包含：<strong>momo 購物網</strong>（最齊全電商）、
				<strong>蝦皮購物</strong>（JNICE 有官方旗艦店）、
				<strong>Decathlon 迪卡儂</strong>（最方便的入手管道），以及 HEAD 台灣、MARC
				馬克等品牌官網直購。實體店面方面，捷利體育（JellySport）、匹克日俱樂部等專業場館也提供現場購買。
			</p>

			<ComparisonTable
				headers={twMarketHeaders}
				rows={twMarketPrices.map((row) => [
					<span key="tier" className="inline-flex items-center gap-2">
						<PriceTierBadge tier={row.tier} />
						{row.recommended && (
							<Badge className="bg-lime-400 text-slate-900 hover:bg-lime-400">
								推薦
							</Badge>
						)}
					</span>,
					row.category,
					row.example,
				])}
			/>

			<TipCard label="省錢小撇步">
				Selkirk、JOOLA 等美國品牌在台灣沒有正式代理，透過 BuyAndShip 等代運從美國購入，價格通常會比台灣本地售價低，但需自行承擔運費與保固風險。
			</TipCard>
		</Section>
	);
}
```

- [ ] **Step 3：更新 `Conclusion` 移除嵌入價格**

Modify `components/guide/Conclusion.tsx` 第 38 行段落字串，把：

```
在台灣市場上，NT$1,500–3,000 就能入手品質可靠的入門拍，NT$2,000–4,000 的雙拍套組是與朋友一起開始最經濟的選擇。
```

替換為：

```
在台灣市場上，**入門價位** 即可入手品質可靠的初階拍，雙拍套組則是與朋友一起開始最經濟的選擇。
```

最終第 38 行 `<p>` 內容為：

```tsx
<p className="mb-4 text-base leading-[1.9] text-white/80">
	匹克球的規則核心可以濃縮為三個最重要的概念。掌握這三點，你就已經可以上場打球了。球拍選購方面，新手的最佳策略是中等重量的寬體拍，搭配聚丙烯蜂巢芯和玻璃纖維或碳纖維拍面。在台灣市場上，<strong>入門價位</strong>即可入手品質可靠的初階拍，雙拍套組則是與朋友一起開始最經濟的選擇。
</p>
```

- [ ] **Step 4：型別檢查 + lint + smoke**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 無錯誤

Run: `pnpm dev`，於 `/` 確認 TwMarketSection 表格第一欄顯示 Badge（入門/中階/高階），Conclusion 段落不再有 NT$ 字串。

- [ ] **Step 5：commit**

```bash
git add data/guide/twMarketPrices.ts components/guide/TwMarketSection.tsx components/guide/Conclusion.tsx
git commit -m "refactor(guide): tw-market 表格 + Conclusion 改用 PriceTier 描述"
```

---

## Mini-Sprint 2：SiteNavbar 改造 + 路由骨架 + HashRedirector（Tasks 5–9）

目標：把 `SiteNavbar` 從 4 連結改成 5 主題連結並補 mobile hamburger；建立五個新主題頁的 page.tsx 骨架（先放佔位內容，下一個 Sprint 才搬內容）；新增 `HashRedirector` 兼容舊 hash 深連結。

---

### Task 5：升級 `SiteNavbar` — 五主題連結 + 既有工具不消失

**Files:**
- Modify: `components/layout/SiteNavbar.tsx`
- Create: `components/layout/SiteNavbar.test.tsx`

> 既有 NAV_LINKS：首頁、完整體驗、計分板、測驗。Phase A 改為：學習、規則、球拍、進階、互動工具（指向 /play hub）。`/quiz`、`/scoreboard`、`/tour` 從 navbar 拿掉，改由 `/play` Hub 進入；但 URL 仍保留可用。

- [ ] **Step 1：先寫 failing 測試**

Create `components/layout/SiteNavbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathnameMock = vi.fn<() => string>();
vi.mock("next/navigation", () => ({
	usePathname: () => pathnameMock(),
}));
vi.mock("@/hooks/useScrolledPast", () => ({
	useScrolledPast: () => false,
}));

// next/link 在 jsdom/happy-dom 環境會嘗試讀取一些 router 內部，這裡 stub 為原生 <a>。
vi.mock("next/link", () => ({
	default: ({
		children,
		href,
		...rest
	}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

import { SiteNavbar } from "./SiteNavbar";

describe("SiteNavbar 五主題連結", () => {
	it("顯示五個主題連結文字", () => {
		pathnameMock.mockReturnValue("/");
		render(<SiteNavbar />);
		for (const label of ["新手必讀", "規則速查", "球拍選購", "進階戰術", "互動工具"]) {
			expect(screen.getByRole("link", { name: label })).toBeDefined();
		}
	});

	it("/learn pathname 時「新手必讀」連結帶 active 樣式（aria-current=page）", () => {
		pathnameMock.mockReturnValue("/learn");
		render(<SiteNavbar />);
		const active = screen.getByRole("link", { name: "新手必讀" });
		expect(active.getAttribute("aria-current")).toBe("page");
	});

	it("/rules pathname 時「規則速查」連結 active", () => {
		pathnameMock.mockReturnValue("/rules");
		render(<SiteNavbar />);
		expect(
			screen.getByRole("link", { name: "規則速查" }).getAttribute("aria-current"),
		).toBe("page");
	});

	it("/quiz pathname 時「互動工具」也算 active（子頁屬於 play）", () => {
		pathnameMock.mockReturnValue("/quiz");
		render(<SiteNavbar />);
		expect(
			screen.getByRole("link", { name: "互動工具" }).getAttribute("aria-current"),
		).toBe("page");
	});
});
```

- [ ] **Step 2：跑測試確認 FAIL**

Run: `pnpm test -- --run components/layout/SiteNavbar.test.tsx`
Expected: FAIL — 找不到對應連結或 aria-current。

- [ ] **Step 3：實作**

Replace `components/layout/SiteNavbar.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScrolledPast } from "@/hooks/useScrolledPast";
import { cn } from "@/lib/utils";

interface NavLink {
	href: string;
	label: string;
	matchPrefixes: readonly string[];
}

const NAV_LINKS: readonly NavLink[] = [
	{ href: "/learn", label: "新手必讀", matchPrefixes: ["/learn"] },
	{ href: "/rules", label: "規則速查", matchPrefixes: ["/rules"] },
	{ href: "/equipment", label: "球拍選購", matchPrefixes: ["/equipment"] },
	{ href: "/skills", label: "進階戰術", matchPrefixes: ["/skills"] },
	{
		href: "/play",
		label: "互動工具",
		matchPrefixes: ["/play", "/quiz", "/scoreboard", "/tour"],
	},
] as const;

function isActive(pathname: string, prefixes: readonly string[]): boolean {
	return prefixes.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

export function SiteNavbar() {
	const pathname = usePathname();
	const isHome = pathname === "/";
	const pastHero = useScrolledPast(() => window.innerHeight - 56);
	const solid = !isHome || pastHero;

	return (
		<header
			className={cn(
				"fixed top-0 right-0 left-0 z-[110] h-14 border-b transition-[background-color,box-shadow,backdrop-filter,border-color] duration-300",
				solid
					? "border-border bg-background/90 shadow-sm backdrop-blur"
					: "border-white/10 bg-slate-900/20 backdrop-blur-sm",
			)}
		>
			<div className="mx-auto flex h-full max-w-[1200px] items-center gap-6 px-6">
				<Link
					href="/"
					transitionTypes={["nav-back"]}
					className={cn(
						"font-outfit text-sm font-extrabold tracking-[2px] uppercase",
						solid ? "text-slate-900" : "text-white",
					)}
				>
					🏓 匹克球指南
				</Link>
				<nav
					aria-label="主導航"
					className="ml-auto flex items-center gap-1"
				>
					{NAV_LINKS.map((link) => {
						const active = isActive(pathname, link.matchPrefixes);
						return (
							<Link
								key={link.href}
								href={link.href}
								aria-current={active ? "page" : undefined}
								transitionTypes={[
									link.href === "/" ? "nav-back" : "nav-forward",
								]}
								className={cn(
									"rounded-md px-3 py-2 text-sm font-medium transition-colors",
									solid
										? "text-muted-foreground hover:text-slate-900"
										: "text-white/70 hover:text-white",
									active && (solid ? "text-slate-900" : "text-white"),
								)}
							>
								{link.label}
							</Link>
						);
					})}
				</nav>
			</div>
		</header>
	);
}
```

> Mobile hamburger 設計：先以「橫向 nav 仍顯示於小螢幕」可接受度評估，若 QA 認為過擠再補 Sheet hamburger，列入 Phase A 的非阻斷工項（不擋上線）。

- [ ] **Step 4：跑測試確認 PASS**

Run: `pnpm test -- --run components/layout/SiteNavbar.test.tsx`
Expected: PASS（4 tests）

- [ ] **Step 5：型別 + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 無錯誤

- [ ] **Step 6：commit**

```bash
git add components/layout/SiteNavbar.tsx components/layout/SiteNavbar.test.tsx
git commit -m "feat(layout): SiteNavbar 改列五主題並修正 active 比對"
```

---

### Task 6：同步 OpenSpec `site-navbar` spec

**Files:**
- Modify: `openspec/specs/site-navbar/spec.md`

> 此 Task 對應 OpenSpec change 工作流，把 spec 中的 Requirements 改為五主題連結需求。實作已經先行（Task 5），但 spec 必須同步。

- [ ] **Step 1：讀現況**

Run: `cat openspec/specs/site-navbar/spec.md`

- [ ] **Step 2：寫入新 spec**

Replace `openspec/specs/site-navbar/spec.md` 對應 Requirement 區塊為：

```markdown
## Requirements

### Requirement: 五主題導航列

`SiteNavbar` MUST 顯示五個主題連結：「新手必讀」`/learn`、「規則速查」`/rules`、「球拍選購」`/equipment`、「進階戰術」`/skills`、「互動工具」`/play`。其他既有路由（`/quiz`、`/scoreboard`、`/tour`）視為 `/play` 子工具，在 navbar 上以「互動工具」單一入口呈現。

#### Scenario: 顯示五個主題

- **WHEN** 使用者位於任一頁面
- **THEN** Navbar 可見「新手必讀」「規則速查」「球拍選購」「進階戰術」「互動工具」五個 `<a>` 連結

#### Scenario: /learn active 樣式

- **WHEN** 路由為 `/learn`
- **THEN** 「新手必讀」連結 `aria-current="page"`，且 active 樣式生效

#### Scenario: /quiz active 對應到「互動工具」

- **WHEN** 路由為 `/quiz`、`/scoreboard` 或 `/tour`
- **THEN** 「互動工具」連結 `aria-current="page"`

### Requirement: 樣式切換（保留既有）

（保留既有的 isHome、pastHero、view transition 等 Scenario，不變動）
```

> 既有「Requirement: 測驗連結」由「互動工具」涵蓋，移除該 Requirement 區塊。

- [ ] **Step 3：openspec lint（若可用）**

Run: `pnpm openspec status 2>&1 | tail -20`
Expected: 通過或顯示新 spec 預期改動

- [ ] **Step 4：commit**

```bash
git add openspec/specs/site-navbar/spec.md
git commit -m "docs(openspec): site-navbar spec 同步五主題改造"
```

---

### Task 7：`HashRedirector` 客端兼容

**Files:**
- Create: `components/layout/HashRedirector.tsx`
- Create: `components/layout/HashRedirector.test.tsx`

> 既有單頁 hash 共 10 個：#court、#serve、#scoring、#fouls、#kitchen、#materials、#specs、#brands、#tw-market、#starter。Redirect 表見 design doc §8。

- [ ] **Step 1：先寫 failing 測試**

Create `components/layout/HashRedirector.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn<(url: string) => void>();
let currentPathname = "/";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: replaceMock }),
	usePathname: () => currentPathname,
}));

import { HASH_TO_PATH, HashRedirector } from "./HashRedirector";

function setHash(hash: string) {
	window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
}

beforeEach(() => {
	replaceMock.mockClear();
	currentPathname = "/";
	setHash("");
});

afterEach(() => {
	setHash("");
});

describe("HashRedirector", () => {
	it("HASH_TO_PATH 包含 10 個既有錨點", () => {
		const expected = [
			"#court",
			"#serve",
			"#scoring",
			"#fouls",
			"#kitchen",
			"#materials",
			"#specs",
			"#brands",
			"#tw-market",
			"#starter",
		];
		for (const hash of expected) {
			expect(HASH_TO_PATH[hash]).toBeDefined();
		}
	});

	it("命中 #court 時 router.replace 到 /rules#court", async () => {
		setHash("#court");
		render(<HashRedirector />);
		await waitFor(() =>
			expect(replaceMock).toHaveBeenCalledWith("/rules#court"),
		);
	});

	it("未命中 hash 時不呼叫 router.replace", async () => {
		setHash("#nonexistent");
		render(<HashRedirector />);
		// 等待 useEffect tick 後仍未被呼叫
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(replaceMock).not.toHaveBeenCalled();
	});

	it("pathname 不為 / 時不執行 redirect（避免子頁 hash 被誤導）", async () => {
		currentPathname = "/rules";
		setHash("#court");
		render(<HashRedirector />);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(replaceMock).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2：跑測試確認 FAIL**

Run: `pnpm test -- --run components/layout/HashRedirector.test.tsx`
Expected: FAIL — 找不到模組。

- [ ] **Step 3：實作**

Create `components/layout/HashRedirector.tsx`:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export const HASH_TO_PATH: Record<string, string> = {
	"#court": "/rules#court",
	"#serve": "/rules#serve",
	"#scoring": "/learn#scoring",
	"#fouls": "/rules#fouls",
	"#kitchen": "/rules#kitchen",
	"#materials": "/equipment#materials",
	"#specs": "/equipment#specs",
	"#brands": "/equipment#brands",
	"#tw-market": "/equipment#tw-market",
	"#starter": "/equipment#starter",
};

export function HashRedirector() {
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		if (pathname !== "/") return;
		const hash = window.location.hash;
		if (!hash) return;
		const target = HASH_TO_PATH[hash];
		if (target) {
			router.replace(target);
		}
	}, [pathname, router]);

	return null;
}
```

- [ ] **Step 4：跑測試確認 PASS**

Run: `pnpm test -- --run components/layout/HashRedirector.test.tsx`
Expected: PASS（4 tests）

- [ ] **Step 5：commit**

```bash
git add components/layout/HashRedirector.tsx components/layout/HashRedirector.test.tsx
git commit -m "feat(layout): HashRedirector 兼容舊單頁 hash 深連結"
```

---

### Task 8：建立五個新主題頁骨架

**Files:**
- Create: `app/learn/page.tsx`
- Create: `app/rules/page.tsx`
- Create: `app/equipment/page.tsx`
- Create: `app/skills/page.tsx`
- Create: `app/play/page.tsx`

> 此 Task 只放佔位骨架，下一個 Sprint 才搬內容。佔位內容需可被 E2E 觀察。

- [ ] **Step 1：建立 `/learn` 骨架**

Create `app/learn/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "新手必讀｜匹克球新手完全入門",
	description: "場地、計分、發球、廚房規則一次看懂的入門摘要。",
};

export default function LearnPage() {
	return (
		<main
			id="page-learn"
			className="mx-auto min-h-screen max-w-[860px] px-8 pt-24 pb-16"
		>
			<h1 className="mb-6 text-3xl font-black">新手必讀</h1>
			<p className="text-muted-foreground">
				內容搬遷中——下個 Sprint 會補上場地、計分、發球、廚房與 FAQ。
			</p>
		</main>
	);
}
```

- [ ] **Step 2：建立 `/rules` 骨架**

Create `app/rules/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "規則速查｜匹克球新手完全入門",
	description: "場地、發球、計分、犯規、廚房完整規則。",
};

export default function RulesPage() {
	return (
		<main
			id="page-rules"
			className="mx-auto min-h-screen max-w-[860px] px-8 pt-24 pb-16"
		>
			<h1 className="mb-6 text-3xl font-black">規則速查</h1>
			<p className="text-muted-foreground">
				內容搬遷中——下個 Sprint 會補上完整規則與犯規清單。
			</p>
		</main>
	);
}
```

- [ ] **Step 3：建立 `/equipment` 骨架**

Create `app/equipment/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "球拍選購｜匹克球新手完全入門",
	description: "材質、規格、品牌與市場價位分級。",
};

export default function EquipmentPage() {
	return (
		<main
			id="page-equipment"
			className="mx-auto min-h-screen max-w-[860px] px-8 pt-24 pb-16"
		>
			<h1 className="mb-6 text-3xl font-black">球拍選購</h1>
			<p className="text-muted-foreground">
				內容搬遷中——下個 Sprint 會補上材質、規格、品牌與市場分級。
			</p>
		</main>
	);
}
```

- [ ] **Step 4：建立 `/skills` 佔位**

Create `app/skills/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "進階戰術｜匹克球新手完全入門",
	description: "雙打輪轉、Stack、Dink、第三球策略、ATP 等進階主題。Phase C 上線。",
};

export default function SkillsPage() {
	return (
		<main
			id="page-skills"
			className="mx-auto flex min-h-screen max-w-[860px] flex-col items-center justify-center px-8 text-center"
		>
			<h1 className="mb-4 text-3xl font-black">進階戰術</h1>
			<p className="max-w-md text-muted-foreground">
				雙打輪轉、Stack、Dink、第三球策略、ATP 等內容正在準備中，下一階段會上線。
			</p>
		</main>
	);
}
```

- [ ] **Step 5：建立 `/play` hub 骨架**

Create `app/play/page.tsx`:

```tsx
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "互動工具｜匹克球新手完全入門",
	description: "規則隨堂測驗、即時計分板、沉浸式場地導覽。",
};

interface PlayCard {
	href: string;
	title: string;
	description: string;
}

const PLAY_CARDS: readonly PlayCard[] = [
	{
		href: "/quiz",
		title: "規則隨堂測驗",
		description: "從 25 題題庫隨機抽 10 題，立即回饋對錯。",
	},
	{
		href: "/scoreboard",
		title: "即時計分板",
		description: "雙打 / 單打計分，自動儲存進度。",
	},
	{
		href: "/tour",
		title: "沉浸式場地導覽",
		description: "scroll 驅動的場地說明，搭配手機橫向體驗最佳。",
	},
] as const;

export default function PlayPage() {
	return (
		<main
			id="page-play"
			className="mx-auto min-h-screen max-w-[860px] px-8 pt-24 pb-16"
		>
			<h1 className="mb-2 text-3xl font-black">互動工具</h1>
			<p className="mb-10 text-muted-foreground">
				邊玩邊學——選一個工具開始。
			</p>
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
				{PLAY_CARDS.map((card) => (
					<Link
						key={card.href}
						href={card.href}
						className="rounded-2xl border border-border p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
					>
						<div className="mb-2 text-lg font-extrabold">{card.title}</div>
						<p className="text-sm text-foreground/70">{card.description}</p>
					</Link>
				))}
			</div>
		</main>
	);
}
```

- [ ] **Step 6：型別 + lint + smoke**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 無錯誤

Run: `pnpm dev`，瀏覽 `/learn`、`/rules`、`/equipment`、`/skills`、`/play`，皆能渲染。

- [ ] **Step 7：commit**

```bash
git add app/learn app/rules app/equipment app/skills app/play
git commit -m "feat(routes): 新增五主題頁骨架（內容搬遷下個 Sprint）"
```

---

### Task 9：把 `HashRedirector` 掛進 root layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1：修改 layout.tsx**

於 `app/layout.tsx` 頂部 import 加：

```tsx
import { HashRedirector } from "@/components/layout/HashRedirector";
```

於 `<body>` 內、`<SiteNavbar />` 之後、`<ViewTransition>` 之前加：

```tsx
<HashRedirector />
```

最終 layout 結構：

```tsx
<body>
	<SiteNavbar />
	<HashRedirector />
	<ViewTransition ...>
		{children}
	</ViewTransition>
</body>
```

- [ ] **Step 2：型別 + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 無錯誤

- [ ] **Step 3：手動 smoke 驗證 hash redirect**

Run: `pnpm dev`
瀏覽 `http://localhost:3000/#court` → 應 redirect 至 `/rules#court`
瀏覽 `http://localhost:3000/#brands` → 應 redirect 至 `/equipment#brands`

- [ ] **Step 4：commit**

```bash
git add app/layout.tsx
git commit -m "feat(layout): 掛載 HashRedirector 兼容舊單頁深連結"
```

---

## Mini-Sprint 3：內容搬移 + Landing 改造 + TocBar 重用（Tasks 10–15）

目標：把既有 11 個 Section 依 design doc §3 mapping 搬到對應主題頁；Landing 重寫；TocBar 改為接 props 的頁內目錄。

---

### Task 10：拆 tocItems 為各頁版本

**Files:**
- Modify: `data/guide/tocItems.ts`

- [ ] **Step 1：取代檔案內容**

Replace `data/guide/tocItems.ts` with:

```ts
export interface TocItem {
	id: string;
	label: string;
}

export const learnTocItems: readonly TocItem[] = [
	{ id: "court-basics", label: "場地基礎" },
	{ id: "serve-basics", label: "發球基礎" },
	{ id: "scoring", label: "計分" },
	{ id: "kitchen-basics", label: "廚房簡介" },
	{ id: "faq", label: "新手 FAQ" },
] as const;

export const rulesTocItems: readonly TocItem[] = [
	{ id: "court", label: "場地" },
	{ id: "serve", label: "發球" },
	{ id: "fouls", label: "犯規" },
	{ id: "kitchen", label: "廚房" },
] as const;

export const equipmentTocItems: readonly TocItem[] = [
	{ id: "materials", label: "材質" },
	{ id: "specs", label: "規格" },
	{ id: "brands", label: "品牌" },
	{ id: "tw-market", label: "市場分級" },
	{ id: "starter", label: "入門套組" },
] as const;
```

- [ ] **Step 2：lint + tsc（既有 TocBar 仍引用舊 export，下一個 Task 改）**

```bash
pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: 出現 TocBar.tsx 找不到 `tocItems` 的錯誤——預期之內，下一個 Task 修。

> 不在此 Task commit；與 Task 11 一起 commit。

---

### Task 11：`TocBar` 改為接 `items` props

**Files:**
- Modify: `components/guide/TocBar.tsx`
- Create: `components/guide/TocBar.test.tsx`

- [ ] **Step 1：先寫 failing 測試**

Create `components/guide/TocBar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useScrolledPast", () => ({
	useScrolledPast: () => true,
}));
vi.mock("@/hooks/useScrollSpy", () => ({
	useScrollSpy: () => "court",
}));

import { TocBar } from "./TocBar";

const items = [
	{ id: "court", label: "場地" },
	{ id: "serve", label: "發球" },
];

describe("TocBar", () => {
	it("依 items props 渲染對應連結", () => {
		render(<TocBar items={items} />);
		expect(screen.getByRole("link", { name: "場地" })).toBeDefined();
		expect(screen.getByRole("link", { name: "發球" })).toBeDefined();
	});

	it("active id 對應的連結帶 aria-current", () => {
		render(<TocBar items={items} />);
		expect(
			screen.getByRole("link", { name: "場地" }).getAttribute("aria-current"),
		).toBe("location");
	});
});
```

- [ ] **Step 2：跑測試確認 FAIL**

Run: `pnpm test -- --run components/guide/TocBar.test.tsx`
Expected: FAIL — TocBar 還是不接 props。

- [ ] **Step 3：實作**

Replace `components/guide/TocBar.tsx` with:

```tsx
"use client";

import { useScrolledPast } from "@/hooks/useScrolledPast";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { cn } from "@/lib/utils";

interface TocItem {
	id: string;
	label: string;
}

interface TocBarProps {
	items: readonly TocItem[];
}

const NAV_HEIGHT = 56;

export function TocBar({ items }: TocBarProps) {
	const pastHero = useScrolledPast(() => window.innerHeight - NAV_HEIGHT);
	const ids = items.map((item) => item.id);
	const activeId = useScrollSpy(ids);

	return (
		<nav
			aria-label="頁內目錄"
			className={cn(
				"fixed top-14 right-0 left-0 z-[100] border-b transition-[background-color,box-shadow,backdrop-filter,border-color] duration-300",
				pastHero
					? "border-border bg-background/90 shadow-md backdrop-blur"
					: "border-white/10 bg-slate-900/20 backdrop-blur-sm",
			)}
		>
			<div className="mx-auto flex max-w-[1200px] items-center gap-2 overflow-x-auto px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				<span
					className={cn(
						"mr-2 border-r-2 py-4 pr-3 font-outfit text-[0.7rem] font-extrabold tracking-[2px] whitespace-nowrap transition-colors duration-300",
						pastHero
							? "border-border text-slate-900"
							: "border-white/20 text-white",
					)}
				>
					目錄
				</span>
				{items.map((item) => {
					const isActive = activeId === item.id;
					return (
						<a
							key={item.id}
							href={`#${item.id}`}
							aria-current={isActive ? "location" : undefined}
							className={cn(
								"border-b-2 border-transparent px-4 py-4 text-[0.82rem] font-medium whitespace-nowrap transition-colors duration-300",
								pastHero
									? "text-muted-foreground hover:border-b-lime-400 hover:text-slate-900"
									: "text-white/70 hover:border-b-lime-400 hover:text-white",
								isActive &&
									(pastHero
										? "border-b-lime-400 text-slate-900"
										: "border-b-lime-400 text-white"),
							)}
						>
							{item.label}
						</a>
					);
				})}
			</div>
		</nav>
	);
}
```

- [ ] **Step 4：跑測試確認 PASS + 型別**

```bash
pnpm test -- --run components/guide/TocBar.test.tsx
pnpm exec tsc --noEmit
```

Expected: tests PASS、tsc 無錯（既有 `app/page.tsx` 還 import TocBar 但無 items props——Task 12 會把 page.tsx 重寫）

> 若此時 tsc 因 `app/page.tsx` 仍紅，臨時在 page.tsx 改成 `<TocBar items={[]} />` 讓 build 過——下一個 Task 會徹底重寫 page.tsx。

- [ ] **Step 5：commit（合併 Task 10 與 11）**

```bash
git add data/guide/tocItems.ts components/guide/TocBar.tsx components/guide/TocBar.test.tsx
git commit -m "refactor(guide): tocItems 拆三組、TocBar 改接 items props"
```

---

### Task 12：搬內容到 `/equipment`

**Files:**
- Modify: `app/equipment/page.tsx`

> `/equipment` 內容：MaterialsSection、SpecsSection、BrandsSection、TwMarketSection、StarterSection。所有元件已是 client component 並接資料。

- [ ] **Step 1：取代 page.tsx**

Replace `app/equipment/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { Separator } from "@/components/ui/separator";
import { BrandsSection } from "@/components/guide/BrandsSection";
import { MaterialsSection } from "@/components/guide/MaterialsSection";
import { SpecsSection } from "@/components/guide/SpecsSection";
import { StarterSection } from "@/components/guide/StarterSection";
import { TocBar } from "@/components/guide/TocBar";
import { TwMarketSection } from "@/components/guide/TwMarketSection";
import { equipmentTocItems } from "@/data/guide/tocItems";

export const metadata: Metadata = {
	title: "球拍選購｜匹克球新手完全入門",
	description: "材質、規格、品牌與市場價位分級。",
};

export default function EquipmentPage() {
	return (
		<>
			<TocBar items={equipmentTocItems} />
			<main
				id="page-equipment"
				className="mx-auto max-w-[860px] px-8 pt-32 pb-16"
			>
				<h1 className="mb-8 text-3xl font-black">球拍選購</h1>
				<MaterialsSection />
				<Separator />
				<SpecsSection />
				<Separator />
				<BrandsSection />
				<Separator />
				<TwMarketSection />
				<Separator />
				<StarterSection />
			</main>
		</>
	);
}
```

- [ ] **Step 2：型別 + lint + smoke**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Run: `pnpm dev`，瀏覽 `/equipment` → 五 Section 渲染、PriceTier Badge 顯示，TocBar 頁內錨點運作。

- [ ] **Step 3：commit**

```bash
git add app/equipment/page.tsx
git commit -m "feat(equipment): 搬入材質/規格/品牌/市場/入門五 Section"
```

---

### Task 13：搬內容到 `/rules`

**Files:**
- Modify: `app/rules/page.tsx`

> `/rules`：CourtSection、ServeSection、FoulsSection、KitchenSection。內容沿用既有 Section，Phase B 才會加互動場地與動畫。

- [ ] **Step 1：取代 page.tsx**

Replace `app/rules/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { Separator } from "@/components/ui/separator";
import { CourtSection } from "@/components/guide/CourtSection";
import { FoulsSection } from "@/components/guide/FoulsSection";
import { KitchenSection } from "@/components/guide/KitchenSection";
import { ServeSection } from "@/components/guide/ServeSection";
import { TocBar } from "@/components/guide/TocBar";
import { rulesTocItems } from "@/data/guide/tocItems";

export const metadata: Metadata = {
	title: "規則速查｜匹克球新手完全入門",
	description: "場地、發球、犯規、廚房完整規則。",
};

export default function RulesPage() {
	return (
		<>
			<TocBar items={rulesTocItems} />
			<main
				id="page-rules"
				className="mx-auto max-w-[860px] px-8 pt-32 pb-16"
			>
				<h1 className="mb-8 text-3xl font-black">規則速查</h1>
				<CourtSection />
				<Separator />
				<ServeSection />
				<Separator />
				<FoulsSection />
				<Separator />
				<KitchenSection />
			</main>
		</>
	);
}
```

- [ ] **Step 2：型別 + lint + smoke**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

- [ ] **Step 3：commit**

```bash
git add app/rules/page.tsx
git commit -m "feat(rules): 搬入場地/發球/犯規/廚房四 Section"
```

---

### Task 14：搬內容到 `/learn` 並補新手 FAQ

**Files:**
- Modify: `app/learn/page.tsx`
- Create: `components/guide/FaqSection.tsx`

> `/learn` 是入門摘要。既有 CourtSection 等內容會比較細，這裡先沿用同元件並用不同 anchor id；Phase A 不重寫文案（design doc §16 開放問題）。
> 新增 `FaqSection` 元件，內容是 3-5 條最常見的新手問題，作為 Phase A 的新增章節。

- [ ] **Step 1：建立 `FaqSection`**

Create `components/guide/FaqSection.tsx`:

```tsx
"use client";

import { Section } from "./shared/Section";

interface FaqItem {
	q: string;
	a: string;
}

const FAQ: readonly FaqItem[] = [
	{
		q: "完全沒打過球可以直接玩匹克球嗎？",
		a: "可以。匹克球的學習曲線比網球、羽球都平緩；只要記住「下手發球、前兩拍落地、廚房不能截擊」這三點就能開始打了。",
	},
	{
		q: "我該先買哪一種球拍？",
		a: "新手建議選入門價位的玻纖／碳纖維拍（不要選純木拍），重量 7.3–8.4 oz、寬體版型，方便打到甜蜜點。",
	},
	{
		q: "雙打和單打規則一樣嗎？",
		a: "場地大小一樣，但雙打發球規則較特殊（每隊先手發兩球、加上發球順序追蹤）。新手大多從雙打開始。",
	},
	{
		q: "室內球和室外球有什麼差別？",
		a: "室內球洞較小且材質較軟；室外球洞較大、材質較硬以抗風。買套組前先確認常打的場地類型。",
	},
] as const;

export function FaqSection() {
	return (
		<Section id="faq" tag="新手 FAQ" title="最常見的四個問題">
			<dl className="space-y-6">
				{FAQ.map((item) => (
					<div key={item.q}>
						<dt className="mb-1 font-semibold text-foreground">{item.q}</dt>
						<dd className="text-foreground/80">{item.a}</dd>
					</div>
				))}
			</dl>
		</Section>
	);
}
```

- [ ] **Step 2：取代 `/learn` page.tsx**

Replace `app/learn/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { Separator } from "@/components/ui/separator";
import { CourtSection } from "@/components/guide/CourtSection";
import { FaqSection } from "@/components/guide/FaqSection";
import { KitchenSection } from "@/components/guide/KitchenSection";
import { ScoringSection } from "@/components/guide/ScoringSection";
import { ServeSection } from "@/components/guide/ServeSection";
import { TocBar } from "@/components/guide/TocBar";
import { learnTocItems } from "@/data/guide/tocItems";

export const metadata: Metadata = {
	title: "新手必讀｜匹克球新手完全入門",
	description: "場地、計分、發球、廚房規則一次看懂。",
};

export default function LearnPage() {
	return (
		<>
			<TocBar items={learnTocItems} />
			<main
				id="page-learn"
				className="mx-auto max-w-[860px] px-8 pt-32 pb-16"
			>
				<h1 className="mb-8 text-3xl font-black">新手必讀</h1>
				<CourtSection />
				<Separator />
				<ServeSection />
				<Separator />
				<ScoringSection />
				<Separator />
				<KitchenSection />
				<Separator />
				<FaqSection />
			</main>
		</>
	);
}
```

> 注意：`/learn` 與 `/rules` 同時 import 同個 CourtSection／ServeSection／KitchenSection（內容一樣）。Phase B 才會把這幾個 Section 拆成「基礎版」「完整版」雙版本——此屬可接受重複。

- [ ] **Step 3：型別 + lint + smoke**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Run: `pnpm dev`，瀏覽 `/learn`，確認 5 Section 渲染、FAQ 顯示 4 條問答。

- [ ] **Step 4：commit**

```bash
git add components/guide/FaqSection.tsx app/learn/page.tsx
git commit -m "feat(learn): 搬入入門 4 Section 並新增新手 FAQ"
```

---

### Task 15：Landing 改造（`/`）+ 主題卡

**Files:**
- Modify: `app/page.tsx`
- Create: `components/site/HomeTopicCard.tsx`

> Landing：保留 Hero + 簡化 Conclusion + 新增三張主題卡（規則／球拍／互動工具）。原 11 Section 串接全部移除。

- [ ] **Step 1：建立 `HomeTopicCard`**

Create `components/site/HomeTopicCard.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

interface HomeTopicCardProps {
	href: string;
	tag: string;
	title: string;
	description: string;
	className?: string;
}

export function HomeTopicCard({
	href,
	tag,
	title,
	description,
	className,
}: HomeTopicCardProps) {
	return (
		<Link
			href={href}
			className={cn(
				"flex flex-col rounded-2xl border border-border bg-card p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg",
				className,
			)}
		>
			<span className="mb-2 font-outfit text-[0.7rem] font-bold uppercase tracking-[3px] text-orange-500">
				{tag}
			</span>
			<h3 className="mb-2 text-xl font-extrabold text-foreground">{title}</h3>
			<p className="text-sm leading-relaxed text-foreground/70">{description}</p>
		</Link>
	);
}
```

- [ ] **Step 2：取代 `app/page.tsx`**

Replace `app/page.tsx` with:

```tsx
import { Hero } from "@/components/guide/Hero";
import { Conclusion } from "@/components/guide/Conclusion";
import { HomeTopicCard } from "@/components/site/HomeTopicCard";

const TOPIC_CARDS = [
	{
		href: "/learn",
		tag: "Step 01",
		title: "新手必讀",
		description: "場地、計分、發球、廚房、新手 FAQ 一次看完。",
	},
	{
		href: "/equipment",
		tag: "Step 02",
		title: "球拍選購",
		description: "材質、規格、品牌、台灣市場分級 Badge。",
	},
	{
		href: "/play",
		tag: "Step 03",
		title: "互動工具",
		description: "規則測驗、計分板、場地導覽，邊玩邊學。",
	},
] as const;

export default function HomePage() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<Hero />

			<section className="mx-auto max-w-[1100px] px-8 py-20">
				<h2 className="mb-2 text-[clamp(1.5rem,3vw,2rem)] font-black">
					從哪裡開始？
				</h2>
				<p className="mb-10 text-muted-foreground">
					三條路線任選一條，照你需要的順序往前。
				</p>
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
					{TOPIC_CARDS.map((card) => (
						<HomeTopicCard key={card.href} {...card} />
					))}
				</div>
			</section>

			<Conclusion />

			<footer className="border-t border-border px-8 py-8 text-center text-xs text-muted-foreground">
				本指南僅供參考，規則可能隨版本更新。實際比賽請以
				<a
					href="https://usapickleball.org/rules/"
					className="ml-1 underline"
					target="_blank"
					rel="noreferrer"
				>
					USA Pickleball 官方規則書
				</a>
				為準。
			</footer>
		</div>
	);
}
```

- [ ] **Step 3：型別 + lint + smoke**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Run: `pnpm dev`：
- 瀏覽 `/` → Hero + 三張主題卡 + Conclusion + Footer 渲染
- 點「新手必讀」卡片 → 導到 `/learn`
- 點「球拍選購」→ `/equipment`
- 點「互動工具」→ `/play`

- [ ] **Step 4：commit**

```bash
git add components/site/HomeTopicCard.tsx app/page.tsx
git commit -m "feat(landing): 改造首頁為多頁式入口（Hero + 主題卡 + Conclusion）"
```

---

## Mini-Sprint 4：E2E 整合測試（Tasks 16–17）

目標：用 Playwright 確保五主題頁皆可進入、hash redirect 運作、既有 `/quiz`、`/scoreboard`、`/tour` 不退化。

---

### Task 16：新增多頁式 E2E spec

**Files:**
- Create: `tests/e2e/specs/multipage.spec.ts`

- [ ] **Step 1：建立測試**

Create `tests/e2e/specs/multipage.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("多頁式入口", () => {
	test("Landing 顯示三張主題卡且可點擊進入各主題頁", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByRole("link", { name: /新手必讀/ })).toBeVisible();
		await expect(page.getByRole("link", { name: /球拍選購/ })).toBeVisible();
		await expect(page.getByRole("link", { name: /互動工具/ })).toBeVisible();

		await page.getByRole("link", { name: /新手必讀/ }).first().click();
		await expect(page).toHaveURL("/learn");
		await expect(page.locator("#page-learn")).toBeVisible();
	});

	test("SiteNavbar 列五主題並可導航", async ({ page }) => {
		await page.goto("/");
		for (const label of [
			"新手必讀",
			"規則速查",
			"球拍選購",
			"進階戰術",
			"互動工具",
		]) {
			await expect(
				page.getByRole("link", { name: label, exact: true }),
			).toBeVisible();
		}

		await page.getByRole("link", { name: "規則速查", exact: true }).click();
		await expect(page).toHaveURL("/rules");
		await expect(page.locator("#page-rules")).toBeVisible();
	});

	test("/skills 顯示「即將推出」佔位", async ({ page }) => {
		await page.goto("/skills");
		await expect(page.locator("#page-skills")).toContainText("正在準備中");
	});

	test("/play 顯示三張互動工具卡", async ({ page }) => {
		await page.goto("/play");
		await expect(page.getByText("規則隨堂測驗")).toBeVisible();
		await expect(page.getByText("即時計分板")).toBeVisible();
		await expect(page.getByText("沉浸式場地導覽")).toBeVisible();
	});

	test("舊 hash 深連結會 redirect 到新頁", async ({ page }) => {
		await page.goto("/#court");
		await page.waitForURL("**/rules#court");
		await expect(page.locator("#page-rules")).toBeVisible();

		await page.goto("/#brands");
		await page.waitForURL("**/equipment#brands");
		await expect(page.locator("#page-equipment")).toBeVisible();
	});
});

test.describe("既有功能不退化", () => {
	test("/quiz 仍可進入並顯示題目", async ({ page }) => {
		await page.goto("/quiz");
		await expect(page).toHaveURL("/quiz");
		// 既有 quiz 應顯示題目（沿用既有 spec 的 testid 不變）
		await expect(page.locator("body")).not.toBeEmpty();
	});

	test("/scoreboard 仍可進入", async ({ page }) => {
		await page.goto("/scoreboard");
		await expect(page).toHaveURL("/scoreboard");
		await expect(page.locator("body")).not.toBeEmpty();
	});

	test("/tour 仍可進入", async ({ page }) => {
		await page.goto("/tour");
		await expect(page).toHaveURL("/tour");
		await expect(page.locator("body")).not.toBeEmpty();
	});
});
```

- [ ] **Step 2：跑 E2E**

Run: `pnpm test:e2e tests/e2e/specs/multipage.spec.ts`
Expected: 全部 PASS（五個 browser project 各 8 個 test 全綠）

- [ ] **Step 3：commit**

```bash
git add tests/e2e/specs/multipage.spec.ts
git commit -m "test(e2e): 五主題頁 + hash redirect + 既有功能 smoke"
```

---

### Task 17：跑既有 E2E 全套確保無退化

**Files:**
- 無變動

> 既有 `tests/e2e/specs/quiz.spec.ts`、`scoreboard.spec.ts`、`tour.spec.ts` 若有，必須全綠。

- [ ] **Step 1：跑整套 E2E**

Run: `pnpm test:e2e`
Expected: 所有 spec PASS（包含新加的 multipage 與既有測試）

若有失敗，依失敗訊息：
- 多半是 SiteNavbar 連結 label 改變造成既有 spec 依靠舊 label（「測驗」「計分板」）找不到——更新對應既有 spec 的 selector
- 或是錨點被新 sticky TocBar 遮住——調整 `scroll-margin-top` 或測試的 `scrollIntoView` 行為

- [ ] **Step 2：跑整套單元測試**

Run: `pnpm test -- --run`
Expected: 所有測試 PASS

- [ ] **Step 3：commit（若有修正既有 spec）**

```bash
git add <修正的檔案>
git commit -m "test(e2e): 同步既有 spec 連結 label 到新 navbar"
```

> 若無修正則略過此 commit。

---

## 完成後檢核（Definition of Done）

完成 Phase A 全部 Tasks 後，下列條件**必須**全部成立才能交付給 Phase B 規劃：

- [ ] `/`、`/learn`、`/rules`、`/equipment`、`/skills`、`/play` 六條路由皆可瀏覽，無 console error
- [ ] `/quiz`、`/scoreboard`、`/tour` URL 仍可用，內容未退化
- [ ] 舊 hash（`#court`、`#brands` 等）會自動 redirect 到對應新頁
- [ ] BrandsSection、TwMarketSection 不再顯示 `NT$xxxx` 之類具體價格，僅顯示 PriceTier Badge
- [ ] Conclusion 段落內亦不含具體價格字串
- [ ] SiteNavbar 顯示五主題連結並有 active 狀態（`/quiz` 時「互動工具」active）
- [ ] `openspec/specs/site-navbar/spec.md` 與實作同步
- [ ] `pnpm test -- --run` 全綠
- [ ] `pnpm test:e2e` 全綠（五個 browser project）
- [ ] `pnpm exec tsc --noEmit` 無錯誤
- [ ] `pnpm lint` 無錯誤
- [ ] Git history 上每個 Task 對應一個明確 commit

---

## 後續

Phase A 上線後：
1. brainstorm + writing-plans 規劃 **Phase B（互動式場地圖 + 規則動畫 + 規則搜尋）**
2. Phase B 上線後：brainstorm + writing-plans 規劃 **Phase C（`/skills` 進階戰術內容，必先讀 2026 USAP rulebook）**

每個 Phase 各自走 OpenSpec spec-driven TDD：先寫 failing 測試 → 最小實作 → refactor。
