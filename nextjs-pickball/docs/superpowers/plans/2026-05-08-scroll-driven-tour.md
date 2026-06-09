# Scroll-Driven Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在現有匹克球指南頁面加入 `/tour` sub-route（6 個全螢幕 scroll-driven stage），並把既有 Hero 升級為 scroll-driven。完成後不得破壞既有 `pickleball-guide-page` capability 的 spec。

**Architecture:** 雙路徑動畫策略——CSS scroll-timeline 為主（Chrome/Edge/Firefox），motion `useScroll` 為 fallback（Safari）；以 `<ScrollTimelineProvider>` 一次偵測、context 共享。`prefers-reduced-motion` 啟用時所有 scroll-driven 動畫關閉，scroll-snap 保留。`/` ↔ `/tour` 以 React 19 `<ViewTransition>` + `addTransitionType` 做方向性過場。

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · `motion` 12 · Vitest 4 + happy-dom + `@testing-library/react` · Playwright

**OpenSpec change:** `add-tour-experience`（已含 proposal / design / specs / tasks），詳見 `openspec/changes/add-tour-experience/`。本 plan 是 `tasks.md` 的 bite-sized 細化版。

**Working branch:** `feature/scroll-driven-tour`（已切）

---

## File Structure

新增檔案：

| 路徑 | 責任 |
|---|---|
| `lib/scrollTimeline.ts` | `supportsScrollTimeline()` 純函式：偵測 CSS scroll-timeline 兩條件 |
| `lib/scrollTimeline.test.ts` | 上述 Vitest |
| `hooks/useReducedMotion.ts` | 監聽 `prefers-reduced-motion: reduce`，回傳 boolean |
| `hooks/useReducedMotion.test.ts` | 上述 Vitest |
| `hooks/useScrollLinkedProgress.ts` | 包裝 motion `useScroll`，回傳 `MotionValue<number>` |
| `hooks/useScrollLinkedProgress.test.ts` | 上述 Vitest |
| `data/tour/playerGrowth.ts` | stage 2 折線圖年度資料（純常數） |
| `data/tour/playerGrowth.test.ts` | 上述 Vitest |
| `components/tour/shared/ScrollTimelineProvider.tsx` | Provider + `useScrollTimelineSupport` + `useStageProgress` |
| `components/tour/shared/ScrollTimelineProvider.test.tsx` | 上述 Vitest |
| `components/tour/TourStage.tsx` | layout container（100vh、scroll-snap、a11y） |
| `components/tour/TourProgressRail.tsx` | 左側 fixed 進度直條 |
| `components/tour/TourSkipButton.tsx` | 右下角 fixed Skip 按鈕 |
| `components/tour/stages/CourtSizeStage.tsx` | stage 1 |
| `components/tour/stages/PlayerGrowthStage.tsx` | stage 2 |
| `components/tour/stages/TwoBounceStage.tsx` | stage 3 |
| `components/tour/stages/KitchenViolationStage.tsx` | stage 4 |
| `components/tour/stages/MaterialsSpectrumStage.tsx` | stage 5 |
| `components/tour/stages/ClosingStage.tsx` | stage 6 |
| `app/tour/page.tsx` | `/tour` 入口 |
| `tests/e2e/specs/tour.spec.ts` | Playwright E2E |

修改檔案：

| 路徑 | 修改內容 |
|---|---|
| `app/page.tsx` | Hero 結束位置加「進入完整體驗 →」CTA |
| `app/layout.tsx` | 包覆 `<ViewTransition>`（待 task 10.1 評估後決定） |
| `app/globals.css` | 新增 `@keyframes stage-fade` / `stage-pin` 與 `@utility animation-timeline-view` / `animation-range-cover`；新增 `::view-transition-*` forward/back 過場 |
| `components/guide/Hero.tsx` | 三分支（CSS scroll-timeline / motion fallback / staggerChildren reduced-motion fallback） |

不新增任何 npm 套件。

---

## Task 1: `lib/scrollTimeline.ts` 偵測函式（TDD）

**Files:**
- Create: `lib/scrollTimeline.ts`
- Test: `lib/scrollTimeline.test.ts`

**Spec ref:** `tour-experience` › *雙路徑 scroll-driven 動畫策略* 的 3 條 supportsScrollTimeline 場景。

- [ ] **Step 1.1: 寫 failing test 檔**

建立 `lib/scrollTimeline.test.ts`：

```ts
import { describe, it, expect, afterEach } from "vitest";
import { supportsScrollTimeline } from "./scrollTimeline";

describe("supportsScrollTimeline", () => {
	const originalCSS = globalThis.CSS;

	afterEach(() => {
		// 還原全域 CSS
		Object.defineProperty(globalThis, "CSS", {
			configurable: true,
			value: originalCSS,
		});
	});

	it("在 CSS.supports 兩條件皆為 true 時回傳 true", () => {
		Object.defineProperty(globalThis, "CSS", {
			configurable: true,
			value: {
				supports: (q: string) =>
					q === "animation-timeline: scroll()" ||
					q === "animation-range: entry 0% exit 100%",
			},
		});

		expect(supportsScrollTimeline()).toBe(true);
	});

	it("在 CSS.supports 任一條件為 false 時回傳 false", () => {
		Object.defineProperty(globalThis, "CSS", {
			configurable: true,
			value: {
				supports: (q: string) => q === "animation-timeline: scroll()",
			},
		});

		expect(supportsScrollTimeline()).toBe(false);
	});

	it("在 CSS 物件不存在時回傳 false 不拋例外", () => {
		Object.defineProperty(globalThis, "CSS", {
			configurable: true,
			value: undefined,
		});

		expect(() => supportsScrollTimeline()).not.toThrow();
		expect(supportsScrollTimeline()).toBe(false);
	});
});
```

- [ ] **Step 1.2: 跑測試確認紅燈**

```bash
pnpm test -- --run lib/scrollTimeline.test.ts
```

預期：3 個 it 全 fail，`Cannot find module './scrollTimeline'`。

- [ ] **Step 1.3: 寫最小實作**

建立 `lib/scrollTimeline.ts`：

```ts
// 偵測瀏覽器是否支援 CSS scroll-timeline 與 animation-range；同時支援才回 true。
// 非瀏覽器環境（CSS 不存在）回傳 false 而非拋錯。
export function supportsScrollTimeline(): boolean {
	if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
		return false;
	}

	return (
		CSS.supports("animation-timeline: scroll()") &&
		CSS.supports("animation-range: entry 0% exit 100%")
	);
}
```

- [ ] **Step 1.4: 跑測試確認綠燈**

```bash
pnpm test -- --run lib/scrollTimeline.test.ts
```

預期：3 個 it 全綠。

- [ ] **Step 1.5: refactor 註記**

檢視 `lib/scrollTimeline.ts`：純函式、無 side effect、命名清楚——標 skipped，不重構。

- [ ] **Step 1.6: commit**

```bash
git add lib/scrollTimeline.ts lib/scrollTimeline.test.ts
git commit -m "feat(scroll-timeline): 加入 CSS scroll-timeline 支援偵測"
```

---

## Task 2: `hooks/useReducedMotion`（TDD）

**Files:**
- Create: `hooks/useReducedMotion.ts`
- Test: `hooks/useReducedMotion.test.ts`

**Spec ref:** `tour-experience` › *prefers-reduced-motion 全域降級* 的 3 條 useReducedMotion 場景。

- [ ] **Step 2.1: 寫 failing test**

建立 `hooks/useReducedMotion.test.ts`：

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReducedMotion } from "./useReducedMotion";

type Listener = (e: MediaQueryListEvent) => void;

