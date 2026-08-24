import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	readMatchSlot,
	writeMatchSlot,
	readMatchSlots,
	clearMatchSlots,
	MATCH_SLOTS_KEY,
} from "./match-slots";
import { createInitialState } from "./reducer";

describe("match-slots", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("寫入某場次的槽不影響其他場次與獨立槽", () => {
		const m1State = {
			...createInitialState({ targetScore: 15 }),
			scores: { us: 8, them: 5 },
			history: [{ type: "RALLY_WON" as const, winner: "us" as const }],
		};
		writeMatchSlot("m1", m1State);
		writeMatchSlot("m2", createInitialState());

		const m2Updated = {
			...createInitialState(),
			scores: { us: 3, them: 1 },
			history: [{ type: "RALLY_WON" as const, winner: "us" as const }],
		};
		writeMatchSlot("m2", m2Updated);

		const m1AfterUpdate = readMatchSlot("m1");
		expect(m1AfterUpdate?.scores).toEqual({ us: 8, them: 5 });
		expect(m1AfterUpdate?.history).toEqual(m1State.history);
		expect(m1AfterUpdate?.targetScore).toBe(15);
		expect(localStorage.getItem("scoreboard:current:v1")).toBeNull();
	});

	it("單筆損壞只丟該筆並回報 droppedCount，其餘場次保留", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const m2State = createInitialState();
		localStorage.setItem(
			MATCH_SLOTS_KEY,
			JSON.stringify({
				m1: { mode: "doubles" }, // 缺必要欄位，應被逐筆丟棄
				m2: m2State,
			}),
		);

		const { slots, droppedCount } = readMatchSlots();

		expect(Object.keys(slots)).toEqual(["m2"]);
		expect(slots.m2).toEqual(m2State);
		expect(droppedCount).toBe(1);
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("整份非 JSON 時清除分槽 key 且不動獨立槽", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem("scoreboard:current:v1", JSON.stringify(createInitialState()));
		localStorage.setItem(MATCH_SLOTS_KEY, "{{{");

		const { slots, droppedCount } = readMatchSlots();

		expect(slots).toEqual({});
		expect(droppedCount).toBe(0);
		expect(localStorage.getItem(MATCH_SLOTS_KEY)).toBeNull();
		expect(localStorage.getItem("scoreboard:current:v1")).not.toBeNull();
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("批次清除只移除指定場次且忽略不存在的 id", () => {
		const m2State = createInitialState();
		writeMatchSlot("m1", createInitialState());
		writeMatchSlot("m2", m2State);
		writeMatchSlot("m3", createInitialState());

		expect(() => clearMatchSlots(["m1", "m3", "nope"])).not.toThrow();

		const { slots } = readMatchSlots();
		expect(Object.keys(slots)).toEqual(["m2"]);
		expect(slots.m2).toEqual(m2State);
	});
});
