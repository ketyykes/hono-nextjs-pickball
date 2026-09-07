import { describe, it, expect } from "vitest";
import type { RoundTimer } from "./round-types";
import { remainingSeconds, isExpired, formatRemaining } from "./round-timer";

// 倒數與時間到的純函式判定（spec round-lifecycle「回合計時器」）。「現在時間」一律由
// 呼叫端以 ISO 字串注入，本模組 SHALL NOT 呼叫 new Date()／Date.now()，見 round-timer.ts
// 檔頭註解與 design Decision 5、6。
describe("remainingSeconds", () => {
	it("剩餘秒數依經過時間遞減，超過設定長度後夾在 0 不為負數", () => {
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-03T01:00:00.000Z",
		};
		expect(remainingSeconds(timer, "2026-09-03T01:00:30.000Z")).toBe(570);
		expect(remainingSeconds(timer, "2026-09-03T01:11:00.000Z")).toBe(0);
		// 非整秒的經過時間（30.4 秒）：取整方式若從 ceil 換成 floor 會在此處露餡
		// （570 vs 569），單靠上面兩個整秒案例測不出取整方式被改動。
		expect(remainingSeconds(timer, "2026-09-03T01:00:30.400Z")).toBe(570);
	});
});

describe("formatRemaining", () => {
	it("剩餘秒數格式化為兩位數的 mm:ss", () => {
		expect(formatRemaining(596)).toBe("09:56");
		expect(formatRemaining(0)).toBe("00:00");
	});
});

describe("純函式性", () => {
	it("remainingSeconds 與 isExpired 皆為純函式，不修改輸入的 timer", () => {
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-03T01:00:00.000Z",
		};
		// 與活參考 timer 比對會在實作就地修改時同時被改動而使斷言恆真，
		// 因此比對基準改用呼叫前留下的深層快照。
		const snapshot = structuredClone(timer);

		remainingSeconds(timer, "2026-09-03T01:00:30.000Z");
		isExpired(timer, "2026-09-03T01:00:30.000Z");

		expect(timer).toEqual(snapshot);
	});
});