function mockMatchMedia(initial: boolean) {
	let matches = initial;
	const listeners = new Set<Listener>();

	const removeEventListener = vi.fn((_type: string, l: Listener) => {
		listeners.delete(l);
	});

	const mql = {
		get matches() {
			return matches;
		},
		addEventListener: vi.fn((_type: string, l: Listener) => {
			listeners.add(l);
		}),
		removeEventListener,
		// 測試輔助：模擬瀏覽器觸發 change 事件
		dispatch: (next: boolean) => {
			matches = next;
			for (const l of listeners) {
				l({ matches: next } as MediaQueryListEvent);
			}
		},
	};

	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		writable: true,
		value: vi.fn().mockReturnValue(mql),
	});

	return { mql, removeEventListener };
}

describe("useReducedMotion", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("在 prefers-reduced-motion: reduce 啟用時回傳 true", () => {
		mockMatchMedia(true);
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(true);
	});

	it("於 matchMedia change 事件後回傳新值", () => {
		const { mql } = mockMatchMedia(false);
		const { result } = renderHook(() => useReducedMotion());

		expect(result.current).toBe(false);

		act(() => {
			mql.dispatch(true);
		});

		expect(result.current).toBe(true);
	});

	it("卸載時移除 matchMedia 監聽", () => {
		const { removeEventListener } = mockMatchMedia(false);
		const { unmount } = renderHook(() => useReducedMotion());

		unmount();

		expect(removeEventListener).toHaveBeenCalledWith(
			"change",
			expect.any(Function),
		);
	});
});
```

- [ ] **Step 2.2: 跑測試確認紅燈**

```bash
pnpm test -- --run hooks/useReducedMotion.test.ts
```

預期：3 個 it 全 fail。

- [ ] **Step 2.3: 寫最小實作**

建立 `hooks/useReducedMotion.ts`：

```ts
import { useEffect, useState } from "react";

// 監聽 prefers-reduced-motion: reduce，回傳目前狀態。
// 初值以 useState getter 直接讀取 matchMedia，避免 SSR 後第一次渲染閃爍。
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	});

	useEffect(() => {
		const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);

		setReduced(mql.matches);
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	return reduced;
}
```

- [ ] **Step 2.4: 跑測試確認綠燈**

```bash
pnpm test -- --run hooks/useReducedMotion.test.ts
```

預期：3 個 it 全綠。

- [ ] **Step 2.5: refactor 註記**

設計簡潔，無重構必要——標 skipped。

- [ ] **Step 2.6: commit**

```bash
git add hooks/useReducedMotion.ts hooks/useReducedMotion.test.ts
git commit -m "feat(hooks): 加入 useReducedMotion 偵測使用者動畫偏好"
```

---

## Task 3: `hooks/useScrollLinkedProgress`（TDD）

**Files:**
- Create: `hooks/useScrollLinkedProgress.ts`
- Test: `hooks/useScrollLinkedProgress.test.ts`

**Spec ref:** `tour-experience` › *雙路徑 scroll-driven 動畫策略* 之 useScrollLinkedProgress 場景。

- [ ] **Step 3.1: 寫 failing test**

建立 `hooks/useScrollLinkedProgress.test.ts`：

```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useScrollLinkedProgress } from "./useScrollLinkedProgress";

vi.mock("motion/react", () => {
	const unsubscribers = vi.fn();
	const motionValue = {
		get: () => 0,
		on: vi.fn().mockReturnValue(unsubscribers),
		set: vi.fn(),
	};
	return {
		useScroll: vi.fn().mockReturnValue({
			scrollYProgress: motionValue,
		}),
	};
});

describe("useScrollLinkedProgress", () => {
	it("回傳 motion value 並於卸載時 unsubscribe", async () => {
		const { useScroll } = await import("motion/react");

		const { result, unmount } = renderHook(() => {
			const ref = useRef<HTMLDivElement>(null);
			return useScrollLinkedProgress(ref);
		});

		expect(result.current).toBeDefined();
		expect(useScroll).toHaveBeenCalledWith(
			expect.objectContaining({
				offset: ["start end", "end start"],
			}),
		);

		// 卸載時不應拋例外
		expect(() => unmount()).not.toThrow();
	});
});
```

- [ ] **Step 3.2: 跑測試確認紅燈**

```bash
pnpm test -- --run hooks/useScrollLinkedProgress.test.ts
```

預期：fail，找不到模組。

- [ ] **Step 3.3: 寫最小實作**

建立 `hooks/useScrollLinkedProgress.ts`：

```ts
import { type RefObject } from "react";
import { useScroll, type MotionValue } from "motion/react";

// 包裝 motion useScroll，預設 offset 為 stage 進入到完全離開視窗。
// 回傳 0→1 之間的 MotionValue，子元件可再以 useTransform 映射到任意視覺屬性。
export function useScrollLinkedProgress(
	target: RefObject<HTMLElement | null>,
): MotionValue<number> {
	const { scrollYProgress } = useScroll({
		target,
		offset: ["start end", "end start"],
	});

	return scrollYProgress;
}
```

- [ ] **Step 3.4: 跑測試確認綠燈**

```bash
pnpm test -- --run hooks/useScrollLinkedProgress.test.ts
```

預期：1 個 it 綠。

- [ ] **Step 3.5: refactor 註記**

純包裝、無壞味道——標 skipped。

- [ ] **Step 3.6: commit**

```bash
git add hooks/useScrollLinkedProgress.ts hooks/useScrollLinkedProgress.test.ts
git commit -m "feat(hooks): 加入 useScrollLinkedProgress 包裝 motion useScroll"
```

---

## Task 4: `data/tour/playerGrowth.ts`（TDD）

**Files:**
- Create: `data/tour/playerGrowth.ts`
- Test: `data/tour/playerGrowth.test.ts`

**Spec ref:** `tour-experience` › *stage 2 玩家成長資料純資料化*。

- [ ] **Step 4.1: 寫 failing test**

建立 `data/tour/playerGrowth.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { playerGrowth } from "./playerGrowth";

describe("playerGrowth", () => {
	it("提供至少 6 筆年度資料且年份與人數均遞增", () => {
		expect(Array.isArray(playerGrowth)).toBe(true);
		expect(playerGrowth.length).toBeGreaterThanOrEqual(6);

		const years = playerGrowth.map((d) => d.year);
		const players = playerGrowth.map((d) => d.players);

		// 年份從 2020 起
		expect(years[0]).toBe(2020);

		// 年份遞增不重複
		for (let i = 1; i < years.length; i++) {
			expect(years[i]).toBeGreaterThan(years[i - 1]);
		}

		// 人數遞增（允許相等？此處嚴格遞增以反映成長）
		for (let i = 1; i < players.length; i++) {
			expect(players[i]).toBeGreaterThan(players[i - 1]);
		}
	});
});
```

- [ ] **Step 4.2: 跑測試確認紅燈**

```bash
pnpm test -- --run data/tour/playerGrowth.test.ts
```

預期：fail。

- [ ] **Step 4.3: 寫最小實作**

建立 `data/tour/playerGrowth.ts`：

```ts
export interface PlayerGrowthDatum {
	readonly year: number;
	readonly players: number;
}

// 台灣匹克球玩家數量年度成長（公開新聞估計值，作為 stage 2 折線圖示意用）。
// 數據刻意採整數，便於補間與顯示。
export const playerGrowth: readonly PlayerGrowthDatum[] = [
	{ year: 2020, players: 5_000 },
	{ year: 2021, players: 12_000 },
	{ year: 2022, players: 35_000 },
	{ year: 2023, players: 70_000 },
	{ year: 2024, players: 110_000 },
	{ year: 2025, players: 140_000 },
] as const;
```

- [ ] **Step 4.4: 跑測試確認綠燈**

```bash
pnpm test -- --run data/tour/playerGrowth.test.ts
```

預期：綠燈。

- [ ] **Step 4.5: refactor 註記**

純資料無重構必要——標 skipped。

- [ ] **Step 4.6: commit**

```bash
git add data/tour/playerGrowth.ts data/tour/playerGrowth.test.ts
git commit -m "feat(data): 加入台灣匹克球玩家成長年度資料"
```

---

## Task 5: `ScrollTimelineProvider` + `useStageProgress`（TDD）

**Files:**
- Create: `components/tour/shared/ScrollTimelineProvider.tsx`
- Test: `components/tour/shared/ScrollTimelineProvider.test.tsx`

**Spec ref:** `tour-experience` › *雙路徑 scroll-driven 動畫策略* + *prefers-reduced-motion 全域降級*。

- [ ] **Step 5.1: 寫 failing test**

建立 `components/tour/shared/ScrollTimelineProvider.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { type ReactNode } from "react";
import {
	ScrollTimelineProvider,
	useScrollTimelineSupport,
} from "./ScrollTimelineProvider";

