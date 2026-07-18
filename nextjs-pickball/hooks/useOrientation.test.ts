import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOrientation } from "./useOrientation";

describe("useOrientation", () => {
	it("橫向時回 'landscape'", () => {
		vi.spyOn(window, "matchMedia").mockImplementation(
			(query) =>
				({
					matches: query === "(orientation: landscape)",
					media: query,
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
				}) as unknown as MediaQueryList,
		);
		const { result } = renderHook(() => useOrientation());
		expect(result.current).toBe("landscape");
		vi.restoreAllMocks();
	});

	it("直向時回 'portrait'", () => {
		vi.spyOn(window, "matchMedia").mockImplementation(
			(query) =>
				({
					matches: false,
					media: query,
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
				}) as unknown as MediaQueryList,
		);
		const { result } = renderHook(() => useOrientation());
		expect(result.current).toBe("portrait");
		vi.restoreAllMocks();
	});
});
