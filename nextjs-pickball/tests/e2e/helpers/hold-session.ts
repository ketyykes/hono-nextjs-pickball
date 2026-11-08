import type { Page } from "@playwright/test";

// 攔住 /api/session 直到呼叫 release，用來停在「資料來源尚未確定」的畫面做斷言。
// release 可重複呼叫；放行前的斷言要精簡（逾時為 10 秒）。
// 測試結束前要自行呼叫 page.unrouteAll，避免殘留的攔截影響後續請求。
export async function holdSession(page: Page): Promise<() => void> {
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/session", async (route) => {
		await gate;
		try {
			await route.continue();
		} catch {
			// 頁面已換掉或關閉時請求會被取消，不影響測試結果
		}
	});
	return release;
}
