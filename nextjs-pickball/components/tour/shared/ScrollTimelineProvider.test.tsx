import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import {
	ScrollTimelineProvider,
	useTourScrollContainer,
	useStageProgress,
} from "./ScrollTimelineProvider";

vi.mock("@/hooks/useReducedMotion", () => ({
	useReducedMotion: vi.fn(),
}));

vi.mock("@/hooks/useEnterAnimationProgress", () => ({
	useEnterAnimationProgress: vi.fn(),
}));

describe("ScrollTimelineProvider", () => {
	it("透過 context 提供 containerRef", () => {
		const containerRef = {
			current: document.createElement("main"),
		};

		const wrapper = ({ children }: { children: ReactNode }) => (
			<ScrollTimelineProvider containerRef={containerRef}>
				{children}
			</ScrollTimelineProvider>
		);

		const { result } = renderHook(() => useTourScrollContainer(), { wrapper });
		expect(result.current).toBe(containerRef);
	});

	it("useTourScrollContainer 在 Provider 外呼叫時回傳 undefined", () => {
		const { result } = renderHook(() => useTourScrollContainer());
		expect(result.current).toBeUndefined();
	});
});

describe("useStageProgress", () => {
	beforeEach(async () => {
		const { useReducedMotion } = await import("@/hooks/useReducedMotion");
		const { useEnterAnimationProgress } = await import(
			"@/hooks/useEnterAnimationProgress"
		);
		(useReducedMotion as unknown as { mockReset: () => void }).mockReset();
		(
			useEnterAnimationProgress as unknown as { mockReset: () => void }
		).mockReset();
	});

	it("reduced motion 啟用時回傳 null", async () => {
		const { useReducedMotion } = await import("@/hooks/useReducedMotion");
		const { useEnterAnimationProgress } = await import(
			"@/hooks/useEnterAnimationProgress"
		);
		(
			useReducedMotion as unknown as {
				mockReturnValue: (v: boolean) => void;
			}
		).mockReturnValue(true);
		const fakeMotionValue = { get: () => 0 };
		(
			useEnterAnimationProgress as unknown as {
				mockReturnValue: (v: unknown) => void;
			}
		).mockReturnValue(fakeMotionValue);

		const wrapper = ({ children }: { children: ReactNode }) => (
			<ScrollTimelineProvider>{children}</ScrollTimelineProvider>
		);

		const { result } = renderHook(
			() => {
				const ref = useRef<HTMLElement>(null);
				return useStageProgress(ref);
			},
			{ wrapper },
		);

		expect(result.current).toBeNull();
	});

	it("非 reduced motion 時回傳 useEnterAnimationProgress 的 motion value", async () => {
		const { useReducedMotion } = await import("@/hooks/useReducedMotion");
		const { useEnterAnimationProgress } = await import(
			"@/hooks/useEnterAnimationProgress"
		);
		(
			useReducedMotion as unknown as {
				mockReturnValue: (v: boolean) => void;
			}
		).mockReturnValue(false);
		const fakeMotionValue = { get: () => 0 };
		(
			useEnterAnimationProgress as unknown as {
				mockReturnValue: (v: unknown) => void;
			}
		).mockReturnValue(fakeMotionValue);

		const wrapper = ({ children }: { children: ReactNode }) => (
			<ScrollTimelineProvider>{children}</ScrollTimelineProvider>
		);

		const { result } = renderHook(
			() => {
				const ref = useRef<HTMLElement>(null);
				return useStageProgress(ref);
			},
			{ wrapper },
		);

		expect(result.current).toBe(fakeMotionValue);
	});
});
