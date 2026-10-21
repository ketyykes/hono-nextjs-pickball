import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session-client", () => ({
	fetchSession: vi.fn(),
}));

import { fetchSession } from "@/lib/auth/session-client";
import { getSnapshot, resetSessionStoreForTests, subscribe } from "@/lib/auth/session-store";
import { useSession } from "./useSession";

const mockedFetchSession = vi.mocked(fetchSession);

const USER = { id: "u1", email: "tester@example.com", name: "測試員" };

describe("useSession", () => {
	beforeEach(() => {
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
