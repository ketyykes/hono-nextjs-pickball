import { describe, it, expect } from "vitest";
import { dynamic, metadata } from "./page";

// /health 是內部診斷路由，不是公開內容頁：不得進搜尋索引，且每次 request 都要即時檢查。
// 注意：此檔只匯入模組層的常數，不呼叫 HealthPage()——後者需要 Cloudflare runtime context。
describe("/health 路由設定", () => {
	it("/health 匯出 metadata 且 robots.index 為 false", () => {
		expect(metadata).toBeDefined();
		expect(metadata.robots).toMatchObject({ index: false });
	});

	it("/health metadata 具備可辨識的 title", () => {
		expect(typeof metadata.title).toBe("string");
		expect((metadata.title as string).length).toBeGreaterThan(0);
	});

	// 這條在寫測試時就已成立（page.tsx 早有 dynamic），屬 regression guard 而非紅燈。
	it("/health 維持 dynamic = force-dynamic（不得於 build 期預渲染）", () => {
		expect(dynamic).toBe("force-dynamic");
	});
});
