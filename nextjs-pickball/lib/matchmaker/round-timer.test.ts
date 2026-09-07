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
		// 非整秒的經過時間：整秒案例測不出取整方式被改動，故取兩個不同的小數位置。
		// 30.4 秒（剩餘 569.6 秒）殺得掉 floor（570 vs 569）但殺不掉 round（同為 570）；
		// 30.9 秒（剩餘 569.1 秒）小數低於 0.5，ceil 為 570 而 round／floor 皆為 569。
		// 兩者並列才真的把取整方式釘在 ceil（Stage 2 獨立 mutation：只有 30.4 秒那筆時，
		// ceil → round 的變異存活）。
		expect(remainingSeconds(timer, "2026-09-03T01:00:30.400Z")).toBe(570);
		expect(remainingSeconds(timer, "2026-09-03T01:00:30.900Z")).toBe(570);
		// 另一種計時長度：本檔其餘案例的 durationMinutes 全為 10，只有單一值時，
		// 「忽略 timer.durationMinutes、直接寫死 10」的實作也會全數綠燈
		// （Stage 2 獨立 mutation 實測存活），故補一筆 20 分鐘的案例。
		expect(
			remainingSeconds(
				{ durationMinutes: 20, startedAt: "2026-09-03T01:00:00.000Z" },
				"2026-09-03T01:00:30.000Z",
			),
		).toBe(1170);
	});

	// regression guard（寫下當下即綠）：補 Stage 2 獨立 mutation 找到的零覆蓋——
	// 拿掉 remainingSeconds 夾上限的 Math.min 後全數測試仍為綠燈。上限夾值不是可有可無的
	// 防禦：formatRemaining 刻意不防禦三位數分鐘，正是建立在「本函式的回傳值必落在
	// [0, durationMinutes * 60]」這個承諾上，兩個決策互相依賴，必須有測試釘住。
	it("nowIso 早於 startedAt（時鐘倒退）時夾在設定長度上限", () => {
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-03T01:00:00.000Z",
		};
		// 倒退 5 分鐘：未夾上限時會算出 900 秒，超過本輪設定的 600 秒。
		expect(remainingSeconds(timer, "2026-09-03T00:55:00.000Z")).toBe(600);
	});

	it("timer 為 null 或 startedAt 為 null 時回傳 null", () => {
		// null 代表「無法計算剩餘時間」，與「剩餘 0 秒」（已到期）是不同語意，
		// 不可共用同一個回傳值。
		expect(remainingSeconds(null, "2026-09-03T01:00:30.000Z")).toBeNull();
		expect(
			remainingSeconds(
				{ durationMinutes: 10, startedAt: null },
				"2026-09-03T01:00:30.000Z",
			),
		).toBeNull();
	});
});

// isExpired 沒有獨立的 spec 驗收 Scenario（spec 的三個 Scenario 都沒有針對它的布林值
// 立案），本 describe 為不對應規格錨點的 regression guard，比照 history-range.test.ts
// 「依傳入的區間篩選」與 round-settings.test.ts 的 courtCountBounds 的既有作法。
describe("isExpired", () => {
	it("剛好到期與已超過到期為 true，未到期與無法計時者為 false", () => {
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-03T01:00:00.000Z",
		};

		expect(isExpired(timer, "2026-09-03T01:00:30.000Z")).toBe(false);
		// 剛好到期（第 600 秒）即為 true——邊界寫成嚴格小於會在此露餡。
		expect(isExpired(timer, "2026-09-03T01:10:00.000Z")).toBe(true);
		expect(isExpired(timer, "2026-09-03T01:11:00.000Z")).toBe(true);
		// 尚未開始的計時器談不上「到期」，回傳 false 而非 true。
		expect(isExpired(null, "2026-09-03T01:00:30.000Z")).toBe(false);
		expect(
			isExpired(
				{ durationMinutes: 10, startedAt: null },
				"2026-09-03T01:00:30.000Z",
			),
		).toBe(false);
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
