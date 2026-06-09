import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrollShadow } from "./useScrollShadow";

describe("useScrollShadow", () => {
	it("應在 scrollY 超過 threshold 時回傳 true", () => {
		const { result } = renderHook(() => useScrollShadow(100));

		expect(result.current).toBe(false);

		act(() => {
			Object.defineProperty(window, "scrollY", {
				configurable: true,
				value: 150,
			});
			window.dispatchEvent(new Event("scroll"));
		});

		expect(result.current).toBe(true);
	});
});