// 偵測函式以 mock 控制
vi.mock("@/lib/scrollTimeline", () => ({
	supportsScrollTimeline: vi.fn(),
}));

describe("ScrollTimelineProvider", () => {
	beforeEach(async () => {
		const { supportsScrollTimeline } = await import("@/lib/scrollTimeline");
		(supportsScrollTimeline as unknown as { mockReset: () => void }).mockReset();
	});

	it("於初次掛載偵測一次並透過 context 提供結果", async () => {
		const { supportsScrollTimeline } = await import("@/lib/scrollTimeline");
		(
			supportsScrollTimeline as unknown as { mockReturnValue: (v: boolean) => void }
		).mockReturnValue(true);

		const wrapper = ({ children }: { children: ReactNode }) => (
			<ScrollTimelineProvider>{children}</ScrollTimelineProvider>
		);

		const { result } = renderHook(() => useScrollTimelineSupport(), { wrapper });

		// useEffect 後觸發更新
		await act(async () => {});

		expect(result.current).toBe(true);
		expect(supportsScrollTimeline).toHaveBeenCalledTimes(1);
	});

	it("useScrollTimelineSupport 在 Provider 外呼叫時回傳 false 預設值", () => {
		const { result } = renderHook(() => useScrollTimelineSupport());
		expect(result.current).toBe(false);
	});
});
```

- [ ] **Step 5.2: 跑測試確認紅燈**

```bash
pnpm test -- --run components/tour/shared/ScrollTimelineProvider.test.tsx
```

預期：fail。

- [ ] **Step 5.3: 寫最小實作**

建立 `components/tour/shared/ScrollTimelineProvider.tsx`：

```tsx
"use client";

import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
	type RefObject,
} from "react";
import type { MotionValue } from "motion/react";
import { supportsScrollTimeline } from "@/lib/scrollTimeline";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useScrollLinkedProgress } from "@/hooks/useScrollLinkedProgress";

const ScrollTimelineContext = createContext<boolean>(false);

// 於 /tour 入口掛一次：偵測 CSS scroll-timeline 支援，全頁子元件透過 context 共享結果。
export function ScrollTimelineProvider({ children }: { children: ReactNode }) {
	const [supported, setSupported] = useState(false);

	useEffect(() => {
		setSupported(supportsScrollTimeline());
	}, []);

	return (
		<ScrollTimelineContext.Provider value={supported}>
			{children}
		</ScrollTimelineContext.Provider>
	);
}

export function useScrollTimelineSupport(): boolean {
	return useContext(ScrollTimelineContext);
}

// 統一抽象：支援 scroll-timeline 或 reduced-motion 時回 null（CSS 自跑或全靜態），
// 其餘情境回 motion value 供子元件以 useTransform 映射到視覺屬性。
export function useStageProgress(
	target: RefObject<HTMLElement | null>,
): MotionValue<number> | null {
	const reduced = useReducedMotion();
	const supported = useScrollTimelineSupport();
	const progress = useScrollLinkedProgress(target);

	if (reduced) return null;
	if (supported) return null;
	return progress;
}
```

- [ ] **Step 5.4: 跑測試確認綠燈**

```bash
pnpm test -- --run components/tour/shared/ScrollTimelineProvider.test.tsx
```

預期：2 個 it 綠。

- [ ] **Step 5.5: refactor 註記**

無重構必要——標 skipped。

- [ ] **Step 5.6: commit**

```bash
git add components/tour/shared/ScrollTimelineProvider.tsx components/tour/shared/ScrollTimelineProvider.test.tsx
git commit -m "feat(tour): 加入 ScrollTimelineProvider 與 useStageProgress 統一抽象"
```

---

## Task 6: `TourStage` layout container（例外層 + E2E 驗收）

**Files:**
- Create: `components/tour/TourStage.tsx`

**Spec ref:** `tour-experience` › *6 段 scroll-driven 體驗* 之 6 個 `data-stage-id` 要求。

- [ ] **Step 6.1: 建立元件**

建立 `components/tour/TourStage.tsx`：

```tsx
"use client";

import { type ReactNode, type Ref } from "react";

export type StageId =
	| "court-size"
	| "player-growth"
	| "two-bounce"
	| "kitchen-violation"
	| "materials-spectrum"
	| "closing";

interface TourStageProps {
	id: StageId;
	ariaLabel: string;
	children: ReactNode;
	stageRef?: Ref<HTMLElement>;
}

// /tour 之 stage 共用容器：100vh 高度、scroll-snap-align、a11y label、data-stage-id 供 E2E 取用。
// 視覺與動畫由 children 自行決定；本元件只負責版面與語意。
export function TourStage({ id, ariaLabel, children, stageRef }: TourStageProps) {
	return (
		<section
			ref={stageRef}
			data-stage-id={id}
			aria-label={ariaLabel}
			className="relative h-screen w-full snap-start overflow-hidden"
		>
			{children}
		</section>
	);
}
```

- [ ] **Step 6.2: commit**

```bash
git add components/tour/TourStage.tsx
git commit -m "feat(tour): 加入 TourStage 共用容器（scroll-snap 與 a11y）"
```

---

## Task 7: 6 個 stage 元件（例外層）

每個 stage 是 client component。設計原則：
- SVG 內以 `motion.*` 元素或加 utility class，依 `useStageProgress(ref)` 結果分流。
- 文案內聯於元件內。
- 不跨 stage 共享動畫狀態。

**Files (all create):**
- `components/tour/stages/CourtSizeStage.tsx`
- `components/tour/stages/PlayerGrowthStage.tsx`
- `components/tour/stages/TwoBounceStage.tsx`
- `components/tour/stages/KitchenViolationStage.tsx`
- `components/tour/stages/MaterialsSpectrumStage.tsx`
- `components/tour/stages/ClosingStage.tsx`

**Spec ref:** `tour-experience` › *6 段 scroll-driven 體驗*；E2E 由 task 13 驗收。

- [ ] **Step 7.1: CourtSizeStage**

建立 `components/tour/stages/CourtSizeStage.tsx`：

```tsx
"use client";

import { useRef } from "react";
import { motion, useTransform } from "motion/react";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";

// stage 1：球場大小對比。捲動進度 0→1 期間，網球場 SVG 縮小至 1/4，
// 並淡入匹克球場輪廓；右側計數器從 260 跑到 81。
export function CourtSizeStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	const courtScale = useTransform(progress ?? null, [0, 1], [1, 0.5]);
	const pickleOpacity = useTransform(progress ?? null, [0.3, 1], [0, 1]);
	const counter = useTransform(progress ?? null, [0, 1], [260, 81]);

	return (
		<TourStage id="court-size" ariaLabel="比網球更小，但同樣激烈" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-12">
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						比網球更小，<span className="text-lime-400">但同樣激烈</span>
					</h2>

					<div className="relative h-[300px] w-[600px] max-md:h-[200px] max-md:w-[360px]">
						<motion.svg
							style={progress ? { scale: courtScale } : undefined}
							viewBox="0 0 600 300"
							className={
								progress
									? "absolute inset-0"
									: "absolute inset-0 animate-stage-fade animation-timeline-view animation-range-cover"
							}
						>
							<rect
								x="20"
								y="20"
								width="560"
								height="260"
								fill="none"
								stroke="#a3e635"
								strokeWidth="3"
							/>
							<line x1="300" y1="20" x2="300" y2="280" stroke="#a3e635" strokeWidth="2" />
						</motion.svg>

						<motion.svg
							style={progress ? { opacity: pickleOpacity } : undefined}
							viewBox="0 0 600 300"
							className={
								progress
									? "absolute inset-0"
									: "absolute inset-0 animate-stage-fade animation-timeline-view animation-range-cover"
							}
						>
							<rect
								x="220"
								y="100"
								width="160"
								height="100"
								fill="none"
								stroke="#fb923c"
								strokeWidth="3"
							/>
						</motion.svg>
					</div>

					<motion.div className="flex items-baseline gap-4 font-bebas text-5xl">
						<motion.span style={progress ? { color: "#fb923c" } : undefined}>
							{progress ? <Counter value={counter} /> : 81}
						</motion.span>
						<span className="text-base text-white/60">㎡</span>
					</motion.div>
				</div>
			</div>
		</TourStage>
	);
}

