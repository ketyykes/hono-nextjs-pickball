import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrolledPast } from "./useScrolledPast";

describe("useScrolledPast", () => {
	it("應在 scrollY 超過固定 threshold 時回傳 true", () => {
		Object.defineProperty(window, "scrollY", {
			configurable: true,
			value: 0,
		});

		const { result } = renderHook(() => useScrolledPast(500));

		expect(result.current).toBe(false);

		act(() => {
			Object.defineProperty(window, "scrollY", {
				configurable: true,
				value: 600,
			});
			window.dispatchEvent(new Event("scroll"));
		});

		expect(result.current).toBe(true);
	});

	it("應以 function threshold 動態判定是否已捲過門檻", () => {
		Object.defineProperty(window, "innerHeight", {
			configurable: true,
			value: 800,
		});
		Object.defineProperty(window, "scrollY", {
			configurable: true,
			value: 0,
		});

		const { result } = renderHook(() =>
			useScrolledPast(() => window.innerHeight - 56),
		);

		expect(result.current).toBe(false);

		act(() => {
			Object.defineProperty(window, "scrollY", {
				configurable: true,
				value: 800,
			});
			window.dispatchEvent(new Event("scroll"));
		});

		expect(result.current).toBe(true);
	});
});
