# Health check 頁面 + 通路驗證測試 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `nextjs-pickball` 端提供一個 `/health` 頁面與 E2E 測試，明確且可重複地確認「Next.js → service binding `HONO_API` → Hono `/api/health`」通路是通的。

**Architecture:** 把「打 binding + 解析回應」抽成純函式 `lib/health.ts`（走 TDD）；`/health` 頁面為 Server Component，`force-dynamic` 直連 binding、容錯呈現；E2E 用 Playwright `webServer` 陣列自動帶起前後端 dev，斷言頁面（Test A）與 `/api/*` proxy（Test B）兩條通路。後端 `hono-pickball` 不需改動（`/api/health` 已存在）。

**Tech Stack:** Next.js 16 App Router / React 19 / TypeScript（strict、verbatimModuleSyntax）/ Vitest（happy-dom、globals）/ Playwright / shadcn ui（Card、Badge）/ `@opennextjs/cloudflare`（`getCloudflareContext`）。

## Global Constraints

- 所有指令假設 cwd 在 `nextjs-pickball/`（除非另註）；從 repo root 用 `pnpm --filter ./nextjs-pickball <script>`。
- 註解與說明用繁體中文（台灣用語）；程式碼命名用英文。
- TypeScript `strict` 與 `verbatimModuleSyntax` 開啟——匯入純型別時用 `import type`。
- 路徑別名 `@/*` 對應 `nextjs-pickball/` 根。
- dev port 固定 `3005`（`next dev --port 3005`）；Hono wrangler dev 為 `8787`。
- `Fetcher` 為全域型別（`types/cloudflare-fetcher.d.ts`，`fetch: typeof fetch`），無需 import。
- 前置：在 feature 分支上進行（不要直接在 `main` 上 commit）。開工前先 `git checkout -b feat/health-check-page`。
- commit 訊息沿用專案 conventional commits 中文風格（如 `feat(next): ...`、`test(next): ...`）。

---

### Task 1: `lib/health.ts` — 通路檢查邏輯（TDD）

**Files:**
- Create: `nextjs-pickball/lib/health.ts`
- Test: `nextjs-pickball/lib/health.test.ts`

**Interfaces:**
- Consumes: 全域 `Fetcher`（`{ fetch: typeof fetch }`）。
- Produces:
  - `export type HealthResult = { ok: true; service: string; timestamp: string; requestUrl: string; latencyMs: number } | { ok: false; error: string; latencyMs: number }`
  - `export async function checkHonoHealth(binding: Fetcher): Promise<HealthResult>`

- [ ] **Step 1: 寫失敗測試**

Create `nextjs-pickball/lib/health.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { checkHonoHealth } from "./health";

// 用假的 Fetcher 注入不同回應，驗證三種分支。
// respond 若 throw，async fetch 會 reject，交由 checkHonoHealth 的 catch 處理。
function fakeBinding(respond: () => Response): Fetcher {
	return { fetch: async () => respond() } as unknown as Fetcher;
}

describe("checkHonoHealth", () => {
	it("回應 200 且 status=ok 時回傳 ok:true 與各欄位", async () => {
		const binding = fakeBinding(
			() =>
				new Response(
					JSON.stringify({
						status: "ok",
						service: "hono-pickball",
						timestamp: "2026-07-18T00:00:00.000Z",
						requestUrl: "https://hono-pickball.internal/api/health",
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
		);

		const result = await checkHonoHealth(binding);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.service).toBe("hono-pickball");
			expect(result.timestamp).toBe("2026-07-18T00:00:00.000Z");
			expect(result.requestUrl).toBe(
				"https://hono-pickball.internal/api/health",
			);
			expect(typeof result.latencyMs).toBe("number");
			expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		}
	});

	it("非 2xx 狀態碼時回傳 ok:false 與 HTTP 錯誤", async () => {
		const binding = fakeBinding(() => new Response("boom", { status: 500 }));

		const result = await checkHonoHealth(binding);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("HTTP 500");
		}
	});

	it("binding.fetch 例外時回傳 ok:false 與例外訊息", async () => {
		const binding = fakeBinding(() => {
			throw new Error("no upstream");
		});

		const result = await checkHonoHealth(binding);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("no upstream");
		}
	});
});
```

- [ ] **Step 2: 跑測試確認紅燈**

Run: `pnpm test -- --run lib/health.test.ts`
Expected: FAIL（`checkHonoHealth` 尚未定義／`./health` 找不到）。

- [ ] **Step 3: 最小實作**

Create `nextjs-pickball/lib/health.ts`：