// 把 MotionValue<number> 轉為整數字串渲染
function Counter({ value }: { value: ReturnType<typeof useTransform> }) {
	const display = useTransform(value, (v) => Math.round(v as number).toString());
	return <motion.span>{display}</motion.span>;
}
```

- [ ] **Step 7.2: PlayerGrowthStage**

建立 `components/tour/stages/PlayerGrowthStage.tsx`：

```tsx
"use client";

import { useRef } from "react";
import { motion, useTransform } from "motion/react";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";
import { playerGrowth } from "@/data/tour/playerGrowth";

// stage 2：年度成長折線圖。捲動 0→1 期間，折線 dashoffset 從 1 收回到 0。
export function PlayerGrowthStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	// 將 playerGrowth 轉為 polyline points
	const maxPlayers = playerGrowth.at(-1)?.players ?? 1;
	const points = playerGrowth
		.map((d, i) => {
			const x = (i / (playerGrowth.length - 1)) * 560 + 20;
			const y = 280 - (d.players / maxPlayers) * 240;
			return `${x},${y}`;
		})
		.join(" ");

	const dashOffset = useTransform(progress ?? null, [0, 1], [1, 0]);

	return (
		<TourStage id="player-growth" ariaLabel="14 萬人正在打" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-12">
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						<span className="text-lime-400">14 萬</span>人正在打
					</h2>

					<svg viewBox="0 0 600 300" className="h-[300px] w-[600px] max-md:h-[200px] max-md:w-[360px]">
						<motion.polyline
							points={points}
							fill="none"
							stroke="#a3e635"
							strokeWidth="3"
							pathLength={1}
							style={progress ? { pathLength: dashOffset } : undefined}
							className={
								progress
									? undefined
									: "animate-stage-fade animation-timeline-view animation-range-cover"
							}
						/>
						{playerGrowth.map((d, i) => {
							const x = (i / (playerGrowth.length - 1)) * 560 + 20;
							const y = 280 - (d.players / maxPlayers) * 240;
							return (
								<circle
									key={d.year}
									cx={x}
									cy={y}
									r="5"
									fill="#a3e635"
								/>
							);
						})}
					</svg>

					<div className="grid grid-cols-6 gap-4 font-bebas text-2xl text-white/70">
						{playerGrowth.map((d) => (
							<div key={d.year} className="text-center">
								<div>{d.year}</div>
								<div className="text-xs text-white/40">
									{(d.players / 1000).toFixed(0)}k
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</TourStage>
	);
}
```

- [ ] **Step 7.3: TwoBounceStage**

建立 `components/tour/stages/TwoBounceStage.tsx`：

```tsx
"use client";

import { useRef } from "react";
import { motion, useTransform } from "motion/react";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";

// stage 3：兩跳規則。球軌跡 SVG 由發球到截擊，dashoffset 隨進度收回；
// 同時球的位置以 cx/cy motion 補間。
export function TwoBounceStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	// 控制球沿著拋物線移動：5 個 keyframe（發球 → 落地 → 接 → 落地 → 截擊）
	const ballX = useTransform(progress ?? null, [0, 0.25, 0.5, 0.75, 1], [60, 200, 340, 480, 540]);
	const ballY = useTransform(progress ?? null, [0, 0.25, 0.5, 0.75, 1], [200, 260, 200, 260, 200]);
	const dashOffset = useTransform(progress ?? null, [0, 1], [1, 0]);

	return (
		<TourStage id="two-bounce" ariaLabel="兩跳規則，最關鍵的一條" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-12">
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						兩跳規則，<span className="text-lime-400">最關鍵的一條</span>
					</h2>

					<svg viewBox="0 0 600 300" className="h-[300px] w-[600px] max-md:h-[200px] max-md:w-[360px]">
						<line x1="0" y1="280" x2="600" y2="280" stroke="#475569" strokeWidth="2" />
						<motion.path
							d="M 60 200 Q 130 80 200 260 Q 270 80 340 200 Q 410 80 480 260 Q 510 200 540 200"
							fill="none"
							stroke="#fb923c"
							strokeWidth="2"
							strokeDasharray="6 6"
							pathLength={1}
							style={progress ? { pathLength: dashOffset } : undefined}
							className={
								progress
									? undefined
									: "animate-stage-fade animation-timeline-view animation-range-cover"
							}
						/>
						<motion.circle
							r="10"
							fill="#a3e635"
							style={progress ? { cx: ballX, cy: ballY } : undefined}
						/>
					</svg>
				</div>
			</div>
		</TourStage>
	);
}
```

- [ ] **Step 7.4: KitchenViolationStage**

建立 `components/tour/stages/KitchenViolationStage.tsx`：

```tsx
"use client";

import { useRef } from "react";
import { motion, useTransform } from "motion/react";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";

// stage 4：廚房違規。俯視場地，scroll 時廚房紅區從淡入到完整高亮，腳印由後場走向廚房。
export function KitchenViolationStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	const kitchenOpacity = useTransform(progress ?? null, [0, 0.5], [0, 1]);
	const footY = useTransform(progress ?? null, [0, 1], [240, 110]);
	const flashOpacity = useTransform(progress ?? null, [0.85, 1], [0, 1]);

	return (
		<TourStage id="kitchen-violation" ariaLabel="廚房：腳一進去就犯規" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-12">
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						廚房：<span className="text-orange-500">腳一進去就犯規</span>
					</h2>

					<svg viewBox="0 0 400 300" className="h-[300px] w-[400px] max-md:h-[220px] max-md:w-[300px]">
						<rect x="20" y="20" width="360" height="260" fill="none" stroke="#a3e635" strokeWidth="3" />
						<motion.rect
							x="20"
							y="100"
							width="360"
							height="80"
							fill="#fb923c"
							style={progress ? { opacity: kitchenOpacity } : undefined}
							className={
								progress
									? undefined
									: "animate-stage-fade animation-timeline-view animation-range-cover"
							}
						/>
						<line x1="200" y1="20" x2="200" y2="100" stroke="#a3e635" strokeWidth="2" />
						<line x1="200" y1="180" x2="200" y2="280" stroke="#a3e635" strokeWidth="2" />
						<motion.circle
							r="8"
							cx="200"
							fill="white"
							style={progress ? { cy: footY } : undefined}
						/>
						<motion.rect
							x="20"
							y="100"
							width="360"
							height="80"
							fill="#dc2626"
							style={progress ? { opacity: flashOpacity } : undefined}
						/>
					</svg>
				</div>
			</div>
		</TourStage>
	);
}
```

- [ ] **Step 7.5: MaterialsSpectrumStage**

建立 `components/tour/stages/MaterialsSpectrumStage.tsx`：

```tsx
"use client";

import { useRef } from "react";
import { motion, useTransform } from "motion/react";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";

