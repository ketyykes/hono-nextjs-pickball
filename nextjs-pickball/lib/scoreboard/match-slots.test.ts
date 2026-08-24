import { describe, it, expect, beforeEach } from "vitest";
import { readMatchSlot, writeMatchSlot } from "./match-slots";
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
});