```ts
// Hono /api/health 通路檢查邏輯。
// 與頁面呈現分離，binding 以參數注入，方便以假 Fetcher 測試各分支。

// 對應 hono-pickball/src/index.ts 的 GET /api/health 成功回應形狀
interface HonoHealthPayload {
	status: string;
	service: string;
	timestamp: string;
	requestUrl: string;
}

export type HealthResult =
	| {
			ok: true;
			service: string;
			timestamp: string;
			requestUrl: string;
			latencyMs: number;
	  }
	| { ok: false; error: string; latencyMs: number };

// 經 service binding 直連 Hono /api/health，回傳可供頁面呈現的結果。
// 絕不 throw：任何錯誤都轉成 { ok: false }，確保頁面永遠能 render。
export async function checkHonoHealth(binding: Fetcher): Promise<HealthResult> {
	const startedAt = Date.now();
	try {
		// host 任意（binding 直接路由到目標 worker，不經 DNS），路徑須為 /api/health
		const res = await binding.fetch(
			"https://hono-pickball.internal/api/health",
		);
		const latencyMs = Date.now() - startedAt;

		if (!res.ok) {
			return { ok: false, error: `HTTP ${res.status}`, latencyMs };
		}

		const payload = (await res.json()) as HonoHealthPayload;
		if (payload.status !== "ok") {
			return {
				ok: false,
				error: `unexpected status: ${payload.status}`,
				latencyMs,
			};
		}

		return {
			ok: true,
			service: payload.service,
			timestamp: payload.timestamp,
			requestUrl: payload.requestUrl,
			latencyMs,
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
			latencyMs: Date.now() - startedAt,
		};
	}
}
```

- [ ] **Step 4: 跑測試確認綠燈**

Run: `pnpm test -- --run lib/health.test.ts`
Expected: PASS（3 個測試通過）。

- [ ] **Step 5: Commit**

```bash
git add nextjs-pickball/lib/health.ts nextjs-pickball/lib/health.test.ts
git commit -m "feat(next): 新增 health 通路檢查邏輯 checkHonoHealth"
```

---

### Task 2: `app/health/page.tsx` — health check 頁面（Server Component）

**Files:**
- Create: `nextjs-pickball/app/health/page.tsx`

**Interfaces:**
- Consumes: `checkHonoHealth` 與 `HealthResult`（`@/lib/health`）；`getCloudflareContext`（`@opennextjs/cloudflare`）回傳 `{ env }`，`env.HONO_API` 為 `Fetcher`。
- Produces: 路由 `/health`；DOM 上 `[data-testid="health-status"]` 且 `data-status` 為 `"ok"` / `"fail"`（供 Task 3 的 Test A 斷言）。

- [ ] **Step 1: 實作頁面**

Create `nextjs-pickball/app/health/page.tsx`：

```tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkHonoHealth } from "@/lib/health";

// 每次 request 都即時檢查；不可於 build 期預渲染（屆時無 binding 的 runtime context）。
export const dynamic = "force-dynamic";

export default async function HealthPage() {
	const { env } = getCloudflareContext();
	const result = await checkHonoHealth(env.HONO_API);

	return (
		<main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6">
			<Card
				className="w-full"
				data-testid="health-status"
				data-status={result.ok ? "ok" : "fail"}
			>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						API 連線狀態
						{result.ok ? (
							<Badge>ok</Badge>
						) : (
							<Badge variant="destructive">fail</Badge>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-1 text-sm">
					{result.ok ? (
						<>
							<p>service：{result.service}</p>
							<p>timestamp：{result.timestamp}</p>
							<p className="break-all">requestUrl：{result.requestUrl}</p>
							<p>latency：{result.latencyMs} ms</p>
						</>
					) : (
						<p className="break-all text-destructive">error：{result.error}</p>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
```

- [ ] **Step 2: 型別與 lint 檢查通過**

Run: `pnpm lint`
Expected: 無 error（新檔通過 ESLint；`Card` 為 `<div {...props}>` 會轉發 `data-*` 屬性）。

- [ ] **Step 3: 手動 smoke（可選但建議）**

在另一個終端機於 repo root 執行 `pnpm dev`（同時起前後端），瀏覽器開 `http://localhost:3005/health`：
- 後端有起 → 綠色 `ok` badge + service/timestamp/requestUrl/latency。
- 手動關掉後端再重整 → 紅色 `fail` badge + error，頁面不 crash。

- [ ] **Step 4: Commit**

```bash
git add nextjs-pickball/app/health/page.tsx
git commit -m "feat(next): 新增 /health 頁面直連 service binding 顯示 API 狀態"
```

---

### Task 3: E2E 通路測試 + Playwright webServer 陣列

**Files:**
- Modify: `nextjs-pickball/playwright.config.ts`（`webServer` 物件 → 陣列）
- Create: `nextjs-pickball/tests/e2e/specs/api-health.spec.ts`