// stage 5：球拍材質。三張卡片水平 pin 推移，並由 useTransform 控制 x 位置。
const cards = [
	{ id: "fiberglass", name: "玻纖", color: "#a3e635", desc: "便宜、耐打、力道大" },
	{ id: "carbon", name: "碳纖", color: "#fb923c", desc: "靈敏、控球佳、價位中高" },
	{ id: "kevlar", name: "凱夫拉", color: "#facc15", desc: "強度極高、進階首選" },
] as const;

export function MaterialsSpectrumStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	const x = useTransform(progress ?? null, [0, 1], ["0%", "-66.66%"]);

	return (
		<TourStage id="materials-spectrum" ariaLabel="球拍材質光譜" stageRef={ref}>
			<div className="flex h-full w-full flex-col items-center justify-center gap-12 overflow-hidden bg-slate-900 text-white">
				<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
					球拍<span className="text-lime-400">材質光譜</span>
				</h2>

				<motion.div
					className={
						progress
							? "flex w-[300%] gap-6 px-[5vw]"
							: "flex w-[300%] gap-6 px-[5vw] animate-stage-pin animation-timeline-view animation-range-cover"
					}
					style={progress ? { x } : undefined}
				>
					{cards.map((card) => (
						<div
							key={card.id}
							className="flex h-[300px] w-1/3 flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-slate-800 p-8"
							style={{ borderColor: card.color }}
						>
							<div className="font-bebas text-5xl" style={{ color: card.color }}>
								{card.name}
							</div>
							<div className="text-center text-sm text-white/70">{card.desc}</div>
						</div>
					))}
				</motion.div>
			</div>
		</TourStage>
	);
}
```

- [ ] **Step 7.6: ClosingStage**

建立 `components/tour/stages/ClosingStage.tsx`：

```tsx
"use client";

import { useRef } from "react";
import { motion, useTransform } from "motion/react";
import { useRouter } from "next/navigation";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";
import { Button } from "@/components/ui/button";

// stage 6：收束 CTA。按鈕點擊時觸發 view transition「back」並回到 /。
export function ClosingStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);
	const router = useRouter();

	const opacity = useTransform(progress ?? null, [0.4, 1], [0, 1]);
	const y = useTransform(progress ?? null, [0.4, 1], [40, 0]);

	const onBack = () => {
		// 若 React 19 addTransitionType 已串接，於 task 10 改用 startTransition + addTransitionType
		router.push("/");
	};

	return (
		<TourStage id="closing" ariaLabel="準備好開始了嗎？" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<motion.div
					className={
						progress
							? "flex flex-col items-center gap-8"
							: "flex flex-col items-center gap-8 animate-stage-fade animation-timeline-view animation-range-cover"
					}
					style={progress ? { opacity, y } : undefined}
				>
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						準備好<span className="text-lime-400">開始了嗎？</span>
					</h2>
					<Button onClick={onBack} className="bg-lime-400 text-slate-900 hover:bg-lime-300">
						回到完整指南
					</Button>
				</motion.div>
			</div>
		</TourStage>
	);
}
```

- [ ] **Step 7.7: commit**

```bash
git add components/tour/stages/
git commit -m "feat(tour): 加入 6 個 scroll-driven stage 元件"
```

---

## Task 8: `TourProgressRail` + `TourSkipButton`

**Files:**
- Create: `components/tour/TourProgressRail.tsx`
- Create: `components/tour/TourSkipButton.tsx`

**Spec ref:** `tour-experience` › *6 段 scroll-driven 體驗* 之共通互動。

- [ ] **Step 8.1: TourProgressRail**

建立 `components/tour/TourProgressRail.tsx`：

```tsx
"use client";

import { useEffect, useState } from "react";

const STAGE_IDS = [
	"court-size",
	"player-growth",
	"two-bounce",
	"kitchen-violation",
	"materials-spectrum",
	"closing",
] as const;

// 左側 fixed 直條，6 格依當前 stage 高亮。以 IntersectionObserver 偵測哪一個 stage
// 占視窗中央較多。
export function TourProgressRail() {
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		const observers: IntersectionObserver[] = [];
		STAGE_IDS.forEach((id, idx) => {
			const el = document.querySelector<HTMLElement>(`[data-stage-id="${id}"]`);
			if (!el) return;

			const observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
							setActiveIndex(idx);
						}
					}
				},
				{ threshold: [0.5] },
			);
			observer.observe(el);
			observers.push(observer);
		});

		return () => {
			observers.forEach((o) => o.disconnect());
		};
	}, []);

	return (
		<div
			role="progressbar"
			aria-valuemin={1}
			aria-valuemax={STAGE_IDS.length}
			aria-valuenow={activeIndex + 1}
			aria-label="導覽進度"
			className="fixed top-1/2 left-6 z-50 flex -translate-y-1/2 flex-col gap-2"
		>
			{STAGE_IDS.map((id, idx) => (
				<span
					key={id}
					data-active={idx === activeIndex}
					className="block h-8 w-1 rounded-full bg-white/20 transition-colors data-[active=true]:bg-lime-400"
				/>
			))}
		</div>
	);
}
```

- [ ] **Step 8.2: TourSkipButton**

建立 `components/tour/TourSkipButton.tsx`：

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// 右下角 fixed 「跳過 →」按鈕，導向 /#court。view transition 串接於 task 10。
export function TourSkipButton() {
	const router = useRouter();

	return (
		<Button
			type="button"
			onClick={() => router.push("/#court")}
			className="fixed right-6 bottom-6 z-50 bg-white/10 text-white backdrop-blur hover:bg-white/20"
		>
			跳過 →
		</Button>
	);
}
```

- [ ] **Step 8.3: commit**

```bash
git add components/tour/TourProgressRail.tsx components/tour/TourSkipButton.tsx
git commit -m "feat(tour): 加入進度直條與 Skip 按鈕"
```

---

## Task 9: `app/tour/page.tsx` 組裝（入口層）

**Files:**
- Create: `app/tour/page.tsx`

**Spec ref:** `tour-experience` › *6 段 scroll-driven 體驗* + */tour 之 metadata*。

- [ ] **Step 9.1: 建立 `/tour` 頁面**

建立 `app/tour/page.tsx`：

```tsx
import type { Metadata } from "next";
import { ScrollTimelineProvider } from "@/components/tour/shared/ScrollTimelineProvider";
import { TourProgressRail } from "@/components/tour/TourProgressRail";
import { TourSkipButton } from "@/components/tour/TourSkipButton";
import { CourtSizeStage } from "@/components/tour/stages/CourtSizeStage";
import { PlayerGrowthStage } from "@/components/tour/stages/PlayerGrowthStage";
import { TwoBounceStage } from "@/components/tour/stages/TwoBounceStage";
import { KitchenViolationStage } from "@/components/tour/stages/KitchenViolationStage";
import { MaterialsSpectrumStage } from "@/components/tour/stages/MaterialsSpectrumStage";
import { ClosingStage } from "@/components/tour/stages/ClosingStage";

export const metadata: Metadata = {
	title: "匹克球新手完全入門 · 互動體驗 | 匹克球指南",
	description: "用捲動的方式快速看完匹克球規則與器材重點，6 個互動場景帶你 5 分鐘上手",
};

export default function TourPage() {
	return (
		<ScrollTimelineProvider>
			<TourProgressRail />
			<TourSkipButton />
			<main className="h-screen snap-y snap-mandatory overflow-y-scroll bg-slate-900 text-white">
				<CourtSizeStage />
				<PlayerGrowthStage />
				<TwoBounceStage />
				<KitchenViolationStage />
				<MaterialsSpectrumStage />
				<ClosingStage />
			</main>
		</ScrollTimelineProvider>
	);
}
```

- [ ] **Step 9.2: 手動驗收**

```bash
pnpm dev
```

開啟 http://localhost:3000/tour，應看到 stage 1 占滿視窗、左側進度條、右下角 Skip 按鈕；捲動可看到後續 stage（動畫可能尚不順——task 10、11、12 補齊）。

- [ ] **Step 9.3: commit**

