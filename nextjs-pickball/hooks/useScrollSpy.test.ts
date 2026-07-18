import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { setupIntersectionObserverMock } from "@/tests/helpers/intersectionObserver";
import { useScrollSpy } from "./useScrollSpy";

describe("useScrollSpy", () => {
	let mock: ReturnType<typeof setupIntersectionObserverMock>;

	beforeEach(() => {
		mock = setupIntersectionObserverMock();
	});

	afterEach(() => {
		mock.cleanup();
	});

	it("應回傳目前可視 section 的 id", () => {
		const courtEl = document.createElement("section");
		courtEl.id = "court";
		const serveEl = document.createElement("section");
		serveEl.id = "serve";
		document.body.append(courtEl, serveEl);

		const { result } = renderHook(() => useScrollSpy(["court", "serve"]));

		act(() => {
			mock.triggerIntersect(serveEl, true);
		});

		expect(result.current).toBe("serve");

		document.body.replaceChildren();
	});
});
