import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFullscreen } from "./useFullscreen";

describe("useFullscreen", () => {
	afterEach(() => {
		// 每個測試後還原 fullscreenEnabled，避免測試污染
		Object.defineProperty(document, "fullscreenEnabled", {
			configurable: true,
			value: false,
		});
		Object.defineProperty(document, "fullscreenElement", {
			configurable: true,
			value: null,
		});
		vi.restoreAllMocks();
	});

	it("supported=false 時 isSupported 為 false", () => {
		Object.defineProperty(document, "fullscreenEnabled", {
			configurable: true,
			value: false,
		});
		const { result } = renderHook(() => useFullscreen());
		expect(result.current.isSupported).toBe(false);
	});

	it("supported=true 時可 toggle，並呼叫 requestFullscreen", async () => {
		Object.defineProperty(document, "fullscreenEnabled", {
			configurable: true,
			value: true,
		});
		const requestSpy = vi.fn(() => Promise.resolve());
		Object.defineProperty(document.documentElement, "requestFullscreen", {
			configurable: true,
			value: requestSpy,
		});
		Object.defineProperty(document, "fullscreenElement", {
			configurable: true,
			value: null,
		});
		const { result } = renderHook(() => useFullscreen());
		await act(async () => {
			await result.current.toggle();
		});
		expect(requestSpy).toHaveBeenCalled();
	});
});
