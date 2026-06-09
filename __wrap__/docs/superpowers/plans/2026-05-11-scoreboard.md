# Scoreboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 nextjs-pickball 加入 `/scoreboard` 計分器頁面與全域 Navbar，使用者可在桌機與手機（橫/直式皆可）依匹克球 Traditional 規則完成單/雙打計分。

**Architecture:** 純客戶端、`useReducer` + zod-validated localStorage 為狀態核心；規則邏輯為純函式以利 TDD；UI 拆為 7 個小元件，由 `Scoreboard.tsx` 組合。全域 Navbar 掛在 `app/layout.tsx`，整合既有 view transition。

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript（strict + verbatimModuleSyntax）· Tailwind v4 · shadcn/ui · zod 4.4.3 · Vitest + happy-dom · Playwright

**Spec:** `docs/superpowers/specs/2026-05-11-scoreboard-design.md`

**Conventions（從既有 codebase 抽取，全程遵守）：**
- Tab 縮排
- 字串用雙引號
- 測試檔案明確 `import { describe, it, expect } from "vitest"`（即使 globals 開啟）
- 純資料型別優先用 `import type`
- 純客戶端元件須加 `"use client"`
- 中文註解、英文程式碼命名

---

## Phase 1 · 純邏輯層（types / rules / reducer / storage）

### Task 1: 建立 types.ts（zod schemas + inferred types）

**Files:**
- Create: `lib/scoreboard/types.ts`

- [x] **Step 1: 建立 types.ts**

```ts
// lib/scoreboard/types.ts
import { z } from "zod";

export const ModeSchema = z.enum(["singles", "doubles"]);
export const TeamSchema = z.enum(["us", "them"]);
export const StatusSchema = z.enum(["setup", "playing", "finished"]);
export const ServerNumberSchema = z.union([z.literal(1), z.literal(2)]);
export const ServeSideSchema = z.enum(["right", "left"]);

export const ScoreEventSchema = z.object({
	type: z.literal("RALLY_WON"),
	winner: TeamSchema,
});

export const ScoreboardStateSchema = z.object({
	mode: ModeSchema,
	scores: z.object({
		us: z.number().int().nonnegative(),
		them: z.number().int().nonnegative(),
	}),
	servingTeam: TeamSchema,
	serverNumber: ServerNumberSchema,
	isFirstServiceOfGame: z.boolean(),
	history: z.array(ScoreEventSchema),
	status: StatusSchema,
	winner: TeamSchema.nullable(),
});

export type Mode = z.infer<typeof ModeSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Status = z.infer<typeof StatusSchema>;
export type ServerNumber = z.infer<typeof ServerNumberSchema>;
export type ServeSide = z.infer<typeof ServeSideSchema>;
export type ScoreEvent = z.infer<typeof ScoreEventSchema>;
export type ScoreboardState = z.infer<typeof ScoreboardStateSchema>;

// Action 為純記憶體型別，不會落 localStorage，無需 zod 驗證
export type Action =
	| { type: "SET_MODE"; mode: Mode }
	| { type: "SET_FIRST_SERVER"; team: Team }
	| { type: "RALLY_WON"; winner: Team }
	| { type: "UNDO" }
	| { type: "RESET" }
	| { type: "HYDRATE"; state: ScoreboardState };
```

- [x] **Step 2: TypeCheck 確認無錯**

Run: `pnpm tsc --noEmit`
Expected: 無錯（可能有現存非相關警告，本 task 新增的 types.ts 應 pass）

- [x] **Step 3: Commit**

```bash
git add lib/scoreboard/types.ts
git commit -m "feat(scoreboard): 建立 zod schema 與 inferred types"
```

---

### Task 2: rules.ts — getServeSide

**Files:**
- Create: `lib/scoreboard/rules.test.ts`
- Create: `lib/scoreboard/rules.ts`

- [x] **Step 1: 寫失敗測試**

```ts
// lib/scoreboard/rules.test.ts
import { describe, it, expect } from "vitest";
import { getServeSide } from "./rules";

describe("getServeSide", () => {
	it("發球方分數偶數時從右場發", () => {
		expect(getServeSide(0)).toBe("right");
		expect(getServeSide(2)).toBe("right");
		expect(getServeSide(10)).toBe("right");
	});

	it("發球方分數奇數時從左場發", () => {
		expect(getServeSide(1)).toBe("left");
		expect(getServeSide(3)).toBe("left");
		expect(getServeSide(9)).toBe("left");
	});
});
```

- [x] **Step 2: Run red**

Run: `pnpm test -- --run lib/scoreboard/rules.test.ts`
Expected: FAIL（`Cannot find module './rules'` 或 `getServeSide is not a function`）

- [x] **Step 3: 最小實作**

```ts
// lib/scoreboard/rules.ts
import type { ServeSide } from "./types";

// 發球位置：發球方當局分數偶數 → 右場，奇數 → 左場
export function getServeSide(servingTeamScore: number): ServeSide {
	return servingTeamScore % 2 === 0 ? "right" : "left";
}
```

- [x] **Step 4: Run green**

Run: `pnpm test -- --run lib/scoreboard/rules.test.ts`
Expected: PASS 2 tests

- [x] **Step 5: Commit**

```bash
git add lib/scoreboard/rules.ts lib/scoreboard/rules.test.ts
git commit -m "feat(scoreboard): 加入 getServeSide 純函式"
```

---

### Task 3: rules.ts — isGameWon

**Files:**
- Modify: `lib/scoreboard/rules.test.ts`
- Modify: `lib/scoreboard/rules.ts`

- [x] **Step 1: 加失敗測試**

於 `rules.test.ts` 檔尾追加：

```ts
import { isGameWon } from "./rules";

describe("isGameWon", () => {
	it("任一方未達 11 → 未贏", () => {
		expect(isGameWon({ us: 10, them: 9 })).toEqual({ won: false, winner: null });
		expect(isGameWon({ us: 0, them: 0 })).toEqual({ won: false, winner: null });
	});

	it("達 11 但差距未滿 2 → 未贏（延長賽）", () => {
		expect(isGameWon({ us: 11, them: 10 })).toEqual({ won: false, winner: null });
		expect(isGameWon({ us: 12, them: 11 })).toEqual({ won: false, winner: null });
	});

	it("達 11 且差距 ≥ 2 → 我方贏", () => {
		expect(isGameWon({ us: 11, them: 9 })).toEqual({ won: true, winner: "us" });
		expect(isGameWon({ us: 13, them: 11 })).toEqual({ won: true, winner: "us" });
	});

	it("對方達 11 且差距 ≥ 2 → 對方贏", () => {
		expect(isGameWon({ us: 7, them: 11 })).toEqual({ won: true, winner: "them" });
	});
});
```

- [x] **Step 2: Run red**

Run: `pnpm test -- --run lib/scoreboard/rules.test.ts`
Expected: FAIL（`isGameWon is not a function`）

- [x] **Step 3: 加實作**

於 `rules.ts` 檔尾追加：

```ts
import type { Team } from "./types";

// 勝利判定：任一方達 11 分且差距 ≥ 2
export function isGameWon(scores: { us: number; them: number }): {
	won: boolean;
	winner: Team | null;
} {
	const { us, them } = scores;
	const max = Math.max(us, them);
	if (max < 11) return { won: false, winner: null };
	const diff = Math.abs(us - them);
	if (diff < 2) return { won: false, winner: null };
	return { won: true, winner: us > them ? "us" : "them" };
}
```

- [x] **Step 4: Run green**

Run: `pnpm test -- --run lib/scoreboard/rules.test.ts`
Expected: PASS 6 tests

- [x] **Step 5: Commit**

```bash
git add lib/scoreboard/rules.ts lib/scoreboard/rules.test.ts
git commit -m "feat(scoreboard): 加入 isGameWon 勝利判定"
```

---

### Task 4: rules.ts — applyRallyResult（單打）

**Files:**
- Modify: `lib/scoreboard/rules.test.ts`
- Modify: `lib/scoreboard/rules.ts`

- [ ] **Step 1: 加失敗測試**

於 `rules.test.ts` 檔尾追加：

