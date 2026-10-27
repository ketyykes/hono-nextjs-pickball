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
    if (ascending.success) {
      expect(ascending.data.from).toBe(100);
      expect(ascending.data.order).toBe("asc");
    }
    const bothBounds = HistoryQuerySchema.safeParse({ from: "100", to: "200", order: "desc" });
    expect(bothBounds.success).toBe(true);
    if (bothBounds.success) {
      expect(bothBounds.data.to).toBe(200);
    }
    expect(HistoryQuerySchema.safeParse({}).success).toBe(true);

    // 只含十進位數字的字串才合法：不可使用 z.coerce.number() 的寬鬆轉換
    for (const from of ["", " ", " 12 ", "1e3", "0x10", "-1", "1.5", "99999999999999999999"]) {
      expect(HistoryQuerySchema.safeParse({ from }).success, `from=${JSON.stringify(from)}`).toBe(false);
    }
    expect(HistoryQuerySchema.safeParse({ to: "" }).success).toBe(false);
    expect(HistoryQuerySchema.safeParse({ to: "0x10" }).success).toBe(false);
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
    const badWinner = { items: [{ data: makeEntry("nobody"), version: 1 }] };
    expect(HistoryListResponseSchema.safeParse(makeResponse(badWinner)).success).toBe(false);
    const badVersion = { items: [{ data: makeEntry("draw"), version: 0 }] };
    expect(HistoryListResponseSchema.safeParse(makeResponse(badVersion)).success).toBe(false);
  });
});
