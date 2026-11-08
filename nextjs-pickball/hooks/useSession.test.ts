import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session-client", () => ({
	fetchSession: vi.fn(),
}));

import { fetchSession } from "@/lib/auth/session-client";
import { SIGNED_IN_HINT_STORAGE_KEY } from "@/lib/auth/session-hint";
import { getSnapshot, resetSessionStoreForTests, subscribe } from "@/lib/auth/session-store";
import { useSession } from "./useSession";

const mockedFetchSession = vi.mocked(fetchSession);

const USER = { id: "u1", email: "tester@example.com", name: "測試員" };

describe("useSession", () => {
	beforeEach(() => {
		localStorage.clear();
		resetSessionStoreForTests();
		mockedFetchSession.mockReset();
		mockedFetchSession.mockResolvedValue({ authEnabled: true, user: null });
	});

	it("useSession 回傳 store 快照並隨 refresh 更新", async () => {
		const { result } = renderHook(() => useSession());
		expect(result.current.status).toBe("loading");

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current).toMatchObject({
			status: "ready",
			authEnabled: true,
			user: null,
		});

		mockedFetchSession.mockResolvedValue({ authEnabled: true, user: USER });
		await act(async () => {
			await result.current.refresh();
		});

		expect(result.current).toMatchObject({ status: "ready", user: USER });
		expect(mockedFetchSession).toHaveBeenCalledTimes(2);
	});

	it("伺服器端 render 時 useSession 為 loading 且不發請求", () => {
		function Probe() {
			const session = useSession();
			return createElement("span", null, session.status);
		}

		const html = renderToString(createElement(Probe));

		expect(html).toContain("loading");
		expect(mockedFetchSession).not.toHaveBeenCalled();
	});

	it("store 已為 ready 時伺服器端 render 仍為 loading", async () => {
		subscribe(vi.fn());
		await waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		function Probe() {
			const session = useSession();
			return createElement("span", null, session.status);
		}

		expect(renderToString(createElement(Probe))).toContain("loading");
	});
});

describe("useSession hydration", () => {
	type State = { authEnabled: boolean; user: typeof USER | null };

	beforeEach(() => {
		localStorage.clear();
		resetSessionStoreForTests();
		mockedFetchSession.mockReset();
		mockedFetchSession.mockReturnValue(new Promise<State>(() => {}));
	});

	/** 先以 renderToString 產生伺服器端輸出，再 hydrate，回傳 hydrate 過程的錯誤通報與容器。 */
	async function hydrateFromServer(Probe: () => ReturnType<typeof createElement>) {
		const element = createElement(Probe);
		const html = renderToString(element);
		const container = document.createElement("div");
		document.body.appendChild(container);
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		let consoleErrorCalls = 0;
		try {
			await act(async () => {
				hydrateRoot(container, element, { onRecoverableError });
			});
			consoleErrorCalls = consoleError.mock.calls.length;
		} finally {
			consoleError.mockRestore();
		}
		return { html, container, onRecoverableError, consoleErrorCalls };
	}

	it("有上次登入提示時伺服器端輸出不帶提示、hydration 不產生不一致且完成後反映提示", async () => {
		localStorage.setItem(SIGNED_IN_HINT_STORAGE_KEY, "1");
		resetSessionStoreForTests();
		function Probe() {
			const session = useSession();
			const hinted = session.status === "loading" && session.signedInHint === true;
			return createElement("span", null, hinted ? "hinted" : "plain");
		}

		const { html, container, onRecoverableError, consoleErrorCalls } =
			await hydrateFromServer(Probe);

		expect(html).toContain("plain");
		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(consoleErrorCalls).toBe(0);
		expect(container.textContent).toBe("hinted");
		container.remove();
	});

	it("hydrated 在伺服器端輸出與 hydration 時為 false，hydration 完成後為 true", async () => {
		function Probe() {
			const session = useSession();
			return createElement("span", null, String(session.hydrated));
		}

		const { html, container, onRecoverableError, consoleErrorCalls } =
			await hydrateFromServer(Probe);

		expect(html).toContain("false");
		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(consoleErrorCalls).toBe(0);
		expect(container.textContent).toBe("true");
		container.remove();
	});

	it("client 端一般 mount 的第一次 render 即為 hydrated", () => {
		const seen: boolean[] = [];
		renderHook(() => {
			const session = useSession();
			seen.push(session.hydrated);
			return session;
		});

		expect(seen[0]).toBe(true);
	});
});
