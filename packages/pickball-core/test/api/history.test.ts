import { describe, it, expect } from "vitest";
import { HistoryListResponseSchema, HistoryQuerySchema } from "../../src/api/history";

/** 產生符合 MatchHistoryEntrySchema 的單打紀錄；winner 由呼叫端指定。 */
function makeEntry(winner: string) {
  const player = (id: string) => ({ id, name: `球員${id}`, ratingBefore: 4, ratingAfter: 4 });
  return {
    matchId: "match-1",
    courtNumber: 1,
    playedAt: "2026-08-15T04:00:00.000Z",
    format: "singles",
    teamA: { players: [player("a")], rating: 4 },
    teamB: { players: [player("b")], rating: 4 },
    scoreA: 11,
    scoreB: 11,
    winner,
  };
}

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ data: makeEntry("draw"), version: 1 }],
    total: 1,
    droppedCount: 0,
    ...overrides,
  };
}

describe("history API 契約", () => {
  it("HistoryQuerySchema 要求 from 小於 to 且 HistoryListResponseSchema 接受平局紀錄", () => {
    // from 必須小於 to
    expect(HistoryQuerySchema.safeParse({ from: "300", to: "200" }).success).toBe(false);
    expect(HistoryQuerySchema.safeParse({ from: "100", to: "100" }).success).toBe(false);
    expect(HistoryQuerySchema.safeParse({ from: "100", to: "200" }).success).toBe(true);

    // 合法查詢，且 from 轉為數字
    const ascending = HistoryQuerySchema.safeParse({ from: "100", order: "asc" });
    expect(ascending.success).toBe(true);
    expect(ascending.data?.from).toBe(100);
    expect(ascending.data?.order).toBe("asc");
    const bothBounds = HistoryQuerySchema.safeParse({ from: "100", to: "200", order: "desc" });
    expect(bothBounds.success).toBe(true);
    expect(bothBounds.data?.to).toBe(200);
    expect(HistoryQuerySchema.safeParse({}).success).toBe(true);

    // 只帶 to 是合法的（rangeBounds("earlier") 只有 to）；refine 不可因缺 from 而拒絕
    const onlyTo = HistoryQuerySchema.safeParse({ to: "200" });
    expect(onlyTo.success).toBe(true);
    expect(onlyTo.data?.to).toBe(200);
    // 0 為合法界線：refine 不可用 truthy 判斷略過
    expect(HistoryQuerySchema.safeParse({ from: "0", to: "0" }).success).toBe(false);
    expect(HistoryQuerySchema.safeParse({ from: "0", to: "1" }).success).toBe(true);

    // 只含十進位數字的字串才合法：不可使用 z.coerce.number() 的寬鬆轉換
    const invalidMilliseconds = ["", " ", " 12 ", "1e3", "0x10", "-1", "1.5", "1.0", "99999999999999999999"];
    for (const key of ["from", "to"]) {
      for (const value of invalidMilliseconds) {
        const result = HistoryQuerySchema.safeParse({ [key]: value });
        expect(result.success, `${key}=${JSON.stringify(value)}`).toBe(false);
      }
    }
    expect(HistoryQuerySchema.safeParse({ order: "random" }).success).toBe(false);

    // 回應接受 winner 為 draw 的紀錄
    expect(HistoryListResponseSchema.safeParse(makeResponse()).success).toBe(true);
    expect(HistoryListResponseSchema.safeParse(makeResponse({ items: [], total: 0 })).success).toBe(true);
    const winnerOfTeamA = { items: [{ data: makeEntry("teamA"), version: 1 }] };
    expect(HistoryListResponseSchema.safeParse(makeResponse(winnerOfTeamA)).success).toBe(true);

    // total、droppedCount 為非負整數；data 以 MatchHistoryEntrySchema 驗證
    expect(HistoryListResponseSchema.safeParse(makeResponse({ total: -1 })).success).toBe(false);
    expect(HistoryListResponseSchema.safeParse(makeResponse({ droppedCount: -1 })).success).toBe(false);
    expect(HistoryListResponseSchema.safeParse(makeResponse({ total: 1.5 })).success).toBe(false);
    expect(HistoryListResponseSchema.safeParse(makeResponse({ droppedCount: 1.5 })).success).toBe(false);

    // 必填欄位缺漏要失敗：total、droppedCount、items，以及 item 的 version、data
    const { total: _total, ...withoutTotal } = makeResponse();
    expect(HistoryListResponseSchema.safeParse(withoutTotal).success).toBe(false);
    const { droppedCount: _droppedCount, ...withoutDroppedCount } = makeResponse();
    expect(HistoryListResponseSchema.safeParse(withoutDroppedCount).success).toBe(false);
    const { items: _items, ...withoutItems } = makeResponse();
    expect(HistoryListResponseSchema.safeParse(withoutItems).success).toBe(false);
    const missingVersion = { items: [{ data: makeEntry("draw") }] };
    expect(HistoryListResponseSchema.safeParse(makeResponse(missingVersion)).success).toBe(false);
    const missingData = { items: [{ version: 1 }] };
    expect(HistoryListResponseSchema.safeParse(makeResponse(missingData)).success).toBe(false);
    const badWinner = { items: [{ data: makeEntry("nobody"), version: 1 }] };
    expect(HistoryListResponseSchema.safeParse(makeResponse(badWinner)).success).toBe(false);
    const badVersion = { items: [{ data: makeEntry("draw"), version: 0 }] };
    expect(HistoryListResponseSchema.safeParse(makeResponse(badVersion)).success).toBe(false);
    const fractionalVersion = { items: [{ data: makeEntry("draw"), version: 1.5 }] };
    expect(HistoryListResponseSchema.safeParse(makeResponse(fractionalVersion)).success).toBe(false);
  });
});