```ts
import { applyRallyResult } from "./rules";
import type { ScoreboardState } from "./types";

function singlesInitial(overrides: Partial<ScoreboardState> = {}): ScoreboardState {
	return {
		mode: "singles",
		scores: { us: 0, them: 0 },
		servingTeam: "us",
		serverNumber: 1,
		isFirstServiceOfGame: false,
		history: [],
		status: "setup",
		winner: null,
		...overrides,
	};
}

describe("applyRallyResult — 單打", () => {
	it("發球方贏 → 該方 +1，發球權不變", () => {
		const state = singlesInitial();
		const next = applyRallyResult(state, "us");
		expect(next.scores).toEqual({ us: 1, them: 0 });
		expect(next.servingTeam).toBe("us");
		expect(next.serverNumber).toBe(1);
	});

	it("接發方贏 → side-out，雙方分數不變", () => {
		const state = singlesInitial({ scores: { us: 3, them: 2 } });
		const next = applyRallyResult(state, "them");
		expect(next.scores).toEqual({ us: 3, them: 2 });
		expect(next.servingTeam).toBe("them");
		expect(next.serverNumber).toBe(1);
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run lib/scoreboard/rules.test.ts`
Expected: FAIL

- [ ] **Step 3: 加實作**

於 `rules.ts` 檔尾追加：

```ts
// 套用一次 rally 結果，回傳更新後 state（不變更傳入物件）
export function applyRallyResult(
	state: ScoreboardState,
	rallyWinner: Team,
): ScoreboardState {
	// 發球方贏 → 該方 +1，發球權不變
	if (rallyWinner === state.servingTeam) {
		return {
			...state,
			scores: { ...state.scores, [rallyWinner]: state.scores[rallyWinner] + 1 },
			isFirstServiceOfGame: false,
		};
	}
	// 接發方贏 → side-out（單打恒 side-out；雙打分支於下一個 task 加）
	return {
		...state,
		servingTeam: rallyWinner,
		serverNumber: 1,
		isFirstServiceOfGame: false,
	};
}
```

並於 `rules.ts` 頂部追加：

```ts
import type { ScoreboardState } from "./types";
```

- [ ] **Step 4: Run green**

Run: `pnpm test -- --run lib/scoreboard/rules.test.ts`
Expected: PASS 8 tests

- [ ] **Step 5: Commit**

```bash
git add lib/scoreboard/rules.ts lib/scoreboard/rules.test.ts
git commit -m "feat(scoreboard): 加入 applyRallyResult 單打規則"
```

---

### Task 5: rules.ts — applyRallyResult（雙打標準輪換）

**Files:**
- Modify: `lib/scoreboard/rules.test.ts`
- Modify: `lib/scoreboard/rules.ts`

- [ ] **Step 1: 加失敗測試**

於 `rules.test.ts` 檔尾追加：

```ts
function doublesPlaying(overrides: Partial<ScoreboardState> = {}): ScoreboardState {
	return {
		mode: "doubles",
		scores: { us: 3, them: 2 },
		servingTeam: "us",
		serverNumber: 1,
		isFirstServiceOfGame: false,
		history: [],
		status: "playing",
		winner: null,
		...overrides,
	};
}

describe("applyRallyResult — 雙打標準輪換", () => {
	it("發球方 #1 輸 → 同隊 #2 接手", () => {
		const state = doublesPlaying({ serverNumber: 1 });
		const next = applyRallyResult(state, "them");
		expect(next.servingTeam).toBe("us");
		expect(next.serverNumber).toBe(2);
		expect(next.scores).toEqual({ us: 3, them: 2 });
	});

	it("發球方 #2 輸 → side-out 給對方，serverNumber 重置為 1", () => {
		const state = doublesPlaying({ serverNumber: 2 });
		const next = applyRallyResult(state, "them");
		expect(next.servingTeam).toBe("them");
		expect(next.serverNumber).toBe(1);
		expect(next.scores).toEqual({ us: 3, them: 2 });
	});

	it("發球方贏 → 該方 +1，serverNumber 不變（左右場由分數奇偶推導）", () => {
		const state = doublesPlaying({ serverNumber: 2 });
		const next = applyRallyResult(state, "us");
		expect(next.scores).toEqual({ us: 4, them: 2 });
		expect(next.servingTeam).toBe("us");
		expect(next.serverNumber).toBe(2);
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run lib/scoreboard/rules.test.ts`
Expected: FAIL（第一個雙打 test：期待 serverNumber=2 但實作回 1）

- [ ] **Step 3: 修改實作**

把 `rules.ts` 的 `applyRallyResult` 替換為：

```ts
export function applyRallyResult(
	state: ScoreboardState,
	rallyWinner: Team,
): ScoreboardState {
	// 發球方贏 → 該方 +1
	if (rallyWinner === state.servingTeam) {
		return {
			...state,
			scores: { ...state.scores, [rallyWinner]: state.scores[rallyWinner] + 1 },
			isFirstServiceOfGame: false,
		};
	}
	// 接發方贏
	// 雙打 + 非開賽起手 + 目前是 #1 → 同隊 #2 接手
	if (
		state.mode === "doubles" &&
		!state.isFirstServiceOfGame &&
		state.serverNumber === 1
	) {
		return {
			...state,
			serverNumber: 2,
			isFirstServiceOfGame: false,
		};
	}
	// 其餘情況 → side-out
	return {
		...state,
		servingTeam: rallyWinner,
		serverNumber: 1,
		isFirstServiceOfGame: false,
	};
}
```

- [ ] **Step 4: Run green**

Run: `pnpm test -- --run lib/scoreboard/rules.test.ts`
Expected: PASS 11 tests

- [ ] **Step 5: Commit**

```bash
git add lib/scoreboard/rules.ts lib/scoreboard/rules.test.ts
git commit -m "feat(scoreboard): 加入 applyRallyResult 雙打標準輪換"
```

---

### Task 6: rules.ts — applyRallyResult（0-0-2 起手規則）

**Files:**
- Modify: `lib/scoreboard/rules.test.ts`

- [ ] **Step 1: 加失敗測試**

於 `rules.test.ts` 檔尾追加：

```ts
describe("applyRallyResult — 雙打 0-0-2 起手", () => {
	it("開賽方輸（isFirstServiceOfGame=true, serverNumber=2）→ 直接 side-out", () => {
		const state: ScoreboardState = {
			mode: "doubles",
			scores: { us: 0, them: 0 },
			servingTeam: "us",
			serverNumber: 2,
			isFirstServiceOfGame: true,
			history: [],
			status: "setup",
			winner: null,
		};
		const next = applyRallyResult(state, "them");
		expect(next.servingTeam).toBe("them");
		expect(next.serverNumber).toBe(1);
		expect(next.isFirstServiceOfGame).toBe(false);
	});

	it("開賽方贏 → +1，isFirstServiceOfGame 變 false", () => {
		const state: ScoreboardState = {
			mode: "doubles",
			scores: { us: 0, them: 0 },
			servingTeam: "us",
			serverNumber: 2,
			isFirstServiceOfGame: true,
			history: [],
			status: "setup",
			winner: null,
		};
		const next = applyRallyResult(state, "us");
		expect(next.scores).toEqual({ us: 1, them: 0 });
		expect(next.serverNumber).toBe(2);
		expect(next.isFirstServiceOfGame).toBe(false);
	});
});
```

- [ ] **Step 2: Run green（測試應已通過，因 Task 5 實作的 if 順序已涵蓋此規則）**

Run: `pnpm test -- --run lib/scoreboard/rules.test.ts`
Expected: PASS 13 tests

> 註：if 條件 `!state.isFirstServiceOfGame && state.serverNumber === 1` 在 isFirstService=true 時自動跳過「同隊 #2 接手」分支，落入 side-out。這是 Task 5 實作刻意保留的對齊。

- [ ] **Step 3: Commit**

```bash
git add lib/scoreboard/rules.test.ts
git commit -m "test(scoreboard): 補上 0-0-2 起手規則覆蓋測試"
```

---

### Task 7: reducer — initial state helper + SET_MODE / SET_FIRST_SERVER

