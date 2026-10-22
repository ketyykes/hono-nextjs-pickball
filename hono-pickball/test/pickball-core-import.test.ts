import { describe, expect, it } from "vitest";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import { ScoreboardStateSchema } from "@pickball/core/scoreboard/types";
import { PlayerSchema } from "@pickball/core/matchmaker/types";

// 目的不是重測 schema，而是證明 vitest-pool-workers 能解析並在 workerd 中執行 workspace symlink 套件
// （@pickball/core 的 exports 直接指向 .ts 原始碼）；B5 起 src/** 才會實際匯入。刻意不載入 ../src/index：本測試與後端路由無關。
describe("核心套件跨 workspace 匯入", () => {
	it("workerd 中可匯入核心套件並以其 schema 驗證資料", () => {
		expect(ScoreboardStateSchema.safeParse(createInitialState()).success).toBe(true);
		expect(PlayerSchema.safeParse({}).success).toBe(false);
	});
});
