import { describe, expect, it } from "vitest";
import {
	DATA_PENDING_MESSAGE,
	LOCAL_FALLBACK_ACTION_LABEL,
	LOCAL_FALLBACK_NOTICE,
	isContentBlocked,
	localDataStatus,
	syncStatusMessage,
	type DataStatus,
	type SyncStatus,
} from "./sync-status";

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

describe("isContentBlocked", () => {
	it("pending、loading、load-failed 取代內容，pending 的文案為正在載入資料", () => {
		const expected: Record<DataStatus, boolean> = {
			pending: true,
			loading: true,
			"load-failed": true,
			local: false,
			synced: false,
			saving: false,
			retrying: false,
			conflict: false,
			rejected: false,
		};

		for (const [status, blocked] of Object.entries(expected)) {
			expect(isContentBlocked(status as DataStatus), status).toBe(blocked);
		}
		expect(Object.keys(expected)).toHaveLength(9);
		expect(DATA_PENDING_MESSAGE).toBe("正在載入資料…");
		expect(DATA_PENDING_MESSAGE).not.toBe(syncStatusMessage("loading"));
	});
});

describe("localDataStatus", () => {
	// regression guard：行為由既有選擇器測試涵蓋，抽成函式時補上單元層的鎖定。
	it("本機資料讀入前為 pending，讀入後為 local", () => {
		expect(localDataStatus(false)).toBe("pending");
		expect(localDataStatus(true)).toBe("local");
	});
});

describe("無法確認的顯示狀態", () => {
	it("unavailable 取代內容，按鈕與本機提示文案為固定值", () => {
		expect(isContentBlocked("unavailable")).toBe(true);
		expect(LOCAL_FALLBACK_ACTION_LABEL).toBe("先用這台裝置的資料");
		expect(LOCAL_FALLBACK_NOTICE).toBe(
			"目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端",
		);
		expect(syncStatusMessage("load-failed")).toBe("無法載入雲端資料，請重新整理頁面");
	});
});
