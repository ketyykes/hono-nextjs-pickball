import { vi } from "vitest";

type ObserverCallback = IntersectionObserverCallback;

interface MockObserverInstance {
	observe: (target: Element) => void;
	unobserve: (target: Element) => void;
	disconnect: () => void;
	callback: ObserverCallback;
	targets: Set<Element>;
}

// 共用的 IntersectionObserver mock：happy-dom 沒有原生實作。
// 取得目前所有觀察中的 instance，由測試手動觸發 callback 模擬 intersection。
export function setupIntersectionObserverMock() {
	const instances: MockObserverInstance[] = [];

	const MockObserver = vi.fn().mockImplementation(function (
		this: MockObserverInstance,
		callback: ObserverCallback,
	) {
		this.targets = new Set<Element>();
		this.callback = callback;
		this.observe = (target: Element) => {
			this.targets.add(target);
		};
		this.unobserve = (target: Element) => {
			this.targets.delete(target);
		};
		this.disconnect = () => {
			this.targets.clear();
		};
		instances.push(this);
	});

	vi.stubGlobal("IntersectionObserver", MockObserver);

	return {
		instances,
		// 觸發第一個 instance 中目標元素的 intersection 狀態切換
		triggerIntersect: (target: Element, isIntersecting: boolean) => {
			for (const instance of instances) {
				if (!instance.targets.has(target)) continue;
				const entry = {
					isIntersecting,
					target,
					intersectionRatio: isIntersecting ? 1 : 0,
					time: 0,
					boundingClientRect: target.getBoundingClientRect(),
					intersectionRect: target.getBoundingClientRect(),
					rootBounds: null,
				} as IntersectionObserverEntry;
				instance.callback([entry], instance as unknown as IntersectionObserver);
			}
		},
		cleanup: () => {
			vi.unstubAllGlobals();
			instances.length = 0;
		},
	};
}