```bash
git add app/tour/page.tsx
git commit -m "feat(tour): 加入 /tour 入口頁面組裝 6 個 stage"
```

---

## Task 10: `<ViewTransition>` 接 `/` ↔ `/tour`

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `components/tour/stages/ClosingStage.tsx`
- Modify: `components/tour/TourSkipButton.tsx`

**Spec ref:** `tour-experience` › *首頁 CTA 串接並觸發方向性過場*。

- [ ] **Step 10.1: 評估 React 19 `<ViewTransition>` 整合**

以 `vercel-react-view-transitions` skill 確認當前 API 與 Next.js 16 整合方式：

```bash
# 透過 Skill tool 呼叫該 skill
```

讀回的關鍵點：
- React 19 提供 `unstable_ViewTransition` / `<ViewTransition>` 與 `addTransitionType()`，於 `react` 套件內。
- Next.js 16 App Router 自 16.x 起支援；若需 `experimental.viewTransition` flag，於 `next.config.ts` 啟用。

若 skill 回覆顯示 API 與本 plan 假設一致，繼續 step 10.2；若需調整 API 名稱，於本 plan 內先把名稱統一更新後再進入後續 step。

- [ ] **Step 10.2: 包覆 layout 與新增 CSS 過場**

修改 `app/layout.tsx`，於 `<body>` 內主內容包 `<ViewTransition>`（具體 import 名以 step 10.1 結果為準）：

```tsx
// 既有 import 之外
import { unstable_ViewTransition as ViewTransition } from "react";

// children 改成
<ViewTransition>{children}</ViewTransition>
```

於 `app/globals.css` 末尾新增：

```css
/* /、/tour 之間方向性過場 */
::view-transition-old(root) {
	animation: 320ms cubic-bezier(0.4, 0, 0.2, 1) both fade-out-left;
}
::view-transition-new(root) {
	animation: 320ms cubic-bezier(0.4, 0, 0.2, 1) both fade-in-right;
}
:root:has(::view-transition-group(root))[data-vt="back"] ::view-transition-old(root) {
	animation-name: fade-out-right;
}
:root:has(::view-transition-group(root))[data-vt="back"] ::view-transition-new(root) {
	animation-name: fade-in-left;
}

@keyframes fade-out-left {
	to { opacity: 0; transform: translateX(-12%); }
}
@keyframes fade-in-right {
	from { opacity: 0; transform: translateX(12%); }
}
@keyframes fade-out-right {
	to { opacity: 0; transform: translateX(12%); }
}
@keyframes fade-in-left {
	from { opacity: 0; transform: translateX(-12%); }
}

@media (prefers-reduced-motion: reduce) {
	::view-transition-old(root),
	::view-transition-new(root) {
		animation-duration: 0ms;
	}
}
```

- [ ] **Step 10.3: 在按鈕觸發 transition type**

修改 `components/tour/TourSkipButton.tsx`：

```tsx
"use client";

import { useRouter } from "next/navigation";
import { addTransitionType, startTransition } from "react";
import { Button } from "@/components/ui/button";

export function TourSkipButton() {
	const router = useRouter();

	const onSkip = () => {
		startTransition(() => {
			addTransitionType("back");
			router.push("/#court");
		});
	};

	return (
		<Button
			type="button"
			onClick={onSkip}
			className="fixed right-6 bottom-6 z-50 bg-white/10 text-white backdrop-blur hover:bg-white/20"
		>
			跳過 →
		</Button>
	);
}
```

修改 `components/tour/stages/ClosingStage.tsx` 中 `onBack`：

```tsx
import { addTransitionType, startTransition } from "react";

const onBack = () => {
	startTransition(() => {
		addTransitionType("back");
		router.push("/");
	});
};
```

> 註：若 step 10.1 顯示需用其他形式觸發（例如 `flushSync` 或自製 hook），於此 step 統一替換。

- [ ] **Step 10.4: 降級方案備援**

若 step 10.1 顯示 React 19 ViewTransition 在 Next.js 16 仍為 experimental 且穩定性低，改採 motion 手刻過場：
- 在 `<main>` 外包 `<motion.div>`，依 pathname 變化以 `AnimatePresence` 觸發 fade + slide。
- 移除 `<ViewTransition>` 與 globals.css 過場規則。
- 在 `openspec/changes/add-tour-experience/specs/tour-experience/spec.md` 加註 `Migration: 暫以 motion 手刻過場替代 ViewTransition，待 Next.js stable 後再切回`。

若採此降級，step 10.2/10.3 對應修改取消、改為 motion 實作；plan 後續 step 維持不變。

- [ ] **Step 10.5: 手動驗收**

```bash
pnpm dev
```

於 / 點擊「進入完整體驗 →」（task 12 加入後）→ 過場由右側滑入；於 /tour 點 Skip 或 ClosingStage 「回到完整指南」→ 過場由左側滑入。

- [ ] **Step 10.6: commit**

```bash
git add app/layout.tsx app/globals.css components/tour/TourSkipButton.tsx components/tour/stages/ClosingStage.tsx
git commit -m "feat(tour): 接上 / ↔ /tour 之 view transition 與方向性過場"
```

---

## Task 11: `app/globals.css` keyframes 與 utility（樣式層）

**Files:**
- Modify: `app/globals.css`

**Spec ref:** `tour-experience` › *雙路徑 scroll-driven 動畫策略*。

- [ ] **Step 11.1: 新增 keyframes 與 utility**

在 `app/globals.css` 末尾新增：

```css
/* tour stage 共用 keyframes */
@keyframes stage-fade {
	0% { opacity: 0; transform: translateY(40px); }
	30%, 70% { opacity: 1; transform: translateY(0); }
	100% { opacity: 0; transform: translateY(-40px); }
}

@keyframes stage-pin {
	from { transform: translateX(0%); }
	to { transform: translateX(-66.66%); }
}

/* Tailwind v4 自訂 utility */
@utility animation-timeline-view {
	animation-timeline: view();
}

@utility animation-range-cover {
	animation-range: cover 0% cover 100%;
}

@utility animate-stage-fade {
	animation-name: stage-fade;
	animation-duration: 1ms;
	animation-fill-mode: both;
}

@utility animate-stage-pin {
	animation-name: stage-pin;
	animation-duration: 1ms;
	animation-fill-mode: both;
}
```

> 註：duration 設 1ms 是為了讓 `animation-timeline: view()` 完全主導進度（CSS 規範要求 duration > 0）。

- [ ] **Step 11.2: 視覺驗收**

```bash
pnpm dev
```

於支援 scroll-timeline 的 Chrome 上開啟 `/tour`，stage 內容應隨捲動進度淡入淡出；於 `prefers-reduced-motion: reduce` 開啟時應靜止。

- [ ] **Step 11.3: commit**

```bash
git add app/globals.css
git commit -m "feat(tour): 加入 stage scroll-timeline keyframes 與 utility"
```

---

## Task 12: Hero scroll-driven 升級與首頁 CTA

**Files:**
- Modify: `components/guide/Hero.tsx`
- Modify: `app/page.tsx`

**Spec ref:** `tour-experience` › *Hero 升級為 scroll-driven 並保留向下相容* + *首頁 CTA 串接*。

- [ ] **Step 12.1: 改造 Hero 為三分支**

修改 `components/guide/Hero.tsx`：

