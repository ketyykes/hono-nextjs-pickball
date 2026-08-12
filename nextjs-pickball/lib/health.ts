// Hono /api/health 通路檢查邏輯。
// 與頁面呈現分離，binding 以參數注入，方便以假 Fetcher 測試各分支。

// 對應 hono-pickball/src/index.ts 的 GET /api/health 成功回應形狀
interface HonoHealthPayload {
	status: string;
	service: string;
	timestamp: string;
	requestUrl: string;
}

// 只檢查 status 不足以保證回應可用：上游若少給 service / timestamp / requestUrl，
// 頁面會顯示三個 undefined 卻自稱 ok。因此成功分支前先驗形狀。
function isValidPayload(value: unknown): value is HonoHealthPayload {
	if (typeof value !== "object" || value === null) return false;
	const payload = value as Record<string, unknown>;
	return (
		typeof payload.status === "string" &&
		typeof payload.service === "string" &&
		typeof payload.timestamp === "string" &&
		typeof payload.requestUrl === "string"
	);
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

		const payload = await res.json();
		if (!isValidPayload(payload)) {
			return { ok: false, error: "invalid payload", latencyMs };
		}

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
