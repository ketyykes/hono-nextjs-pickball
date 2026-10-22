import { describe, it, expect } from "vitest";
import {
  PlayerImportRequestSchema,
  PlayerListResponseSchema,
} from "../../src/api/players";

/** 產生符合 PlayerSchema 的測試資料。 */
function makePlayer(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `球員${id}`,
    gender: "male",
    colorFrom: "#112233",
    colorTo: "#445566",
    rating: 4,
    restCount: 0,
    gamesPlayed: 0,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("名單 API 契約", () => {
  it("PlayerImportRequestSchema 要求至少一位且 id 不重複", () => {
    expect(PlayerImportRequestSchema.safeParse({ players: [] }).success).toBe(false);
    expect(
      PlayerImportRequestSchema.safeParse({ players: [makePlayer("a"), makePlayer("a")] }).success,
    ).toBe(false);
    expect(
      PlayerImportRequestSchema.safeParse({ players: [makePlayer("a"), makePlayer("b")] }).success,
    ).toBe(true);
  });

  it("PlayerListResponseSchema 以 PlayerSchema 驗證每一筆", () => {
    expect(
      PlayerListResponseSchema.safeParse({
        items: [{ data: makePlayer("a", { rating: 99 }), version: 1 }],
      }).success,
    ).toBe(false);
    expect(
      PlayerListResponseSchema.safeParse({
        items: [
          { data: makePlayer("a"), version: 1 },
          { data: makePlayer("b"), version: 3 },
        ],
      }).success,
    ).toBe(true);
    expect(PlayerListResponseSchema.safeParse({ items: [] }).success).toBe(true);
    // version 為 0 代表尚未建立，列表中不應出現
    expect(
      PlayerListResponseSchema.safeParse({ items: [{ data: makePlayer("a"), version: 0 }] }).success,
    ).toBe(false);
  });
});
