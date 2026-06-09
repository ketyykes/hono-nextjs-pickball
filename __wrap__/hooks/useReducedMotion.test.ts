import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReducedMotion } from "./useReducedMotion";

type Listener = (e: MediaQueryListEvent) => void;

function mockMatchMedia(initial: boolean) {
	let matches = initial;
	const listeners = new Set<Listener>();

	const removeEventListener = vi.fn((_type: string, l: Listener) => {
		listeners.delete(l);
	});

	const mql = {
		get matches() {
			return matches;
		},
		addEventListener: vi.fn((_type: string, l: Listener) => {
			listeners.add(l);
		}),
		removeEventListener,
		// 測試輔助：模擬瀏覽器觸發 change 事件
		dispatch: (next: boolean) => {
			matches = next;
			for (const l of listeners) {
				l({ matches: next } as MediaQueryListEvent);
			}
		},
	};

	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		writable: true,
		value: vi.fn().mockReturnValue(mql),
	});

	return { mql, removeEventListener };
}

describe("useReducedMotion", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("在 prefers-reduced-motion: reduce 啟用時回傳 true", () => {
		mockMatchMedia(true);
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(true);
	});

	it("於 matchMedia change 事件後回傳新值", () => {
		const { mql } = mockMatchMedia(false);
		const { result } = renderHook(() => useReducedMotion());

		expect(result.current).toBe(false);

		act(() => {
			mql.dispatch(true);
		});

		expect(result.current).toBe(true);
	});

	it("卸載時移除 matchMedia 監聽", () => {
		const { removeEventListener } = mockMatchMedia(false);
		const { unmount } = renderHook(() => useReducedMotion());

		unmount();

		expect(removeEventListener).toHaveBeenCalledWith(
			"change",
			expect.any(Function),
		);
	});
});
