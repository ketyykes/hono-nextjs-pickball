import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	readMatchSlot,
	writeMatchSlot,
	readMatchSlots,
	clearMatchSlots,
	clearAllMatchSlots,
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

	// 補充測試（非 test-plan 逐字條目）：mutation 測試時發現拿掉 hasLocalStorage()
	// 守門在既有 4 個 it 下不會轉紅（happy-dom 恆有 window.localStorage），
	// 故另補此測試堵住這個偵測缺口，寫法比照 storage.test.ts 的 SSR 情境。
	it("SSR（無 window）時 read／write／clear 皆不寫入也不 throw", () => {
		const sentinel = JSON.stringify({ m1: createInitialState() });
		localStorage.setItem(MATCH_SLOTS_KEY, sentinel);

		vi.stubGlobal("window", undefined);
		try {
			expect(typeof window).toBe("undefined");
			expect(readMatchSlots()).toEqual({ slots: {}, droppedCount: 0 });
			expect(readMatchSlot("m1")).toBeNull();
			expect(() => writeMatchSlot("m2", createInitialState())).not.toThrow();
			expect(() => clearMatchSlots(["m1"])).not.toThrow();
			expect(() => clearAllMatchSlots()).not.toThrow();
		} finally {
			vi.unstubAllGlobals();
		}

		// guard 生效 → 四個寫入／清除函式都在碰 localStorage 之前就 return
		expect(localStorage.getItem(MATCH_SLOTS_KEY)).toBe(sentinel);
	});

	// 補充測試（非 test-plan 逐字條目）：Stage 2 mutation 測試發現拿掉 hasLocalStorage()
	// 內的 try/catch 後仍全綠——上一個 test 走的是 typeof window 分支，這是另一條
	// 「屬性 getter 直接 throw」的 guard 路徑，寫法比照 storage.test.ts 的同名情境。
	it("存取 localStorage 本身即拋例外（如 Firefox 私密模式）時安全降級", () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			get() {
				throw new DOMException("localStorage is not available");
			},
		});

		try {
			// 自證：確認 patch 真的讓 hasLocalStorage() 內的 window.localStorage 存取拋錯，
			// 否則以下斷言只是在測「storage 正常運作」，變成假防護
			expect(() => window.localStorage).toThrow();
			expect(readMatchSlots()).toEqual({ slots: {}, droppedCount: 0 });
			expect(readMatchSlot("m1")).toBeNull();
			expect(() => writeMatchSlot("m1", createInitialState())).not.toThrow();
			expect(() => clearMatchSlots(["m1"])).not.toThrow();
			expect(() => clearAllMatchSlots()).not.toThrow();
		} finally {
			if (original) {
				Object.defineProperty(globalThis, "localStorage", original);
			} else {
				Reflect.deleteProperty(globalThis, "localStorage");
			}
		}
	});

	// 補充測試（非 test-plan 逐字條目）：Stage 2 mutation 測試發現「解析後不是物件」
	// 這條分支完全沒有測試覆蓋——既有的「整份非 JSON」案例用 "{{{"，會在 JSON.parse
	// 就拋錯而走 catch，永遠碰不到這個分支。拿掉 Array.isArray guard、拿掉該分支的
	// console.warn、乃至整段刪除，四種 mutation 都存活。spec 的 Scenario 明訂
	//「內容不是合法 JSON（**或解析後不是物件**）」，故補此案例。
	it("整份解析後不是物件（JSON 陣列或純量）時清除分槽 key 且不動獨立槽", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		for (const corrupted of ["[]", '[{"m1":1}]', "123", '"m1"']) {
			localStorage.setItem("scoreboard:current:v1", JSON.stringify(createInitialState()));
			localStorage.setItem(MATCH_SLOTS_KEY, corrupted);
			warnSpy.mockClear();

			const { slots, droppedCount } = readMatchSlots();

			expect(slots).toEqual({});
			expect(droppedCount).toBe(0);
			expect(localStorage.getItem(MATCH_SLOTS_KEY)).toBeNull();
			expect(localStorage.getItem("scoreboard:current:v1")).not.toBeNull();
			expect(warnSpy).toHaveBeenCalled();
		}

		warnSpy.mockRestore();
	});

	// 補充測試（非 test-plan 逐字條目）：Stage 2 mutation 測試發現拿掉
	// `raw === null` 早退後仍全綠——那會讓「首次使用、分槽 key 尚不存在」被當成
	// 損壞資料處理（JSON.parse("") 拋錯 → 走 catch → 誤 warn 並誤呼叫 removeItem）。
	it("分槽 key 不存在時視為空集合，不 warn 也不觸發清除", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const removeItemSpy = vi.spyOn(localStorage, "removeItem");

		expect(readMatchSlots()).toEqual({ slots: {}, droppedCount: 0 });
		expect(warnSpy).not.toHaveBeenCalled();
		expect(removeItemSpy).not.toHaveBeenCalled();

		warnSpy.mockRestore();
		removeItemSpy.mockRestore();
	});

	// 補充測試（非 test-plan 逐字條目）：Stage 2 mutation 測試發現這兩個 catch 分支的
	// console.warn 拿掉後全綠。寫入超出配額是 design Risks 明列的失效模式，
	// 寫法比照 storage.test.ts 的「writeScoreboard localStorage 拋例外時不 throw，僅 warn」。
	it("寫入與批次清除遇 localStorage 拋例外時不 throw，僅 warn", () => {
		writeMatchSlot("m1", createInitialState());

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
			throw new DOMException("QuotaExceededError");
		});

		expect(() => writeMatchSlot("m2", createInitialState())).not.toThrow();
		expect(warnSpy).toHaveBeenCalledOnce();

		warnSpy.mockClear();
		expect(() => clearMatchSlots(["m1"])).not.toThrow();
		expect(warnSpy).toHaveBeenCalledOnce();

		setItemSpy.mockRestore();
		warnSpy.mockRestore();
	});
});