**Files:**
- Create: `lib/scoreboard/reducer.test.ts`
- Create: `lib/scoreboard/reducer.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// lib/scoreboard/reducer.test.ts
import { describe, it, expect } from "vitest";
import { scoreboardReducer, createInitialState } from "./reducer";
import type { ScoreboardState } from "./types";

describe("createInitialState", () => {
	it("預設為雙打、我方先發、0-0-2 起手", () => {
		const state = createInitialState();
		expect(state.mode).toBe("doubles");
		expect(state.servingTeam).toBe("us");
		expect(state.serverNumber).toBe(2);
		expect(state.isFirstServiceOfGame).toBe(true);
		expect(state.status).toBe("setup");
		expect(state.scores).toEqual({ us: 0, them: 0 });
		expect(state.history).toEqual([]);
		expect(state.winner).toBeNull();
	});

	it("可傳入 mode 與 firstServer 客製", () => {
		const state = createInitialState({ mode: "singles", firstServer: "them" });
		expect(state.mode).toBe("singles");
		expect(state.servingTeam).toBe("them");
		expect(state.serverNumber).toBe(1);
		expect(state.isFirstServiceOfGame).toBe(false);
	});
});

describe("scoreboardReducer — SET_MODE / SET_FIRST_SERVER", () => {
	it("setup 階段可切換 mode；切換到 singles 時 serverNumber=1、isFirstService=false", () => {
		const state = createInitialState();
		const next = scoreboardReducer(state, { type: "SET_MODE", mode: "singles" });
		expect(next.mode).toBe("singles");
		expect(next.serverNumber).toBe(1);
		expect(next.isFirstServiceOfGame).toBe(false);
	});

	it("setup 階段可切換 firstServer", () => {
		const state = createInitialState();
		const next = scoreboardReducer(state, {
			type: "SET_FIRST_SERVER",
			team: "them",
		});
		expect(next.servingTeam).toBe("them");
	});

	it("playing 階段 ignore SET_MODE", () => {
		const state: ScoreboardState = { ...createInitialState(), status: "playing" };
		const next = scoreboardReducer(state, { type: "SET_MODE", mode: "singles" });
		expect(next).toBe(state);
	});

	it("playing 階段 ignore SET_FIRST_SERVER", () => {
		const state: ScoreboardState = { ...createInitialState(), status: "playing" };
		const next = scoreboardReducer(state, {
			type: "SET_FIRST_SERVER",
			team: "them",
		});
		expect(next).toBe(state);
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run lib/scoreboard/reducer.test.ts`
Expected: FAIL（`Cannot find module './reducer'`）

- [ ] **Step 3: 最小實作**

```ts
// lib/scoreboard/reducer.ts
import type { Action, Mode, ScoreboardState, Team } from "./types";

export function createInitialState(
	overrides: { mode?: Mode; firstServer?: Team } = {},
): ScoreboardState {
	const mode: Mode = overrides.mode ?? "doubles";
	const firstServer: Team = overrides.firstServer ?? "us";
	const isDoubles = mode === "doubles";
	return {
		mode,
		scores: { us: 0, them: 0 },
		servingTeam: firstServer,
		serverNumber: isDoubles ? 2 : 1,
		isFirstServiceOfGame: isDoubles,
		history: [],
		status: "setup",
		winner: null,
	};
}

export function scoreboardReducer(
	state: ScoreboardState,
	action: Action,
): ScoreboardState {
	switch (action.type) {
		case "SET_MODE": {
			if (state.status !== "setup") return state;
			return createInitialState({
				mode: action.mode,
				firstServer: state.servingTeam,
			});
		}
		case "SET_FIRST_SERVER": {
			if (state.status !== "setup") return state;
			return createInitialState({
				mode: state.mode,
				firstServer: action.team,
			});
		}
		default:
			return state;
	}
}
```

- [ ] **Step 4: Run green**

Run: `pnpm test -- --run lib/scoreboard/reducer.test.ts`
Expected: PASS 6 tests

- [ ] **Step 5: Commit**

```bash
git add lib/scoreboard/reducer.ts lib/scoreboard/reducer.test.ts
git commit -m "feat(scoreboard): reducer 加入 setup toggle 與 initial state helper"
```

---

### Task 8: reducer — RALLY_WON action

**Files:**
- Modify: `lib/scoreboard/reducer.test.ts`
- Modify: `lib/scoreboard/reducer.ts`

- [ ] **Step 1: 加失敗測試**

於 `reducer.test.ts` 檔尾追加：

```ts
describe("scoreboardReducer — RALLY_WON", () => {
	it("首次 RALLY_WON 從 setup → playing 並記錄 history", () => {
		const state = createInitialState();
		const next = scoreboardReducer(state, { type: "RALLY_WON", winner: "us" });
		expect(next.status).toBe("playing");
		expect(next.scores).toEqual({ us: 1, them: 0 });
		expect(next.history).toEqual([{ type: "RALLY_WON", winner: "us" }]);
	});

	it("達到勝利條件時 → status=finished, winner 設定", () => {
		const state: ScoreboardState = {
			...createInitialState({ mode: "singles" }),
			scores: { us: 10, them: 5 },
			status: "playing",
		};
		const next = scoreboardReducer(state, { type: "RALLY_WON", winner: "us" });
		expect(next.status).toBe("finished");
		expect(next.winner).toBe("us");
		expect(next.scores).toEqual({ us: 11, them: 5 });
	});

	it("finished 後 RALLY_WON 被 ignore", () => {
		const state: ScoreboardState = {
			...createInitialState(),
			status: "finished",
			winner: "us",
			scores: { us: 11, them: 7 },
		};
		const next = scoreboardReducer(state, { type: "RALLY_WON", winner: "them" });
		expect(next).toBe(state);
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run lib/scoreboard/reducer.test.ts`
Expected: FAIL

- [ ] **Step 3: 加實作**

在 `reducer.ts` 頂部追加 import：

```ts
import { applyRallyResult, isGameWon } from "./rules";
```

在 `switch` 內加 case（放在 `SET_FIRST_SERVER` 後）：

```ts
		case "RALLY_WON": {
			if (state.status === "finished") return state;
			const afterRally = applyRallyResult(state, action.winner);
			const newHistory = [...state.history, { type: "RALLY_WON" as const, winner: action.winner }];
			const { won, winner } = isGameWon(afterRally.scores);
			return {
				...afterRally,
				history: newHistory,
				status: won ? "finished" : "playing",
				winner: won ? winner : null,
			};
		}
```

- [ ] **Step 4: Run green**

Run: `pnpm test -- --run lib/scoreboard/reducer.test.ts`
Expected: PASS 9 tests

- [ ] **Step 5: Commit**

```bash
git add lib/scoreboard/reducer.ts lib/scoreboard/reducer.test.ts
git commit -m "feat(scoreboard): reducer 加入 RALLY_WON 與勝利判定"
```

---

### Task 9: reducer — UNDO action（replay 重建）

**Files:**
- Modify: `lib/scoreboard/reducer.test.ts`
- Modify: `lib/scoreboard/reducer.ts`

- [ ] **Step 1: 加失敗測試**

於 `reducer.test.ts` 檔尾追加：

```ts
describe("scoreboardReducer — UNDO", () => {
	it("空 history 時 UNDO 不變 state", () => {
		const state = createInitialState();
		const next = scoreboardReducer(state, { type: "UNDO" });
		expect(next).toBe(state);
	});

	it("UNDO 後 state 等於少做一次 RALLY_WON 的結果", () => {
		const start = createInitialState();
		const afterOne = scoreboardReducer(start, { type: "RALLY_WON", winner: "us" });
		const afterTwo = scoreboardReducer(afterOne, { type: "RALLY_WON", winner: "us" });
		const undone = scoreboardReducer(afterTwo, { type: "UNDO" });
		expect(undone.scores).toEqual(afterOne.scores);
		expect(undone.servingTeam).toBe(afterOne.servingTeam);
		expect(undone.serverNumber).toBe(afterOne.serverNumber);
		expect(undone.history).toEqual(afterOne.history);
	});

	it("UNDO 退到開賽時 status 回到 setup", () => {
		const start = createInitialState();
		const afterOne = scoreboardReducer(start, { type: "RALLY_WON", winner: "us" });
		const undone = scoreboardReducer(afterOne, { type: "UNDO" });
		expect(undone.status).toBe("setup");
		expect(undone.history).toEqual([]);
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run lib/scoreboard/reducer.test.ts`
Expected: FAIL

