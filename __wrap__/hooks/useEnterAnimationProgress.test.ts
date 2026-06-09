import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useEnterAnimationProgress } from "./useEnterAnimationProgress";

vi.mock("motion/react", () => {
	const animate = vi.fn().mockReturnValue({ stop: vi.fn() });
	const useMotionValue = vi.fn().mockImplementation((init: number) => ({
		get: () => init,
		set: vi.fn(),
		on: vi.fn().mockReturnValue(() => {}),
	}));
	return { animate, useMotionValue };
});

type Callback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;

class MockIntersectionObserver {
	static instances: MockIntersectionObserver[] = [];
	callback: Callback;
	options: IntersectionObserverInit;
	observed: Element[] = [];
	disconnected = false;

	constructor(callback: Callback, options: IntersectionObserverInit) {
		this.callback = callback;
		this.options = options;
		MockIntersectionObserver.instances.push(this);
	}

	observe(el: Element) {
		this.observed.push(el);
	}

	disconnect() {
		this.disconnected = true;
	}

	unobserve() {}

	takeRecords() {
		return [];
	}
}

beforeEach(() => {
	MockIntersectionObserver.instances = [];
	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("useEnterAnimationProgress", () => {
	it("元素未進入 viewport 時不觸發 animate", async () => {
		const { animate } = await import("motion/react");
		(animate as unknown as { mockClear: () => void }).mockClear();

		const { result } = renderHook(() => {
			const ref = useRef<HTMLDivElement>(null);
			Object.defineProperty(ref, "current", {
				value: document.createElement("div"),
				writable: true,
			});
			return useEnterAnimationProgress(ref);
		});

		expect(result.current).toBeDefined();
		expect(animate).not.toHaveBeenCalled();
	});

	it("元素進入 viewport 後啟動 0→1 motion 動畫", async () => {
		const { animate } = await import("motion/react");
		(animate as unknown as { mockClear: () => void }).mockClear();

		renderHook(() => {
			const ref = useRef<HTMLDivElement>(null);
			Object.defineProperty(ref, "current", {
				value: document.createElement("div"),
				writable: true,
			});
			return useEnterAnimationProgress(ref);
		});

		const observer = MockIntersectionObserver.instances.at(-1);
		expect(observer).toBeDefined();

		await act(async () => {
			observer?.callback([
				{
					isIntersecting: true,
					intersectionRatio: 0.6,
				} as IntersectionObserverEntry,
			]);
		});

		expect(animate).toHaveBeenCalledTimes(1);
		expect(animate).toHaveBeenCalledWith(
			expect.anything(),
			1,
			expect.objectContaining({ duration: expect.any(Number) }),
		);
	});

	it("once=true 進入後 disconnect observer", async () => {
		renderHook(() => {
			const ref = useRef<HTMLDivElement>(null);
			Object.defineProperty(ref, "current", {
				value: document.createElement("div"),
				writable: true,
			});
			return useEnterAnimationProgress(ref, { once: true });
		});

		const observer = MockIntersectionObserver.instances.at(-1);

		await act(async () => {
			observer?.callback([
				{
					isIntersecting: true,
					intersectionRatio: 0.7,
				} as IntersectionObserverEntry,
			]);
		});

		expect(observer?.disconnected).toBe(true);
	});

	it("卸載時 disconnect observer", () => {
		const { unmount } = renderHook(() => {
			const ref = useRef<HTMLDivElement>(null);
			Object.defineProperty(ref, "current", {
				value: document.createElement("div"),
				writable: true,
			});
			return useEnterAnimationProgress(ref);
		});

		const observer = MockIntersectionObserver.instances.at(-1);
		unmount();
		expect(observer?.disconnected).toBe(true);
	});
});