**Interfaces:**
- Consumes: 路由 `/health` 的 `[data-testid="health-status"][data-status]`（Task 2）；後端 `GET /api/health`（既有）。
- Produces: 無（測試為終點）。

- [ ] **Step 1: 改 `playwright.config.ts` 的 `webServer` 成陣列**

把現有的：

```ts
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:3005",
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
	},
```

改為（先起 Hono wrangler dev，再起 next dev；兩者並行 → dev registry 接通 binding）：

```ts
	webServer: [
		{
			command: "pnpm --filter hono-pickball dev",
			url: "http://localhost:8787",
			reuseExistingServer: !process.env.CI,
			timeout: 120000,
		},
		{
			command: "pnpm dev",
			url: "http://localhost:3005",
			reuseExistingServer: !process.env.CI,
			timeout: 120000,
		},
	],
```

（`pnpm --filter hono-pickball` 用 package name，從 `nextjs-pickball/` cwd 也能解析到 workspace 內的 package。）

- [ ] **Step 2: 寫 E2E 測試**

Create `nextjs-pickball/tests/e2e/specs/api-health.spec.ts`：

```ts
import { test, expect } from "@playwright/test";

// 驗證 Next.js → service binding → Hono 的 API 通路。
// 需前後端 dev 同時運行（playwright.config.ts 的 webServer 陣列會自動帶起）。
// 通路與瀏覽器無關，只需在 chromium 執行一次。
test.describe("API health 通路", () => {
	test.skip(
		({ browserName }) => browserName !== "chromium",
		"API 通路測試只需在 chromium 執行一次",
	);

	// Test A：/health 頁面（Server Component 直連 binding）
	test("開 /health 頁面顯示 ok", async ({ page }) => {
		await page.goto("/health");
		const status = page.getByTestId("health-status");
		await expect(status).toHaveAttribute("data-status", "ok");
	});

	// Test B：/api/* proxy route（未來所有 API 都走這條 same-origin 通路）
	test("GET /api/health 經 proxy 回傳 status ok", async ({ request }) => {
		const res = await request.get("/api/health");
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
	});
});
```

- [ ] **Step 3: 跑 E2E 確認通過**

Run（cwd 在 `nextjs-pickball/`）：`pnpm exec playwright test api-health --project=chromium`
Expected: `2 passed`。

備註：若 Playwright 自動啟動 wrangler dev 卡住（首次下載／遙測提示），先在另一個終端機於 repo root 跑 `pnpm dev` 起好前後端，再重跑本指令——`reuseExistingServer: !process.env.CI` 會重用既有 server。必要時設 `WRANGLER_SEND_METRICS=false`。

- [ ] **Step 4: 確認其他既有 E2E 未被破壞**

Run: `pnpm test:e2e`（會跑全部 spec；api-health 於非 chromium project 顯示 skipped）
Expected: 既有 `scoreboard` / `quiz` / `tour` 測試維持通過，`api-health` 於 chromium 通過、其餘 project skipped。

- [ ] **Step 5: Commit**

```bash
git add nextjs-pickball/playwright.config.ts nextjs-pickball/tests/e2e/specs/api-health.spec.ts
git commit -m "test(next): 新增 API health E2E 並讓 Playwright webServer 自動帶起前後端"
```

---

## Self-Review

**1. Spec coverage：**
- 檢查邏輯 `lib/health.ts`（成功／非 2xx／例外三分支 + latencyMs）→ Task 1 ✅
- `/health` Server Component、`force-dynamic`、直連 binding、容錯 → Task 2 ✅
- `data-testid="health-status"` + `data-status` 斷言介面 → Task 2 Step 1 ✅
- E2E Test A（頁面）+ Test B（proxy），只跑 chromium → Task 3 ✅
- `playwright.config.ts` webServer 陣列自動帶起前後端 → Task 3 Step 1 ✅
- 不動後端 → 全計畫僅改 `nextjs-pickball/` ✅
- 驗收標準 1（單元三分支綠）→ Task 1 Step 4；標準 2/3（手動 ok/fail）→ Task 2 Step 3；標準 4（`test:e2e` 自動帶起前後端）→ Task 3 Step 3-4 ✅

**2. Placeholder scan：** 無 TBD/TODO；每個 code step 皆含完整程式碼與明確指令。✅

**3. Type consistency：** `HealthResult` 與 `checkHonoHealth(binding: Fetcher)` 在 Task 1 定義、Task 2 消費，簽名一致；`data-status` 值 `"ok"`/`"fail"` 在 Task 2 產出、Task 3 斷言，字串一致。✅
