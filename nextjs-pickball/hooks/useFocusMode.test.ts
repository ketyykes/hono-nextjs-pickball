import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFocusMode } from "./useFocusMode";

describe("useFocusMode", () => {
	afterEach(() => {
		// 每個測試後清掉全域 class，避免測試污染
		document.documentElement.classList.remove("sb-focus");
	});

	it("toggleFocusMode 切換 focusMode 並同步 documentElement 的 sb-focus class", () => {
		const { result } = renderHook(() => useFocusMode({ isFullscreen: false }));
		expect(result.current.focusMode).toBe(false);
		expect(document.documentElement.classList.contains("sb-focus")).toBe(false);

		act(() => {
			result.current.toggleFocusMode();
		});
		expect(result.current.focusMode).toBe(true);
		expect(document.documentElement.classList.contains("sb-focus")).toBe(true);

		act(() => {
			result.current.toggleFocusMode();
		});
		expect(result.current.focusMode).toBe(false);
		expect(document.documentElement.classList.contains("sb-focus")).toBe(false);
	});

	it("isFullscreen 由 true 變 false 時自動退出 focus mode", () => {
		const { result, rerender } = renderHook(
			({ isFullscreen }: { isFullscreen: boolean }) =>
				useFocusMode({ isFullscreen }),
			{ initialProps: { isFullscreen: false } },
		);

		// 進入專注模式，隨後 fullscreen 生效
		act(() => {
			result.current.toggleFocusMode();
		});
		rerender({ isFullscreen: true });
		expect(result.current.focusMode).toBe(true);

		// Esc／系統手勢退出 fullscreen → 同步退出專注模式
		rerender({ isFullscreen: false });
		expect(result.current.focusMode).toBe(false);
		expect(document.documentElement.classList.contains("sb-focus")).toBe(false);
	});

	it("isFullscreen 恆為 false（不支援裝置）時不會誤退 focus mode", () => {
		const { result, rerender } = renderHook(
			({ isFullscreen }: { isFullscreen: boolean }) =>
				useFocusMode({ isFullscreen }),
			{ initialProps: { isFullscreen: false } },
		);

		act(() => {
			result.current.toggleFocusMode();
		});
		expect(result.current.focusMode).toBe(true);

		// isFullscreen 從未變 true 的裝置，多次 re-render 不得誤退
		rerender({ isFullscreen: false });
		rerender({ isFullscreen: false });
		expect(result.current.focusMode).toBe(true);
		expect(document.documentElement.classList.contains("sb-focus")).toBe(true);
	});

	it("unmount 時移除 sb-focus class", () => {
		const { result, unmount } = renderHook(() =>
			useFocusMode({ isFullscreen: false }),
		);

		act(() => {
			result.current.toggleFocusMode();
		});
		expect(document.documentElement.classList.contains("sb-focus")).toBe(true);

		unmount();
		expect(document.documentElement.classList.contains("sb-focus")).toBe(false);
	});
});
