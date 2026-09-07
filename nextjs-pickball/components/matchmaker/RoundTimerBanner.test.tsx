// components/matchmaker/RoundTimerBanner.test.tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoundTimerBanner } from "./RoundTimerBanner";
import type { RoundTimer } from "@/lib/matchmaker/round-types";
import { ROUND_TIMER_EXPIRED_MESSAGE } from "@/lib/matchmaker/labels";

// useRoundTimer 內部以 setInterval／Date 驅動倒數，本檔以 vi.useFakeTimers() 讓
// 「經過 30 秒」等情境可預期地重現（比照 useRoundTimer.test.ts 既有寫法）。
describe("RoundTimerBanner", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("倒數期間顯示 mm:ss 格式的剩餘時間且每秒遞減", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};

		render(<RoundTimerBanner timer={timer} />);

		expect(screen.getByText("10:00")).not.toBeNull();

		act(() => {
			vi.advanceTimersByTime(30 * 1000);
		});

		expect(screen.queryByText("10:00")).toBeNull();
	});

	// durationMinutes 特意用 20（而非沿用上一個測試的 10），避免「忽略該欄位、
	// 寫死到期秒數」這種恆真實作矇混過關（本 change 已知的恆真形態之一）。
	it("時間到時顯示帶 role alert 的時間到大字與繁體中文提示文案", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 20,
			startedAt: "2026-09-07T00:00:00.000Z",
		};

		render(<RoundTimerBanner timer={timer} />);

		act(() => {
			vi.advanceTimersByTime(20 * 60 * 1000);
		});

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("時間到");
		expect(alert.textContent).toContain(ROUND_TIMER_EXPIRED_MESSAGE);
	});

	it("時間到時播放提示音，同一次到期不因重新渲染而重複播放", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};
		const playChime = vi.fn();

		const { rerender } = render(
			<RoundTimerBanner timer={timer} playChime={playChime} />,
		);

		expect(playChime).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(10 * 60 * 1000);
		});

		expect(playChime).toHaveBeenCalledTimes(1);

		// 因其他 props（不影響 timer）變動觸發重新渲染，同一次到期不應重播。
		rerender(<RoundTimerBanner timer={timer} playChime={playChime} />);

		expect(playChime).toHaveBeenCalledTimes(1);
	});
});
