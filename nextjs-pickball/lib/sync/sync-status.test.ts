import { describe, expect, it } from "vitest";
import { syncStatusMessage, type SyncStatus } from "./sync-status";

describe("syncStatusMessage", () => {
	it("local、synced、saving 不顯示提示，其餘狀態各有固定文案", () => {
		const expected: Record<SyncStatus, string | null> = {
			local: null,
			synced: null,
			saving: null,
			loading: "正在載入雲端資料…",
			retrying: "尚未儲存到雲端，將自動重試",
			conflict: "資料已在其他裝置更新，已重新載入最新資料",
			"load-failed": "無法載入雲端資料，請重新整理頁面",
			rejected: "雲端拒絕儲存，請重新整理頁面",
		};

		for (const [status, message] of Object.entries(expected)) {
			expect(syncStatusMessage(status as SyncStatus)).toBe(message);
		}
		expect(Object.keys(expected)).toHaveLength(8);
	});
});
