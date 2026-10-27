import { HistoryListResponseSchema } from "@pickball/core/api/history";
import { requestJson } from "./api-client";

// 路徑與回應 schema 集中在這一處，hook 不直接拼字串，避免各處路徑漂移。
const HISTORY_PATH = "/api/matchmaker/history";

/**
 * 呼叫端的查詢參數。刻意不用核心的 HistoryQuery：那是 zod 解析後的輸出型別，
 * 這裡只需要「要送出什麼」；未提供（或無界）的欄位不送，由後端套預設值。
 */
export interface FetchHistoryQuery {
	/** 含，毫秒時間戳。 */
	from?: number;
	/** 不含，毫秒時間戳。 */
	to?: number;
	order?: "desc" | "asc";
}

function historyPath(query: FetchHistoryQuery): string {
	const params = new URLSearchParams();
	if (query.from !== undefined) params.set("from", String(query.from));
	if (query.to !== undefined) params.set("to", String(query.to));
	if (query.order !== undefined) params.set("order", query.order);
	const search = params.toString();
	return search === "" ? HISTORY_PATH : `${HISTORY_PATH}?${search}`;
}

export function fetchRemoteHistory(expectedUserId: string, query: FetchHistoryQuery) {
	return requestJson("GET", historyPath(query), {
		schema: HistoryListResponseSchema,
		expectedUserId,
	});
}