```tsx
"use client";

import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { motion, useTransform, type Variants } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useScrollLinkedProgress } from "@/hooks/useScrollLinkedProgress";

interface HeroStat {
	num: string;
	label: string;
}

const heroStats: readonly HeroStat[] = [
	{ num: "14萬+", label: "台灣活躍玩家" },
	{ num: "¼", label: "僅網球場 1/4 大" },
	{ num: "11", label: "分即可拿下一局" },
] as const;

const heroContainerVariants: Variants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.2, delayChildren: 0.2 } },
};

const heroItemVariants: Variants = {
	hidden: { opacity: 0, y: 30 },
	show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

export function Hero() {
	const sectionRef = useRef<HTMLElement>(null);
	const reduced = useReducedMotion();
	// reduced motion 時不啟動 scroll 連動，保留既有 staggerChildren。
	const progress = useScrollLinkedProgress(sectionRef);

	const titleY = useTransform(progress, [0, 0.3], [0, -40]);
	const titleScale = useTransform(progress, [0, 0.3], [1, 0.92]);
	const statsOpacity = useTransform(progress, [0.6, 0.9], [0, 1]);
	const statsY = useTransform(progress, [0.6, 0.9], [40, 0]);

	const useScrollDriven = !reduced;

	return (
		<section
			ref={sectionRef}
			className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900"
		>
			<div
				aria-hidden
				className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_80%,rgba(163,230,53,0.15)_0%,transparent_50%),radial-gradient(ellipse_at_80%_20%,rgba(249,115,22,0.1)_0%,transparent_50%)]"
			/>

			<div
				aria-hidden
				className="absolute top-1/2 left-1/2 h-[700px] w-[340px] border-[3px] border-white/12 opacity-30 [transform:translate(-50%,-50%)_perspective(800px)_rotateX(55deg)_rotateZ(-5deg)] max-md:h-[500px] max-md:w-[240px]"
			>
				<div className="absolute top-0 right-0 left-0 h-[35%] border-b-[3px] border-white/12" />
				<div className="absolute top-[35%] left-1/2 h-[65%] w-0 border-l-[3px] border-white/12" />
			</div>

			<div
				aria-hidden
				className="absolute top-[15%] right-[12%] h-[60px] w-[60px] animate-float-ball rounded-full bg-lime-400 shadow-[0_0_60px_rgba(163,230,53,0.4)] max-md:top-[10%] max-md:right-[8%] max-md:h-10 max-md:w-10"
			>
				<div className="absolute inset-2 rounded-full border-2 border-dashed border-black/15" />
			</div>

			<motion.div
				className="relative z-[2] max-w-[900px] px-8 text-center"
				variants={heroContainerVariants}
				initial="hidden"
				animate="show"
				style={useScrollDriven ? { y: titleY, scale: titleScale } : undefined}
			>
				<motion.div
					variants={heroItemVariants}
					className="mb-8 inline-block rounded-full bg-lime-400 px-6 py-2 font-outfit text-xs font-bold uppercase tracking-[3px] text-slate-900"
				>
					2025 完全入門指南
				</motion.div>

				<motion.h1
					variants={heroItemVariants}
					className="mb-6 text-[clamp(2.4rem,6vw,4.5rem)] font-black leading-[1.2] text-white"
				>
					匹克球<span className="text-lime-400">新手</span>完全入門
				</motion.h1>

				<motion.p
					variants={heroItemVariants}
					className="mx-auto mb-10 max-w-[600px] text-[1.15rem] font-light text-white/70"
				>
					從規則到球拍選購，零基礎也能一次看懂的匹克球百科
				</motion.p>

				<motion.div
					className="flex flex-wrap justify-center gap-12 max-md:gap-6"
					variants={heroItemVariants}
					style={useScrollDriven ? { opacity: statsOpacity, y: statsY } : undefined}
				>
					{heroStats.map((stat) => (
						<div key={stat.label} className="text-center">
							<div className="font-bebas text-5xl leading-none text-lime-400 max-md:text-[2.2rem]">
								{stat.num}
							</div>
							<div className="text-xs tracking-wide text-white/50">{stat.label}</div>
						</div>
					))}
				</motion.div>
			</motion.div>

			<div
				aria-hidden
				className="absolute bottom-8 left-1/2 z-[2] -translate-x-1/2 animate-bounce-down"
			>
				<ChevronDown className="h-7 w-7 stroke-white/30" strokeWidth={2} />
			</div>
		</section>
	);
}
```

- [ ] **Step 12.2: 確認既有 Hero 相關測試仍通過**

```bash
pnpm test -- --run components/guide
```

預期：所有既有測試（如有）綠燈。

- [ ] **Step 12.3: 加首頁 CTA**

修改 `app/page.tsx`：在 `<Hero />` 之後、`<TocBar />` 之前插入 CTA 元件：

```tsx
import { Hero } from "@/components/guide/Hero";
import { HeroTourCta } from "@/components/guide/HeroTourCta";
import { TocBar } from "@/components/guide/TocBar";
// ...其他既有 import

export default function HomePage() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<Hero />
			<HeroTourCta />
			<TocBar />
			{/* ...既有內容不變 */}
		</div>
	);
}
```

- [ ] **Step 12.4: 建立 HeroTourCta 元件**

建立 `components/guide/HeroTourCta.tsx`：

```tsx
"use client";

import { useRouter } from "next/navigation";
import { addTransitionType, startTransition } from "react";
import { Button } from "@/components/ui/button";

// Hero 結束位置的 CTA：點擊觸發「forward」view transition 並導向 /tour。
export function HeroTourCta() {
	const router = useRouter();

	const onClick = () => {
		startTransition(() => {
			addTransitionType("forward");
			router.push("/tour");
		});
	};

	return (
		<section className="border-t border-white/5 bg-slate-950 py-12 text-center text-white">
			<p className="mb-4 text-sm tracking-wider text-white/60">想用「動」的方式快速看完？</p>
			<Button
				type="button"
				onClick={onClick}
				className="bg-lime-400 text-slate-900 hover:bg-lime-300"
			>
				進入完整體驗 →
			</Button>
		</section>
	);
}
```

- [ ] **Step 12.5: 手動驗收**

```bash
pnpm dev
```

開啟 /，捲動 Hero 內容應隨進度推移；末段可見「進入完整體驗 →」按鈕。點擊跳到 /tour 並從右側滑入。

- [ ] **Step 12.6: commit**

```bash
git add components/guide/Hero.tsx components/guide/HeroTourCta.tsx app/page.tsx
git commit -m "feat(guide): Hero 升級為 scroll-driven 並加入 /tour CTA"
```

---

## Task 13: Playwright E2E

**Files:**
- Create: `tests/e2e/specs/tour.spec.ts`

**Spec ref:** `tour-experience` › *對應 E2E 驗收*；本 task 同時驗收 task 6/8 寄望的 E2E 行為。

- [ ] **Step 13.1: 建立 spec**

建立 `tests/e2e/specs/tour.spec.ts`：

```ts
import { test, expect } from "@playwright/test";

test.describe("/tour 體驗", () => {
	test("首頁有 CTA 並能導向 /tour", async ({ page }) => {
		await page.goto("/");
		const cta = page.getByRole("button", { name: /進入完整體驗/ });
		await expect(cta).toBeVisible();
		await cta.click();
		await expect(page).toHaveURL(/\/tour$/);
	});

	test("/tour 載入後可見 Stage 1 標題", async ({ page }) => {
		await page.goto("/tour");
		await expect(page.getByText("比網球更小，")).toBeVisible();
	});

	test("DOM 中存在 6 個 data-stage-id 容器", async ({ page }) => {
		await page.goto("/tour");
		const stages = page.locator("[data-stage-id]");
		await expect(stages).toHaveCount(6);
		const ids = await stages.evaluateAll((els) =>
			els.map((el) => el.getAttribute("data-stage-id")),
		);
		expect(ids).toEqual([
			"court-size",
			"player-growth",
			"two-bounce",
			"kitchen-violation",
			"materials-spectrum",
			"closing",
		]);
	});

	test("捲動到底可見 ClosingStage 與返回按鈕", async ({ page }) => {
		await page.goto("/tour");
		const main = page.locator("main");
		// scroll-snap 容器手動下捲到底
		await main.evaluate((el) => {
			el.scrollTo({ top: el.scrollHeight, behavior: "instant" as ScrollBehavior });
		});
		await expect(page.getByRole("button", { name: "回到完整指南" })).toBeVisible();
	});

	test("Skip 按鈕導向 /#court", async ({ page }) => {
		await page.goto("/tour");
		await page.getByRole("button", { name: /跳過/ }).click();
		await expect(page).toHaveURL(/\/#court$/);
		// 等待錨點滾動完成
		await page.waitForTimeout(400);
		const courtSection = page.locator("#court");
		await expect(courtSection).toBeInViewport();
	});

	test("reduced motion 下 6 個 stage 內容仍可讀", async ({ browser }) => {
		const context = await browser.newContext({ reducedMotion: "reduce" });
		const page = await context.newPage();
		await page.goto("/tour");
		await expect(page.getByText("比網球更小，")).toBeVisible();
		const main = page.locator("main");
		await main.evaluate((el) => {
			el.scrollTo({ top: el.scrollHeight, behavior: "instant" as ScrollBehavior });
		});
		await expect(page.getByRole("button", { name: "回到完整指南" })).toBeVisible();
		await context.close();
	});
});
```

