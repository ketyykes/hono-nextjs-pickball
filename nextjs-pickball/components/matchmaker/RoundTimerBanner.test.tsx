// components/matchmaker/RoundTimerBanner.test.tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoundTimerBanner } from "./RoundTimerBanner";
import type { RoundTimer } from "@/lib/matchmaker/round-types";

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

		expect(screen.getByText("10:00")).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(30 * 1000);
		});

		expect(screen.queryByText("10:00")).not.toBeInTheDocument();
	});
});