- [ ] **Step 3: 加實作**

在 `reducer.ts` 的 `switch` 加 case（放在 `RALLY_WON` 後）：

```ts
		case "UNDO": {
			if (state.history.length === 0) return state;
			const newHistory = state.history.slice(0, -1);
			// 從目前的 mode 與最初發球方重建 initial，replay 剩餘事件
			const firstServer = inferFirstServerFromInitial(state);
			let rebuilt = createInitialState({ mode: state.mode, firstServer });
			for (const event of newHistory) {
				rebuilt = scoreboardReducer(rebuilt, event);
			}
			return rebuilt;
		}
```

並在 `reducer.ts` 檔尾加 helper：

```ts
// UNDO 用：從 state 推回原始的 firstServer。
// history 是空 → 直接拿目前 servingTeam（仍為原始設定，因 setup 尚未動作）。
// history 有值 → 拿 history[0].winner 反推：第一個 RALLY_WON 前必定是該方或對方發球。
// 由於我們只關心「重建初始 state」，最簡單做法是把 servingTeam 在 setup 時鎖在 state
// 中，但 setup 後 servingTeam 會變動，因此用以下保守邏輯：
// 若 history 為空 → 拿 state.servingTeam
// 若 history 有值 → 從 state.history 之前的「最後一次 setup 切換」推回，但我們沒有記錄。
// 折衷：reducer 不單獨追蹤；UNDO 全程改為從「儲存的最後一次 setup state」replay。
// 我們改用另一種策略：在 createInitialState 時把 firstServer 也鎖入 state 一份。
function inferFirstServerFromInitial(state: ScoreboardState): Team {
	// 若 history 為空，目前 servingTeam 即原始 firstServer
	if (state.history.length === 0) return state.servingTeam;
	// 否則：用 history 反推不可靠；改用「替代法」— 把 state 視為純由 RALLY_WON 累積，
	// 第一個 RALLY_WON 之前的 servingTeam 為 firstServer。
	// 但我們已遺失該資訊；解法：把 firstServer 加進 ScoreboardState 永久欄位。
	return state.servingTeam; // 暫時 fallback（測試會逼出問題）
}
```

> **注意：** 上面 helper 是不完整的。Step 4 的測試會逼出 bug，我們在 Step 5 修正設計。

- [ ] **Step 4: Run（部分失敗，故意暴露設計缺陷）**

Run: `pnpm test -- --run lib/scoreboard/reducer.test.ts`
Expected: 第二個 UNDO 測試可能 FAIL（從 `[RALLY_WON us, RALLY_WON us]` 退回需要正確的 firstServer，但 servingTeam 已變動）

- [ ] **Step 5: 修正設計 — 把 firstServer 加進 state 永久欄位**

修改 `lib/scoreboard/types.ts` 的 `ScoreboardStateSchema`，在 `winner` 後加：

```ts
	firstServer: TeamSchema,
```

修改 `lib/scoreboard/reducer.ts` 的 `createInitialState`：

```ts
export function createInitialState(
	overrides: { mode?: Mode; firstServer?: Team } = {},
): ScoreboardState {
	const mode: Mode = overrides.mode ?? "doubles";
	const firstServer: Team = overrides.firstServer ?? "us";
	const isDoubles = mode === "doubles";
	return {
		mode,
		scores: { us: 0, them: 0 },
		servingTeam: firstServer,
		serverNumber: isDoubles ? 2 : 1,
		isFirstServiceOfGame: isDoubles,
		history: [],
		status: "setup",
		winner: null,
		firstServer,
	};
}
```

把 `UNDO` case 簡化為：

```ts
		case "UNDO": {
			if (state.history.length === 0) return state;
			const newHistory = state.history.slice(0, -1);
			let rebuilt = createInitialState({
				mode: state.mode,
				firstServer: state.firstServer,
			});
			for (const event of newHistory) {
				rebuilt = scoreboardReducer(rebuilt, event);
			}
			return rebuilt;
		}
```

並刪除 `inferFirstServerFromInitial` helper。

修正 `SET_MODE` / `SET_FIRST_SERVER` 內部呼叫 `createInitialState` 時也應正確帶入 firstServer：

```ts
		case "SET_MODE": {
			if (state.status !== "setup") return state;
			return createInitialState({
				mode: action.mode,
				firstServer: state.firstServer,
			});
		}
		case "SET_FIRST_SERVER": {
			if (state.status !== "setup") return state;
			return createInitialState({
				mode: state.mode,
				firstServer: action.team,
			});
		}
```

更新 Task 7 的測試「可傳入 mode 與 firstServer 客製」需新增一行：

```ts
		expect(state.firstServer).toBe("them");
```

加在 `singlesInitial` 等 test helper 也需要補 `firstServer`，搜尋並補上：

```ts
firstServer: "us",
```

於 `singlesInitial`、`doublesPlaying` 中追加（在 `rules.test.ts` 也要補）。

- [ ] **Step 6: Run green**

