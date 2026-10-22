import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRoundTimer } from "./useRoundTimer";
import type { RoundTimer } from "@pickball/core/matchmaker/round-types";

// useFakeTimers 同時假造 Date，這是本測試能以 setInterval 驅動又保持結果可預期的前提；
// 必須在 beforeEach／afterEach 正確切換，否則會污染同檔或其他測試檔的計時行為。
describe("useRoundTimer", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("每秒更新剩餘秒數，超過設定長度後 expired 回傳 true", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};

		const { result } = renderHook(() => useRoundTimer(timer));
		const initialRemaining = result.current.remainingSeconds;
		expect(initialRemaining).toBe(10 * 60);

		act(() => {
			vi.advanceTimersByTime(30 * 1000);
		});

		expect(result.current.remainingSeconds).not.toBeNull();
		expect(result.current.remainingSeconds as number).toBeLessThan(
			initialRemaining as number,
		);
		expect(result.current.expired).toBe(false);

		act(() => {
			// 再前進至超過 10 分鐘後
			vi.advanceTimersByTime(11 * 60 * 1000);
		});

		expect(result.current.expired).toBe(true);
	});

	// durationMinutes 特意用 20（而非只沿用主測試的 10），避免「忽略該欄位、
	// 寫死 600 秒」這種恆真實作矇混過關（本 change 已知的恆真形態之一）。
	it("durationMinutes 20 分鐘時，初始剩餘秒數以 20 分鐘為基準", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 20,
			startedAt: "2026-09-07T00:00:00.000Z",
		};

		const { result } = renderHook(() => useRoundTimer(timer));

		expect(result.current.remainingSeconds).toBe(20 * 60);
	});

	// 對應「初始值必須是現在」：計時已開始 5 分鐘後才掛載，第一次 render（尚未 tick）
	// 就要算出 5 分鐘。若把 useState 初始值寫成固定的過去時間，remainingSeconds 的上限
	// 夾值會把它夾成完整的 10 分鐘——看起來像正常值卻是錯的，缺這條斷言就抓不到。
	it("計時已開始一段時間後才掛載時，首次 render 即反映已流逝的時間", () => {
		vi.setSystemTime(new Date("2026-09-07T00:05:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};

		const { result } = renderHook(() => useRoundTimer(timer));

		expect(result.current.remainingSeconds).toBe(5 * 60);
	});

	it("timer 為 null 時不啟動 interval", () => {
		renderHook(() => useRoundTimer(null));

		expect(vi.getTimerCount()).toBe(0);
	});

	it("startedAt 為 null（尚未開始）時不啟動 interval", () => {
		const timer: RoundTimer = { durationMinutes: 10, startedAt: null };

		renderHook(() => useRoundTimer(timer));

		expect(vi.getTimerCount()).toBe(0);
	});

	it("unmount 後清除 interval，不遺留計時器", () => {
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};

		const { unmount } = renderHook(() => useRoundTimer(timer));
		expect(vi.getTimerCount()).toBeGreaterThan(0);

		unmount();

		expect(vi.getTimerCount()).toBe(0);
	});

	it("timer 從 null 變為有效值時才開始建立 interval 並持續更新", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));

		const { result, rerender } = renderHook(
			({ timer }: { timer: RoundTimer }) => useRoundTimer(timer),
			{ initialProps: { timer: null as RoundTimer } },
		);
		expect(vi.getTimerCount()).toBe(0);

		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};
		rerender({ timer });
		expect(vi.getTimerCount()).toBeGreaterThan(0);

		const before = result.current.remainingSeconds;
		act(() => {
			vi.advanceTimersByTime(1000);
		});

		expect(result.current.remainingSeconds).toBeLessThan(before as number);
	});
});
