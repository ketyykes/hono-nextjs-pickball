import { describe, expect, it } from "vitest";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import { ScoreboardStateSchema } from "@pickball/core/scoreboard/types";
import { PlayerSchema } from "@pickball/core/matchmaker/types";

describe("核心套件跨 workspace 匯入", () => {
	it("workerd 中可匯入核心套件並以其 schema 驗證資料", () => {
		expect(ScoreboardStateSchema.safeParse(createInitialState()).success).toBe(true);
		expect(PlayerSchema.safeParse({}).success).toBe(false);
	});
});
