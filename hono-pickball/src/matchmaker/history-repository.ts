import type { HistoryListResponse, HistoryQuery } from "@pickball/core/api/history";
import { MatchHistoryEntrySchema } from "@pickball/core/matchmaker/history";
import { and, asc, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { matchmakerHistory } from "../db/schema";

/**
 * 列出本人的歷史；from 含、to 不含（毫秒）。
 * 區間界線由前端以使用者裝置的時區算好再傳入，這裡只比較毫秒，不自行推算「今天」「本週」（Workers 為 UTC）。
 * 同一 played_at 以 rowid 遞增排列，等同追加順序，與前端 filterHistoryByRange 的穩定排序一致。
 */
export async function listHistory(db: Db, userId: string, query: HistoryQuery): Promise<HistoryListResponse> {
	const conditions = [eq(matchmakerHistory.userId, userId)];
	if (query.from !== undefined) {
		conditions.push(gte(matchmakerHistory.playedAt, new Date(query.from)));
	}
	if (query.to !== undefined) {
		conditions.push(lt(matchmakerHistory.playedAt, new Date(query.to)));
	}
	const primaryOrder = query.order === "asc" ? asc(matchmakerHistory.playedAt) : desc(matchmakerHistory.playedAt);

	const rows = await db
		.select()
		.from(matchmakerHistory)
		.where(and(...conditions))
		.orderBy(primaryOrder, sql`rowid`);
	// total 不受區間影響，讓前端分得出「完全沒有歷史」與「此區間沒有」
	const [totalRow] = await db
		.select({ total: count() })
		.from(matchmakerHistory)
		.where(eq(matchmakerHistory.userId, userId));

	// 雲端只略過、不刪除損毀列：寫入前已驗證，損毀只可能來自未來的 schema 變更，保留原列才有機會救回
	const items: HistoryListResponse["items"] = [];
	let droppedCount = 0;
	for (const row of rows) {
		const parsed = MatchHistoryEntrySchema.safeParse(row.data);
		if (!parsed.success) {
			droppedCount += 1;
			continue;
		}
		items.push({ data: parsed.data, version: row.version });
	}
	return { items, total: totalRow?.total ?? 0, droppedCount };
}
