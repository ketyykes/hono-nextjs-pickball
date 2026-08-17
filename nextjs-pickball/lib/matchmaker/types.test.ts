import { describe, it, expect } from "vitest";
import { PlayerSchema, RosterSchema } from "./types";

describe("PlayerSchema", () => {
	it("合法欄位通過驗證，restCount 與 gamesPlayed 未提供時補 0", () => {
		const result = PlayerSchema.safeParse({
			id: "player-1",
			name: "王小明",
			gender: "male",
			colorFrom: "#0E6B63",
			colorTo: "#14B8A6",
			rating: 4.5,
			isActive: true,
			createdAt: "2026-08-16T00:00:00.000Z",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.restCount).toBe(0);
			expect(result.data.gamesPlayed).toBe(0);
		}
	});

	it("rating 超出 1.00～8.00 時驗證失敗", () => {
		const baseFields = {
			id: "player-1",
			name: "王小明",
			gender: "male" as const,
			colorFrom: "#0E6B63",
			colorTo: "#14B8A6",
			isActive: true,
			createdAt: "2026-08-16T00:00:00.000Z",
		};

		const tooLow = PlayerSchema.safeParse({ ...baseFields, rating: 0.99 });
		const tooHigh = PlayerSchema.safeParse({ ...baseFields, rating: 8.01 });
		const lowerBound = PlayerSchema.safeParse({ ...baseFields, rating: 1 });
		const upperBound = PlayerSchema.safeParse({ ...baseFields, rating: 8 });
		const baseline = PlayerSchema.safeParse({ ...baseFields, rating: 4.5 });

		expect(tooLow.success).toBe(false);
		expect(tooHigh.success).toBe(false);
		expect(lowerBound.success).toBe(true);
		expect(upperBound.success).toBe(true);
		expect(baseline.success).toBe(true);
	});

	it("name 僅含空白時驗證失敗", () => {
		const result = PlayerSchema.safeParse({
			id: "player-1",
			name: "   ",
			gender: "male",
			colorFrom: "#0E6B63",
			colorTo: "#14B8A6",
			rating: 4.5,
			isActive: true,
			createdAt: "2026-08-16T00:00:00.000Z",
		});

		expect(result.success).toBe(false);
	});

	it("Hex 色碼格式不合法時驗證失敗", () => {
		const baseFields = {
			id: "player-1",
			name: "王小明",
			gender: "male" as const,
			rating: 4.5,
			isActive: true,
			createdAt: "2026-08-16T00:00:00.000Z",
		};

		const missingHash = PlayerSchema.safeParse({
			...baseFields,
			colorFrom: "0E6B63",
			colorTo: "#14B8A6",
		});
		const invalidChars = PlayerSchema.safeParse({
			...baseFields,
			colorFrom: "#GGG",
			colorTo: "#14B8A6",
		});
		const valid = PlayerSchema.safeParse({
			...baseFields,
			colorFrom: "#0E6B63",
			colorTo: "#14B8A6",
		});

		expect(missingHash.success).toBe(false);
		expect(invalidChars.success).toBe(false);
		expect(valid.success).toBe(true);
	});

	it("createdAt 非 ISO 8601 時驗證失敗", () => {
		const baseFields = {
			id: "player-1",
			name: "王小明",
			gender: "male" as const,
			colorFrom: "#0E6B63",
			colorTo: "#14B8A6",
			rating: 4.5,
			isActive: true,
		};

		const invalid = PlayerSchema.safeParse({
			...baseFields,
			createdAt: "not-a-date",
		});
		const valid = PlayerSchema.safeParse({
			...baseFields,
			createdAt: "2026-08-15T00:00:00.000Z",
		});

		expect(invalid.success).toBe(false);
		expect(valid.success).toBe(true);
	});
});

describe("RosterSchema", () => {
	it("RosterSchema 的 version 僅接受 1", () => {
		const invalid = RosterSchema.safeParse({ version: 2, players: [] });
		const valid = RosterSchema.safeParse({ version: 1, players: [] });

		expect(invalid.success).toBe(false);
		expect(valid.success).toBe(true);
	});
});
