import { describe, it, expect } from "vitest";
import {
  MatchSlotListResponseSchema,
  SubmitScoreRequestSchema,
} from "../../src/api/round";
import { createInitialState } from "../../src/scoreboard/reducer";

/** 產生符合 ScoreboardState 的分槽資料；matchId 預設為字串。 */
function makeSlot(matchId: string | null) {
  return { ...createInitialState(), matchId };
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
});