Run: `pnpm test -- --run lib/scoreboard`
Expected: 所有 rules + reducer tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/scoreboard/
git commit -m "feat(scoreboard): reducer 加入 UNDO 並把 firstServer 持久化進 state"
```

---

### Task 10: reducer — RESET action

**Files:**
- Modify: `lib/scoreboard/reducer.test.ts`
- Modify: `lib/scoreboard/reducer.ts`

- [ ] **Step 1: 加失敗測試**

於 `reducer.test.ts` 檔尾追加：

```ts
describe("scoreboardReducer — RESET", () => {
	it("RESET 保留 mode 與 firstServer，清空分數與 history、status 回 setup", () => {
		const state: ScoreboardState = {
			...createInitialState({ mode: "singles", firstServer: "them" }),
			scores: { us: 11, them: 7 },
			status: "finished",
			winner: "us",
			history: [
				{ type: "RALLY_WON", winner: "us" },
				{ type: "RALLY_WON", winner: "us" },
			],
		};
		const next = scoreboardReducer(state, { type: "RESET" });
		expect(next.mode).toBe("singles");
		expect(next.firstServer).toBe("them");
		expect(next.servingTeam).toBe("them");
		expect(next.scores).toEqual({ us: 0, them: 0 });
		expect(next.status).toBe("setup");
		expect(next.winner).toBeNull();
		expect(next.history).toEqual([]);
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run lib/scoreboard/reducer.test.ts`
Expected: FAIL

- [ ] **Step 3: 加實作**

在 `reducer.ts` 的 `switch` 加 case：

```ts
		case "RESET": {
			return createInitialState({
				mode: state.mode,
				firstServer: state.firstServer,
			});
		}
```

並加 `HYDRATE` case（供 Phase 2 的 useScoreboardStore 使用）：

```ts
		case "HYDRATE": {
			return action.state;
		}
```

- [ ] **Step 4: Run green**

Run: `pnpm test -- --run lib/scoreboard/reducer.test.ts`
Expected: PASS（reducer 所有測試）

- [ ] **Step 5: Commit**

```bash
git add lib/scoreboard/reducer.ts lib/scoreboard/reducer.test.ts
git commit -m "feat(scoreboard): reducer 加入 RESET 與 HYDRATE"
```

---

### Task 11: storage.ts — read/write + 損壞資料 fallback

**Files:**
- Create: `lib/scoreboard/storage.test.ts`
- Create: `lib/scoreboard/storage.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// lib/scoreboard/storage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { readScoreboard, writeScoreboard, clearScoreboard, STORAGE_KEY } from "./storage";
import { createInitialState } from "./reducer";

describe("storage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("write 後 read 可取回相同 state", () => {
		const state = createInitialState();
		writeScoreboard(state);
		expect(readScoreboard()).toEqual(state);
	});

	it("無資料時 read 回 null", () => {
		expect(readScoreboard()).toBeNull();
	});

	it("資料為非 JSON 時 read 回 null 並清 key", () => {
		localStorage.setItem(STORAGE_KEY, "not-json");
		expect(readScoreboard()).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("資料 schema 不合法時 read 回 null 並清 key", () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: "invalid" }));
		expect(readScoreboard()).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("clearScoreboard 移除 key", () => {
		writeScoreboard(createInitialState());
		clearScoreboard();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run lib/scoreboard/storage.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作**

```ts
// lib/scoreboard/storage.ts
import { ScoreboardStateSchema, type ScoreboardState } from "./types";

export const STORAGE_KEY = "scoreboard:current:v1";

function hasLocalStorage(): boolean {
	try {
		return typeof window !== "undefined" && !!window.localStorage;
	} catch {
		return false;
	}
}

export function readScoreboard(): ScoreboardState | null {
	if (!hasLocalStorage()) return null;
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === null) return null;
	try {
		const parsed = JSON.parse(raw);
		const result = ScoreboardStateSchema.safeParse(parsed);
		if (!result.success) {
			console.warn("[scoreboard] localStorage schema invalid, clearing", result.error);
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}
		return result.data;
	} catch (err) {
		console.warn("[scoreboard] localStorage JSON parse failed, clearing", err);
		localStorage.removeItem(STORAGE_KEY);
		return null;
	}
}

export function writeScoreboard(state: ScoreboardState): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (err) {
		console.warn("[scoreboard] localStorage write failed", err);
	}
}

export function clearScoreboard(): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// 靜默
	}
}
```

- [ ] **Step 4: Run green**

Run: `pnpm test -- --run lib/scoreboard/storage.test.ts`
Expected: PASS 5 tests

- [ ] **Step 5: Commit**

```bash
git add lib/scoreboard/storage.ts lib/scoreboard/storage.test.ts
git commit -m "feat(scoreboard): localStorage I/O 含 zod schema 驗證"
```

---

## Phase 2 · Hooks

### Task 12: useScoreboardStore（reducer + localStorage 整合）

**Files:**
- Create: `hooks/useScoreboardStore.test.tsx`
- Create: `hooks/useScoreboardStore.ts`

- [ ] **Step 1: 寫失敗測試**

```tsx
// hooks/useScoreboardStore.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScoreboardStore } from "./useScoreboardStore";
import { STORAGE_KEY } from "@/lib/scoreboard/storage";

describe("useScoreboardStore", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("初始 state 為 createInitialState 結果", () => {
		const { result } = renderHook(() => useScoreboardStore());
		const [state] = result.current;
		expect(state.mode).toBe("doubles");
		expect(state.scores).toEqual({ us: 0, them: 0 });
	});

	it("dispatch RALLY_WON 後 state 與 localStorage 都更新", () => {
		const { result } = renderHook(() => useScoreboardStore());
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		expect(result.current[0].scores.us).toBe(1);
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored.scores.us).toBe(1);
	});

	it("已存在 localStorage 資料時，mount 後會 hydrate", () => {
		const seed = {
			mode: "singles",
			scores: { us: 5, them: 3 },
			servingTeam: "us",
			serverNumber: 1,
			isFirstServiceOfGame: false,
			history: [
				{ type: "RALLY_WON", winner: "us" },
				{ type: "RALLY_WON", winner: "us" },
			],
			status: "playing",
			winner: null,
			firstServer: "us",
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
		const { result } = renderHook(() => useScoreboardStore());
		// useEffect 在 first render 後 sync 執行
		expect(result.current[0].scores).toEqual({ us: 5, them: 3 });
		expect(result.current[0].status).toBe("playing");
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run hooks/useScoreboardStore.test.tsx`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作**

```ts
// hooks/useScoreboardStore.ts
"use client";

import { useEffect, useReducer } from "react";
import { createInitialState, scoreboardReducer } from "@/lib/scoreboard/reducer";
import { readScoreboard, writeScoreboard } from "@/lib/scoreboard/storage";
import type { Action, ScoreboardState } from "@/lib/scoreboard/types";

// 整合 reducer 與 localStorage：
// - 初始用 createInitialState 避免 SSR/CSR 不一致
// - mount 後 useEffect 讀 localStorage 並 dispatch HYDRATE
// - state 變動時 useEffect 寫回 localStorage
export function useScoreboardStore(): readonly [
	ScoreboardState,
	React.Dispatch<Action>,
] {
	const [state, dispatch] = useReducer(scoreboardReducer, undefined, createInitialState);

	useEffect(() => {
		const loaded = readScoreboard();
		if (loaded) dispatch({ type: "HYDRATE", state: loaded });
	}, []);

	useEffect(() => {
		writeScoreboard(state);
	}, [state]);

	return [state, dispatch] as const;
}
```

- [ ] **Step 4: Run green**

Run: `pnpm test -- --run hooks/useScoreboardStore.test.tsx`
Expected: PASS 3 tests

- [ ] **Step 5: Commit**

```bash
git add hooks/useScoreboardStore.ts hooks/useScoreboardStore.test.tsx
git commit -m "feat(scoreboard): useScoreboardStore 整合 reducer 與 localStorage"
```

---

### Task 13: useOrientation hook

**Files:**
- Create: `hooks/useOrientation.test.ts`
- Create: `hooks/useOrientation.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// hooks/useOrientation.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOrientation } from "./useOrientation";

describe("useOrientation", () => {
	it("橫向時回 'landscape'", () => {
		vi.spyOn(window, "matchMedia").mockImplementation(
			(query) =>
				({
					matches: query === "(orientation: landscape)",
					media: query,
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
				}) as unknown as MediaQueryList,
		);
		const { result } = renderHook(() => useOrientation());
		expect(result.current).toBe("landscape");
		vi.restoreAllMocks();
	});

	it("直向時回 'portrait'", () => {
		vi.spyOn(window, "matchMedia").mockImplementation(
			(query) =>
				({
					matches: false,
					media: query,
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
				}) as unknown as MediaQueryList,
		);
		const { result } = renderHook(() => useOrientation());
		expect(result.current).toBe("portrait");
		vi.restoreAllMocks();
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run hooks/useOrientation.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作（沿用 useReducedMotion 的 useSyncExternalStore 模式）**

```ts
// hooks/useOrientation.ts
import { useSyncExternalStore } from "react";

const QUERY = "(orientation: landscape)";

function subscribe(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	const mql = window.matchMedia(QUERY);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

function getClientSnapshot(): "landscape" | "portrait" {
	return window.matchMedia(QUERY).matches ? "landscape" : "portrait";
}

// server 端永遠回 portrait（行動裝置常見預設），與 client first render 對齊避免 hydration mismatch
function getServerSnapshot(): "portrait" {
	return "portrait";
}

// 偵測 viewport orientation；切換時自動 re-render
export function useOrientation(): "landscape" | "portrait" {
	return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
```

- [ ] **Step 4: Run green**

Run: `pnpm test -- --run hooks/useOrientation.test.ts`
Expected: PASS 2 tests

- [ ] **Step 5: Commit**

```bash
git add hooks/useOrientation.ts hooks/useOrientation.test.ts
git commit -m "feat(scoreboard): useOrientation 偵測 viewport 方向"
```

---

### Task 14: useFullscreen hook

**Files:**
- Create: `hooks/useFullscreen.test.ts`
- Create: `hooks/useFullscreen.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// hooks/useFullscreen.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFullscreen } from "./useFullscreen";

describe("useFullscreen", () => {
	it("supported=false 時 isSupported 為 false", () => {
		Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: false });
		const { result } = renderHook(() => useFullscreen());
		expect(result.current.isSupported).toBe(false);
	});

	it("supported=true 時可 toggle，並呼叫 requestFullscreen", async () => {
		Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
		const requestSpy = vi.fn(() => Promise.resolve());
		Object.defineProperty(document.documentElement, "requestFullscreen", {
			configurable: true,
			value: requestSpy,
		});
		Object.defineProperty(document, "fullscreenElement", {
			configurable: true,
			value: null,
		});
		const { result } = renderHook(() => useFullscreen());
		await act(async () => {
			await result.current.toggle();
		});
		expect(requestSpy).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run red**

Run: `pnpm test -- --run hooks/useFullscreen.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

```ts
// hooks/useFullscreen.ts
"use client";

import { useCallback, useEffect, useState } from "react";

interface UseFullscreenResult {
	isSupported: boolean;
	isFullscreen: boolean;
	toggle: () => Promise<void>;
}

// 封裝 Fullscreen API；iOS Safari 與舊瀏覽器不支援時 isSupported=false。
export function useFullscreen(): UseFullscreenResult {
	const isSupported =
		typeof document !== "undefined" && !!document.fullscreenEnabled;
	const [isFullscreen, setIsFullscreen] = useState(false);

	useEffect(() => {
		const onChange = () => setIsFullscreen(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", onChange);
		onChange();
		return () => document.removeEventListener("fullscreenchange", onChange);
	}, []);

	const toggle = useCallback(async () => {
		if (!isSupported) return;
		if (document.fullscreenElement) {
			await document.exitFullscreen();
		} else {
			await document.documentElement.requestFullscreen();
		}
	}, [isSupported]);

	return { isSupported, isFullscreen, toggle };
}
```

- [ ] **Step 4: Run green**

Run: `pnpm test -- --run hooks/useFullscreen.test.ts`
Expected: PASS 2 tests

- [ ] **Step 5: Commit**

```bash
git add hooks/useFullscreen.ts hooks/useFullscreen.test.ts
git commit -m "feat(scoreboard): useFullscreen 封裝 Fullscreen API"
```

---

## Phase 3 · shadcn 元件

### Task 15: 安裝 shadcn dialog / alert-dialog / select

**Files:**
- Create: `components/ui/dialog.tsx`
- Create: `components/ui/alert-dialog.tsx`
- Create: `components/ui/select.tsx`

- [ ] **Step 1: 用 shadcn CLI 安裝三個元件**

Run: `pnpm dlx shadcn@latest add dialog alert-dialog select`
Expected: 三個檔案被建立於 `components/ui/`，可能會自動安裝 `@radix-ui/react-dialog`、`@radix-ui/react-alert-dialog`、`@radix-ui/react-select`

- [ ] **Step 2: 驗證 build 沒壞**

Run: `pnpm tsc --noEmit`
Expected: 無錯

- [ ] **Step 3: Commit**

```bash
git add components/ui/dialog.tsx components/ui/alert-dialog.tsx components/ui/select.tsx package.json pnpm-lock.yaml
git commit -m "chore(deps): 加入 shadcn dialog/alert-dialog/select"
```

---

## Phase 4 · UI 元件（先小後大）

### Task 16: ServeIndicator

**Files:**
- Create: `components/scoreboard/ServeIndicator.tsx`

- [ ] **Step 1: 實作（純展示元件，無互動邏輯，不需 TDD）**

```tsx
// components/scoreboard/ServeIndicator.tsx
import { getServeSide } from "@/lib/scoreboard/rules";
import type { ServerNumber } from "@/lib/scoreboard/types";

interface ServeIndicatorProps {
	servingTeamScore: number;
	serverNumber: ServerNumber;
	showServerNumber: boolean; // 雙打才顯示
}

// 顯示 ● 與「Server #N · 左/右場」文字；展示用元件
export function ServeIndicator({
	servingTeamScore,
	serverNumber,
	showServerNumber,
}: ServeIndicatorProps) {
	const side = getServeSide(servingTeamScore);
	const sideLabel = side === "right" ? "右場" : "左場";
	return (
		<div className="flex items-center gap-2 text-sm text-muted-foreground">
			<span className="inline-block h-2 w-2 rounded-full bg-lime-400" aria-hidden />
			<span>
				{showServerNumber ? `Server #${serverNumber} · ` : ""}
				{sideLabel}
			</span>
		</div>
	);
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit`
Expected: 無錯

- [ ] **Step 3: Commit**

```bash
git add components/scoreboard/ServeIndicator.tsx
git commit -m "feat(scoreboard): ServeIndicator 顯示發球位置與發球員"
```

---

### Task 17: TeamPanel

**Files:**
- Create: `components/scoreboard/TeamPanel.tsx`

- [ ] **Step 1: 實作**

```tsx
// components/scoreboard/TeamPanel.tsx
"use client";

import { Button } from "@/components/ui/button";
import { ServeIndicator } from "@/components/scoreboard/ServeIndicator";
import { cn } from "@/lib/utils";
import type { ScoreboardState, Team } from "@/lib/scoreboard/types";

interface TeamPanelProps {
	team: Team;
	label: string;
	state: ScoreboardState;
	disabled: boolean;
	onWinRally: () => void;
}

// 單隊面板：分數、發球指示（僅當該隊在發球時顯示）、「贏這球+」按鈕
export function TeamPanel({ team, label, state, disabled, onWinRally }: TeamPanelProps) {
	const score = state.scores[team];
	const isServing = state.servingTeam === team;
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
			<div className="font-outfit text-sm uppercase tracking-[3px] text-muted-foreground">
				{label}
			</div>
			<div
				aria-live="polite"
				aria-label={`${label}目前 ${score} 分`}
				className={cn(
					"font-bebas-neue text-[10rem] leading-none md:text-[14rem]",
					isServing ? "text-lime-400" : "text-foreground",
				)}
			>
				{score}
			</div>
			{isServing && (
				<ServeIndicator
					servingTeamScore={score}
					serverNumber={state.serverNumber}
					showServerNumber={state.mode === "doubles"}
				/>
			)}
			<Button
				size="lg"
				disabled={disabled}
				onClick={onWinRally}
				aria-label={`${label}贏這一球，當前 ${score} 分`}
				className="bg-lime-400 text-slate-900 hover:bg-lime-300"
			>
				贏這球 +
			</Button>
		</div>
	);
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit`
Expected: 無錯

- [ ] **Step 3: Commit**

```bash
git add components/scoreboard/TeamPanel.tsx
git commit -m "feat(scoreboard): TeamPanel 單隊計分面板"
```

---

### Task 18: ScoreboardSetup（頂部 toggle）

**Files:**
- Create: `components/scoreboard/ScoreboardSetup.tsx`

- [ ] **Step 1: 實作**

```tsx
// components/scoreboard/ScoreboardSetup.tsx
"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize } from "lucide-react";
import type { Mode, Team } from "@/lib/scoreboard/types";

interface ScoreboardSetupProps {
	mode: Mode;
	firstServer: Team;
	locked: boolean;
	fullscreenSupported: boolean;
	isFullscreen: boolean;
	onModeChange: (mode: Mode) => void;
	onFirstServerChange: (team: Team) => void;
	onToggleFullscreen: () => void;
}

// 頂部設定列：mode 與 firstServer toggle，比賽中為 disabled；右側全螢幕按鈕
export function ScoreboardSetup({
	mode,
	firstServer,
	locked,
	fullscreenSupported,
	isFullscreen,
	onModeChange,
	onFirstServerChange,
	onToggleFullscreen,
}: ScoreboardSetupProps) {
	return (
		<div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
			<Select
				value={mode}
				onValueChange={(v) => onModeChange(v as Mode)}
				disabled={locked}
			>
				<SelectTrigger className="w-32" aria-label="比賽形式">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="doubles">雙打</SelectItem>
					<SelectItem value="singles">單打</SelectItem>
				</SelectContent>
			</Select>
			<Select
				value={firstServer}
				onValueChange={(v) => onFirstServerChange(v as Team)}
				disabled={locked}
			>
				<SelectTrigger className="w-36" aria-label="先發球方">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="us">先發：我方</SelectItem>
					<SelectItem value="them">先發：對方</SelectItem>
				</SelectContent>
			</Select>
			<div className="ml-auto">
				{fullscreenSupported && (
					<Button
						variant="outline"
						size="icon"
						onClick={onToggleFullscreen}
						aria-pressed={isFullscreen}
						aria-label={isFullscreen ? "退出全螢幕" : "進入全螢幕"}
					>
						{isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
					</Button>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit`
Expected: 無錯

- [ ] **Step 3: Commit**

```bash
git add components/scoreboard/ScoreboardSetup.tsx
git commit -m "feat(scoreboard): ScoreboardSetup 頂部 toggle 列"
```

---

### Task 19: ActionBar（Undo + Reset 含確認）

**Files:**
- Create: `components/scoreboard/ActionBar.tsx`

- [ ] **Step 1: 實作**

```tsx
// components/scoreboard/ActionBar.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Undo2, RotateCcw } from "lucide-react";

interface ActionBarProps {
	canUndo: boolean;
	onUndo: () => void;
	onReset: () => void;
}

export function ActionBar({ canUndo, onUndo, onReset }: ActionBarProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	return (
		<div className="flex items-center justify-center gap-4 border-t border-border px-4 py-3">
			<Button variant="outline" disabled={!canUndo} onClick={onUndo} aria-label="撤銷上一分">
				<Undo2 className="mr-2 size-4" />
				Undo
			</Button>
			<Button variant="outline" onClick={() => setConfirmOpen(true)} aria-label="重置比賽">
				<RotateCcw className="mr-2 size-4" />
				重置
			</Button>
			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>確定要重置比賽？</AlertDialogTitle>
						<AlertDialogDescription>
							目前的分數與發球紀錄將會清空，比賽回到 0-0 起手。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								onReset();
								setConfirmOpen(false);
							}}
						>
							確定重置
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit`
Expected: 無錯

- [ ] **Step 3: Commit**

```bash
git add components/scoreboard/ActionBar.tsx
git commit -m "feat(scoreboard): ActionBar 加入 Undo 與 Reset（含二次確認）"
```

---

### Task 20: OrientationHint（直式提示橫幅）

**Files:**
- Create: `components/scoreboard/OrientationHint.tsx`

- [ ] **Step 1: 實作**

```tsx
// components/scoreboard/OrientationHint.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const DISMISS_KEY = "scoreboard:hint-dismissed";

interface OrientationHintProps {
	visible: boolean; // 由父層依 orientation 決定
}

// 直式時顯示的提示橫幅；關閉狀態存 sessionStorage，分頁存活期間不再顯示
export function OrientationHint({ visible }: OrientationHintProps) {
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
	}, []);

	if (!visible || dismissed) return null;

	return (
		<div
			role="status"
			className="flex items-center justify-between gap-2 border-b border-lime-500/20 bg-lime-500/10 px-4 py-2 text-sm"
		>
			<span>💡 建議橫向使用，體驗更好</span>
			<Button
				variant="ghost"
				size="icon"
				aria-label="關閉提示"
				onClick={() => {
					sessionStorage.setItem(DISMISS_KEY, "1");
					setDismissed(true);
				}}
			>
				<X className="size-4" />
			</Button>
		</div>
	);
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit`
Expected: 無錯

- [ ] **Step 3: Commit**

```bash
git add components/scoreboard/OrientationHint.tsx
git commit -m "feat(scoreboard): OrientationHint 直式提示橫幅"
```

---

### Task 21: GameOverDialog

**Files:**
- Create: `components/scoreboard/GameOverDialog.tsx`

- [ ] **Step 1: 實作**

```tsx
// components/scoreboard/GameOverDialog.tsx
"use client";

import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ScoreboardState } from "@/lib/scoreboard/types";

interface GameOverDialogProps {
	state: ScoreboardState;
	onPlayAgain: () => void;
}

// 比賽結束時自動開啟；提供「再來一局」與「關閉」。
// 「關閉」用 dismissed 本地狀態暫時隱藏 dialog（仍保留 finished status 讓使用者檢視終局分數）；
// status 離開 finished 時 dismissed 自動 reset。
export function GameOverDialog({ state, onPlayAgain }: GameOverDialogProps) {
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		if (state.status !== "finished") setDismissed(false);
	}, [state.status]);

	const open = state.status === "finished" && !dismissed;
	const winnerLabel = state.winner === "us" ? "我方獲勝" : "對方獲勝";

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) setDismissed(true);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>🏆 {winnerLabel}</DialogTitle>
					<DialogDescription>
						{state.scores.us} – {state.scores.them}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setDismissed(true)}>
						關閉
					</Button>
					<Button
						onClick={() => {
							setDismissed(false);
							onPlayAgain();
						}}
					>
						再來一局
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit`
Expected: 無錯

- [ ] **Step 3: Commit**

```bash
git add components/scoreboard/GameOverDialog.tsx
git commit -m "feat(scoreboard): GameOverDialog 比賽結束彈窗"
```

---

### Task 22: Scoreboard 主容器（組合 + 橫直式排版）

**Files:**
- Create: `components/scoreboard/Scoreboard.tsx`

- [ ] **Step 1: 實作**

```tsx
// components/scoreboard/Scoreboard.tsx
"use client";

import { useScoreboardStore } from "@/hooks/useScoreboardStore";
import { useOrientation } from "@/hooks/useOrientation";
import { useFullscreen } from "@/hooks/useFullscreen";
import { ScoreboardSetup } from "@/components/scoreboard/ScoreboardSetup";
import { TeamPanel } from "@/components/scoreboard/TeamPanel";
import { ActionBar } from "@/components/scoreboard/ActionBar";
import { OrientationHint } from "@/components/scoreboard/OrientationHint";
import { GameOverDialog } from "@/components/scoreboard/GameOverDialog";
import { cn } from "@/lib/utils";

// 計分器主容器：組合所有子元件，依 orientation 切換橫/直式排版
export function Scoreboard() {
	const [state, dispatch] = useScoreboardStore();
	const orientation = useOrientation();
	const { isSupported, isFullscreen, toggle } = useFullscreen();

	const locked = state.status !== "setup";
	const buttonsDisabled = state.status === "finished";
	const isLandscape = orientation === "landscape";

	return (
		<div className="flex min-h-screen flex-col bg-background pt-14">
			<OrientationHint visible={!isLandscape} />
			<ScoreboardSetup
				mode={state.mode}
				firstServer={state.firstServer}
				locked={locked}
				fullscreenSupported={isSupported}
				isFullscreen={isFullscreen}
				onModeChange={(mode) => dispatch({ type: "SET_MODE", mode })}
				onFirstServerChange={(team) => dispatch({ type: "SET_FIRST_SERVER", team })}
				onToggleFullscreen={toggle}
			/>
			<div
				className={cn(
					"flex flex-1",
					isLandscape ? "flex-row divide-x" : "flex-col divide-y",
					"divide-border",
				)}
			>
				<TeamPanel
					team="us"
					label="我方"
					state={state}
					disabled={buttonsDisabled}
					onWinRally={() => dispatch({ type: "RALLY_WON", winner: "us" })}
				/>
				<TeamPanel
					team="them"
					label="對方"
					state={state}
					disabled={buttonsDisabled}
					onWinRally={() => dispatch({ type: "RALLY_WON", winner: "them" })}
				/>
			</div>
			<ActionBar
				canUndo={state.history.length > 0}
				onUndo={() => dispatch({ type: "UNDO" })}
				onReset={() => dispatch({ type: "RESET" })}
			/>
			<GameOverDialog state={state} onPlayAgain={() => dispatch({ type: "RESET" })} />
		</div>
	);
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit`
Expected: 無錯

- [ ] **Step 3: Commit**

```bash
git add components/scoreboard/Scoreboard.tsx
git commit -m "feat(scoreboard): Scoreboard 主容器組合並依 orientation 切換排版"
```

---

## Phase 5 · 路由 + 全域 Navbar

### Task 23: app/scoreboard/page.tsx

**Files:**
- Create: `app/scoreboard/page.tsx`

- [ ] **Step 1: 實作**

```tsx
// app/scoreboard/page.tsx
import type { Metadata } from "next";
import { Scoreboard } from "@/components/scoreboard/Scoreboard";

export const metadata: Metadata = {
	title: "計分板 | 匹克球指南",
	description: "支援單打與雙打的匹克球 Traditional 計分器",
};

export default function ScoreboardPage() {
	return <Scoreboard />;
}
```

- [ ] **Step 2: 啟動 dev 並 manual check**

Run: `pnpm dev`
開啟 http://localhost:3000/scoreboard
Expected: 計分板顯示 0-0，可按「贏這球+」測試

- [ ] **Step 3: Commit**

```bash
git add app/scoreboard/page.tsx
git commit -m "feat(scoreboard): 加入 /scoreboard 路由"
```

---

### Task 24: SiteNavbar 元件

**Files:**
- Create: `components/layout/SiteNavbar.tsx`

- [ ] **Step 1: 實作**

```tsx
// components/layout/SiteNavbar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScrolledPast } from "@/hooks/useScrolledPast";
import { cn } from "@/lib/utils";

interface NavLink {
	href: string;
	label: string;
}

const NAV_LINKS: readonly NavLink[] = [
	{ href: "/", label: "首頁" },
	{ href: "/tour", label: "完整體驗" },
	{ href: "/scoreboard", label: "計分板" },
] as const;

// 全域 navbar：fixed top，捲離首頁 Hero 後切換為白底；
// 在首頁以外的路由（/tour、/scoreboard）一律白底樣式。
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
				<nav className="ml-auto flex items-center gap-1">
					{NAV_LINKS.map((link) => {
						const active = pathname === link.href;
						return (
							<Link
								key={link.href}
								href={link.href}
								transitionTypes={[link.href === "/" ? "nav-back" : "nav-forward"]}
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

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit`
Expected: 無錯

- [ ] **Step 3: Commit**

```bash
git add components/layout/SiteNavbar.tsx
git commit -m "feat(layout): 加入全域 SiteNavbar 元件"
```

---

### Task 25: 接 Navbar 到 layout + TocBar top 偏移

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/guide/TocBar.tsx`

- [ ] **Step 1: 在 layout 掛 Navbar**

讀 `app/layout.tsx`，找到 `<body>` 內 `<ViewTransition>` 開始的位置。在 `<body>` 內、`<ViewTransition>` 之前插入 `<SiteNavbar />`：

```tsx
import { SiteNavbar } from "@/components/layout/SiteNavbar";

// ...
		<body>
			<SiteNavbar />
			<ViewTransition
				enter={{
					// ... 既有 enter/exit 設定不動
```

- [ ] **Step 2: TocBar 加 top 偏移**

讀 `components/guide/TocBar.tsx`，把外層 `<nav>` 的 `top-0` 改成 `top-14`：

```tsx
		<nav
			className={cn(
				"fixed top-14 right-0 left-0 z-[100] border-b transition-[background-color,box-shadow,backdrop-filter,border-color] duration-300",
```

- [ ] **Step 3: 啟動 dev 並 manual check**

Run: `pnpm dev`

逐項檢查：
- http://localhost:3000 ：Hero 上方有 Navbar；捲動後 TocBar 在 Navbar 下方對齊
- http://localhost:3000/tour ：Navbar 出現在 tour 上方
- http://localhost:3000/scoreboard ：Navbar 出現，計分板可用
- 點 Navbar 連結互跳：首頁 ↔ Tour ↔ 計分板，view transition 動畫順暢

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx components/guide/TocBar.tsx
git commit -m "feat(layout): SiteNavbar 接入 root layout 並調整 TocBar 偏移"
```

---

## Phase 6 · E2E

### Task 26: Playwright E2E scoreboard.spec.ts

**Files:**
- Create: `tests/e2e/specs/scoreboard.spec.ts`

- [ ] **Step 1: 寫 E2E**

```ts
// tests/e2e/specs/scoreboard.spec.ts
import { test, expect } from "@playwright/test";

test.describe("/scoreboard", () => {
	test.beforeEach(async ({ page }) => {
		// 清理 localStorage 避免上次測試殘留
		await page.goto("/");
		await page.evaluate(() => localStorage.clear());
	});

	test("從首頁 Navbar 進入 /scoreboard", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("link", { name: "計分板" }).click();
		await expect(page).toHaveURL(/\/scoreboard$/);
		await expect(page.getByText("我方")).toBeVisible();
		await expect(page.getByText("對方")).toBeVisible();
	});

	test("側出計分到 11-0 結束（我方持續贏 rally，僅發球方得分）", async ({ page }) => {
		// 預設我方先發 + 雙打 0-0-2。我方持續贏 rally 即可一路得分至 11
		await page.goto("/scoreboard");
		const usBtn = page.getByRole("button", { name: /我方贏這一球/ });
		for (let i = 0; i < 11; i++) await usBtn.click();
		await expect(page.getByText("🏆 我方獲勝")).toBeVisible();
		await expect(page.getByText("11 – 0")).toBeVisible();
	});

	test("Undo 退回一分", async ({ page }) => {
		await page.goto("/scoreboard");
		const usBtn = page.getByRole("button", { name: /我方贏這一球/ });
		await usBtn.click();
		await usBtn.click();
		await page.getByRole("button", { name: "撤銷上一分" }).click();
		// 我方分數應為 1
		await expect(page.getByLabel("我方目前 1 分")).toBeVisible();
	});

	test("重置 → 二次確認 → toggle 解鎖", async ({ page }) => {
		await page.goto("/scoreboard");
		await page.getByRole("button", { name: /我方贏這一球/ }).click();
		// mode toggle 此時應 disabled
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeDisabled();
		await page.getByRole("button", { name: "重置比賽" }).click();
		await page.getByRole("button", { name: "確定重置" }).click();
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeEnabled();
	});

	test("重整後分數還在（localStorage）", async ({ page }) => {
		await page.goto("/scoreboard");
		const usBtn = page.getByRole("button", { name: /我方贏這一球/ });
		await usBtn.click();
		await usBtn.click();
		await page.reload();
		await expect(page.getByLabel("我方目前 2 分")).toBeVisible();
	});
});
```

> 註：實際 button accessible name 由 TeamPanel 的 `aria-label` 提供（template `${label}贏這一球，當前 ${score} 分`）。

- [ ] **Step 2: 跑 E2E**

Run: `pnpm test:e2e -- --project=chromium tests/e2e/specs/scoreboard.spec.ts`
Expected: 5 個 test PASS

- [ ] **Step 3: 跑完整 5 個 project**

Run: `pnpm test:e2e -- tests/e2e/specs/scoreboard.spec.ts`
Expected: 全綠（25 個 test runs）

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/scoreboard.spec.ts
git commit -m "test(scoreboard): E2E 涵蓋進入、完整比賽、Undo、重置、持久化"
```

---

## 收尾驗證

### Task 27: 全套測試 + lint + build

- [ ] **Step 1: 跑完整單元測試**

Run: `pnpm test -- --run`
Expected: 全綠（含既有測試與新加的 scoreboard 測試）

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 無錯

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build 成功，`/scoreboard` 與 `/tour` 與 `/` 各自有對應 route

- [ ] **Step 4: 視覺檢查**

Run: `pnpm dev`
逐項確認：
- 首頁 Hero 沒被 Navbar 切到內容（如有可微調 padding-top）
- TocBar 不被 Navbar 蓋住
- /tour 與 /scoreboard Navbar 樣式正確（白底）
- 點 Navbar 互跳有 view transition 動畫
- /scoreboard 桌機橫式（左右排）與手機直式（上下排，含提示橫幅）切換正常
- 全螢幕按鈕在桌機 Chrome 可用、iOS Safari 隱藏

- [ ] **Step 5: 最終 commit（若以上有需要微調的小修）**

```bash
# 若無微調可略過
git add -A
git commit -m "chore(scoreboard): 收尾微調 + 視覺驗證"
```

---

## Self-Review Notes（撰寫期間紀錄）

- **Spec coverage check：** spec §1-§14 對應到 Task 1-26，無遺漏。
- **firstServer 加進 state：** Task 9 暴露的設計缺陷（spec 沒寫但實作需要）已於 Task 9 修正並把 schema/types 一併更新；Task 10 也使用此欄位。
- **Hydration 安全：** useScoreboardStore 用 useReducer 初始 + useEffect HYDRATE，避免 SSR/CSR mismatch（spec §8.3）。
- **shadcn 元件：** Task 15 一次安裝三個（dialog、alert-dialog、select），對應 spec §12。
- **GameOverDialog 的「關閉」實作：** 用本地 `dismissed` state 暫時隱藏（status 仍為 finished，使用者可在計分板上看到終局分數）；status 離開 finished 時 effect 自動 reset。對應 spec §7.4。
- **OrientationHint 用 sessionStorage：** 對應 spec §7.2 與 §8.3。
- **E2E 比賽序列：** 在 side-out 規則下，從 0-0-2 起手讓我方持續贏 rally 會直接打到 11-0 結束（中途對方無發球權）。E2E 用這個最短路徑驗證「完整比賽到結束」即可。若要產生 11-7 之類分數，需要在 us / them 之間交替 winRally，分支複雜不利於 E2E 信噪比。
