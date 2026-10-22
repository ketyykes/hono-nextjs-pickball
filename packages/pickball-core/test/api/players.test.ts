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
    // 單一位也合法（守住 min(1) 不被改成 min(2)）
    expect(PlayerImportRequestSchema.safeParse({ players: [makePlayer("a")] }).success).toBe(true);
    // 重複判斷必須看 id，不能只比對其他欄位
    expect(
      PlayerImportRequestSchema.safeParse({
        players: [makePlayer("a"), makePlayer("a", { name: "另一位" })],
      }).success,
    ).toBe(false);
    // 匯入的每一筆都要通過 PlayerSchema
    expect(
      PlayerImportRequestSchema.safeParse({ players: [makePlayer("a", { rating: 99 })] }).success,
    ).toBe(false);
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
    expect(PlayerListResponseSchema.safeParse({}).success).toBe(false);
    expect(
      PlayerListResponseSchema.safeParse({ items: [{ data: makePlayer("a"), version: 1.5 }] }).success,
    ).toBe(false);
    // version 為 0 代表尚未建立，列表中不應出現
    expect(
      PlayerListResponseSchema.safeParse({ items: [{ data: makePlayer("a"), version: 0 }] }).success,
    ).toBe(false);
  });
});
