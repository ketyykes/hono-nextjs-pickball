import { describe, it, expect } from "vitest";
import {
  MatchSlotGetResponseSchema,
  MatchSlotListResponseSchema,
  RoundGetResponseSchema,
  RoundPutRequestSchema,
  SubmitScoreRequestSchema,
  SubmitScoreResponseSchema,
} from "../../src/api/round";
import { createInitialState } from "../../src/scoreboard/reducer";

/** 產生符合 ScoreboardState 的分槽資料；matchId 預設為字串。 */
function makeSlot(matchId: string | null) {
  return { ...createInitialState(), matchId };
}

/** 產生符合 RoundSchema 的最小回合。 */
function makeRound() {
  return {
    roundNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    format: "singles",
    courtCount: 1,
    targetScore: 11,
    matches: [],
    restingPlayerIds: [],
    seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
    timer: null,
  };
}

function makePlayer(id: string) {
  return {
    id,
    name: `球員${id}`,
    gender: "male",
    colorFrom: "#112233",
    colorTo: "#445566",
    rating: 4,
    restCount: 0,
    gamesPlayed: 1,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeHistoryEntry() {
  const team = (id: string) => ({
    players: [{ id, name: `球員${id}`, ratingBefore: 4, ratingAfter: 4.1 }],
    rating: 4,
  });
  return {
    matchId: "m1",
    courtNumber: 1,
    playedAt: "2026-01-01T00:00:00.000Z",
    format: "singles",
    teamA: team("a"),
    teamB: team("b"),
    scoreA: 11,
    scoreB: 7,
    winner: "teamA",
  };
}

function makeSubmitResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    round: { data: makeRound(), version: 2 },
    players: [{ data: makePlayer("a"), version: 3 }],
    historyEntry: makeHistoryEntry(),
    boundaryHits: [{ playerId: "a", atUpperBound: false, atLowerBound: true }],
    ...overrides,
  };
}

describe("回合與分槽 API 契約", () => {
  it("MatchSlotListResponseSchema 要求每筆分槽的 matchId 為字串", () => {
    // matchId 為 null 的分槽不屬於任何場次，不可出現在分槽清單
    expect(
      MatchSlotListResponseSchema.safeParse({ items: [{ data: makeSlot(null), version: 1 }] }).success,
    ).toBe(false);
    expect(
      MatchSlotListResponseSchema.safeParse({
        items: [
          { data: makeSlot("m1"), version: 1 },
          { data: makeSlot("m2"), version: 2 },
        ],
      }).success,
    ).toBe(true);
    // 混入一筆 null 也要整份失敗
    expect(
      MatchSlotListResponseSchema.safeParse({
        items: [
          { data: makeSlot("m1"), version: 1 },
          { data: makeSlot(null), version: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(MatchSlotListResponseSchema.safeParse({ items: [] }).success).toBe(true);
    // 列表中的每一筆都已存在，版本至少為 1
    expect(
      MatchSlotListResponseSchema.safeParse({ items: [{ data: makeSlot("m1"), version: 0 }] }).success,
    ).toBe(false);
  });

  it("SubmitScoreRequestSchema 要求兩個比分字串與正整數 roundVersion", () => {
    expect(
      SubmitScoreRequestSchema.safeParse({ scoreA: "11", scoreB: "7", roundVersion: 0 }).success,
    ).toBe(false);
    expect(SubmitScoreRequestSchema.safeParse({ scoreA: "11", roundVersion: 1 }).success).toBe(false);
    expect(SubmitScoreRequestSchema.safeParse({ scoreB: "7", roundVersion: 1 }).success).toBe(false);
    expect(
      SubmitScoreRequestSchema.safeParse({ scoreA: "11", scoreB: "7", roundVersion: 1 }).success,
    ).toBe(true);
    // 比分以字串送出，數字型別不合法（格式檢查由核心 submitScore 負責）
    expect(
      SubmitScoreRequestSchema.safeParse({ scoreA: 11, scoreB: "7", roundVersion: 1 }).success,
    ).toBe(false);
    expect(
      SubmitScoreRequestSchema.safeParse({ scoreA: "11", scoreB: "7", roundVersion: 1.5 }).success,
    ).toBe(false);
    expect(
      SubmitScoreRequestSchema.safeParse({ scoreA: "11", scoreB: "7", roundVersion: -1 }).success,
    ).toBe(false);
    expect(SubmitScoreRequestSchema.safeParse({ scoreA: "11", scoreB: "7" }).success).toBe(false);
  });

  // 以下為 GREEN 階段補上的 regression guard（實作與測試同時加入，無紅燈）。
  it("回合與單筆分槽的讀寫 schema 沿用單筆版本化契約", () => {
    expect(RoundGetResponseSchema.safeParse({ data: null, version: 0 }).success).toBe(true);
    expect(RoundGetResponseSchema.safeParse({ data: makeRound(), version: 1 }).success).toBe(true);
    expect(RoundGetResponseSchema.safeParse({ data: { roundNumber: 0 }, version: 1 }).success).toBe(false);
    expect(RoundPutRequestSchema.safeParse({ data: makeRound(), version: 0 }).success).toBe(true);
    expect(RoundPutRequestSchema.safeParse({ data: null, version: 0 }).success).toBe(false);
    expect(RoundPutRequestSchema.safeParse({ data: makeRound(), version: -1 }).success).toBe(false);
    expect(MatchSlotGetResponseSchema.safeParse({ data: null, version: 0 }).success).toBe(true);
    expect(MatchSlotGetResponseSchema.safeParse({ data: makeSlot("m1"), version: 2 }).success).toBe(true);
    expect(MatchSlotGetResponseSchema.safeParse({ data: makeSlot(null), version: 2 }).success).toBe(false);
  });

  it("SubmitScoreResponseSchema 要求回合、被更新球員、歷史與觸界提示", () => {
    expect(SubmitScoreResponseSchema.safeParse(makeSubmitResponse()).success).toBe(true);
    expect(SubmitScoreResponseSchema.safeParse(makeSubmitResponse({ players: [], boundaryHits: [] })).success).toBe(true);
    for (const key of ["round", "players", "historyEntry", "boundaryHits"]) {
      const { [key]: _omitted, ...rest } = makeSubmitResponse();
      expect(SubmitScoreResponseSchema.safeParse(rest).success, `缺 ${key}`).toBe(false);
    }
    expect(SubmitScoreResponseSchema.safeParse(makeSubmitResponse({ round: { data: makeRound(), version: 0 } })).success).toBe(false);
    expect(SubmitScoreResponseSchema.safeParse(makeSubmitResponse({ round: { data: null, version: 2 } })).success).toBe(false);
    expect(SubmitScoreResponseSchema.safeParse(makeSubmitResponse({ players: [{ data: makePlayer("a"), version: 0 }] })).success).toBe(false);
    expect(SubmitScoreResponseSchema.safeParse(makeSubmitResponse({ players: [{ data: { ...makePlayer("a"), rating: 99 }, version: 1 }] })).success).toBe(false);
    expect(SubmitScoreResponseSchema.safeParse(makeSubmitResponse({ historyEntry: { ...makeHistoryEntry(), scoreA: -1 } })).success).toBe(false);
    for (const field of ["playerId", "atUpperBound", "atLowerBound"]) {
      const hit: Record<string, unknown> = { playerId: "a", atUpperBound: false, atLowerBound: true };
      delete hit[field];
      expect(SubmitScoreResponseSchema.safeParse(makeSubmitResponse({ boundaryHits: [hit] })).success, `缺 ${field}`).toBe(false);
    }
  });
});