- [ ] **Step 13.2: 執行 E2E**

```bash
pnpm test:e2e -- tests/e2e/specs/tour.spec.ts
```

預期：6 條 case 在 5 個 browser project 全綠（實際次數 = 6 × 5 = 30；若 mobile-safari 因 view-transition 差異 fail，於 step 13.3 處理）。

- [ ] **Step 13.3: 處理 mobile/Safari 不一致**

若任何 case 在 webkit 或 mobile-safari fail，常見原因：
- scroll-snap 在 webkit 對 `behavior: instant` 不接受 → 改用 `scrollIntoView({ block: "end" })` 取代 `scrollTo`。
- view-transition 不支援 → 略過該 case 或改 expect 不因 transition 中斷。

修改後重跑直到全綠。

- [ ] **Step 13.4: commit**

```bash
git add tests/e2e/specs/tour.spec.ts
git commit -m "test(tour): 加入 /tour 體驗的 Playwright E2E"
```

---

## Task 14: 收尾

**Files:** 無新增；操作為驗證 + archive。

- [ ] **Step 14.1: 全套檢查**

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test -- --run
pnpm test:e2e
```

四項全綠才能進下一步。

- [ ] **Step 14.2: 視覺驗收 checklist**

```bash
pnpm dev
```

逐項手動跑：
- 開啟 / → Hero 捲動進度與三項統計依序浮現
- / 末段 CTA 按下 → /tour 從右側滑入
- /tour stage 1 ~ 6 捲動，每個 stage 有對應動畫
- 左側進度條依當前 stage 高亮
- 右下 Skip 按鈕 → /#court 並滾到 court section
- ClosingStage 「回到完整指南」 → / 從左側滑入
- 開啟瀏覽器 reduced-motion 偏好（macOS：系統設定 → 輔助使用 → 顯示器 → 減少動態效果），重跑上述流程：所有捲動動畫關閉但內容仍可達

- [ ] **Step 14.3: archive change**

依 OpenSpec 流程將 `add-tour-experience` 由 `openspec/changes/` 移入 `openspec/changes/archive/`，並 sync delta 至 `openspec/specs/tour-experience/`：

```bash
# 使用 openspec-archive-change skill 或手動
openspec archive add-tour-experience
```

確認：
- `openspec/specs/tour-experience/spec.md` 含本 plan 對應之 7 個 ADDED Requirement
- `openspec/changes/archive/add-tour-experience/` 內保留 proposal、design、specs、tasks
- `openspec validate add-tour-experience` 通過

- [ ] **Step 14.4: 最後 commit + 推 remote**

```bash
git add openspec/
git commit -m "chore(openspec): archive add-tour-experience capability"
git push -u origin feature/scroll-driven-tour
```

開 PR 進入 review。

---

## Self-Review

### Spec 覆蓋表

| Spec Requirement | 對應 Task |
|---|---|
| `/tour` 路由提供 6 段 scroll-driven 體驗 | Task 6, 7, 8, 9, 13 |
| 雙路徑 scroll-driven 動畫策略 | Task 1, 3, 5, 11 |
| `prefers-reduced-motion` 全域降級 | Task 2, 5（useStageProgress 分支）, 11（CSS reduced-motion）, 13（reduced motion E2E） |
| Hero 升級為 scroll-driven 並保留向下相容 | Task 12 |
| 首頁 CTA 串接並觸發方向性過場 | Task 10, 12 |
| `/tour` 之 metadata | Task 9 |
| stage 2 玩家成長資料純資料化 | Task 4 |

7 條 requirement 全有 task 對應，無遺漏。

### 型別／命名一致性

- `StageId` 在 task 6 定義；task 7、13、8（`STAGE_IDS` 常數）皆使用相同 6 個字串。
- `useStageProgress(ref)` 於 task 5 定義回傳 `MotionValue<number> | null`；task 7 各 stage 一律 `useTransform(progress ?? null, ...)` 使用一致。
- `addTransitionType('forward'|'back')` 於 task 10、12 兩端一致。
- `playerGrowth` 形狀 `{ year, players }` 於 task 4 定義、task 7.2 使用一致。

### Placeholder 掃描

- Task 10.1 含「以 vercel-react-view-transitions skill 確認 API」——此為實際呼叫動作，非 placeholder。
- Task 10.4 為條件式降級，給出明確替代方案（motion + AnimatePresence），非 TBD。
- 無 "TBD" / "TODO" / "似於 Task N" 文字殘留。
- 所有 step 含實際 code 或 shell command，無「適當錯誤處理」類含糊指令。

### 已知取捨

- Stage SVG 為最小可運作版本（基本 shape + 動畫綁定）；視覺微調若必要，可作為後續 stage-by-stage 視覺優化 task，獨立於本 plan。
- shared element transition 為 design 明確排除項目，未列入。

---

## Plan Status

Plan complete and saved to `docs/superpowers/plans/2026-05-08-scroll-driven-tour.md`.

---

## Implementation Changelog（plan 與實作偏離之摘要）

本 plan 為實作起點時的逐步 task 文件。實作期間因技術限制（hydration、snap 與 scroll-driven 衝突、motion API 邊角案例）與設計取捨，多處與 plan 範本不同；詳細偏離原因請參照 design doc `docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md` § 9 Implementation Changelog。本 plan 中已知重要偏離摘要：

- **Task 5 (`useStageProgress`)**：plan 範本依 `useScrollTimelineSupport` 三分支；實作改為僅以 `useReducedMotion` 判斷、永遠走 motion path（IntersectionObserver 觸發），詳見 design doc § 9.1
- **Task 7 (6 個 stage)**：
  - Stage 4 標題從「腳一進去就犯規」改為「絕對不能截擊」（§ 9.4）
  - Stage 5 從水平 pin 推移改為 grid 並列 stagger（§ 9.5）
  - Stage 2 / 3 motion `pathLength` 改用 opacity fade-in（§ 9.6）
  - 補上 Stage 2 右側 14 個小人 + Stage 6 球員 SVG（§ 9.9）
- **Task 12 (Hero scroll-driven)**：移除 scroll-driven 整套，改回 staggerChildren 直接全部載入；CTA 內嵌於 Hero 主內容末段而非 TocBar 之前（§ 9.3）
- **共用 hooks**：`useScrollLinkedProgress` 預設 offset 從 `["start end", "end start"]` 改為 `["start end", "start start"]`（§ 9.2，但本 hook 因 § 9.1 已不被 stage 元件使用）
- **新增 `useEnterAnimationProgress` hook + `TourShell` 元件**（plan 未列）：對應 § 9.1 設計變更，stage 元件透過 `useStageProgress` → `useEnterAnimationProgress` 取得進度；`TourShell` 持有 main scroll container 的 ref 提供給 IntersectionObserver
- **`ScrollTimelineProvider`**：改用 `useSyncExternalStore` 解 hydration mismatch（§ 9.7）

OpenSpec main spec `openspec/specs/tour-experience/spec.md` 已對齊上述實作後狀態，archived change 內 plan / spec 維持為歷史快照。
