import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(),
}));

vi.mock("@/lib/auth/session-client", () => ({
	signOut: vi.fn(),
}));

import { useSession } from "@/hooks/useSession";
import { signOut } from "@/lib/auth/session-client";
import { AccountEntry } from "./AccountEntry";

const mockUseSession = vi.mocked(useSession);
const mockSignOut = vi.mocked(signOut);

function mockLoggedOut(refresh = vi.fn(async () => {})) {
	mockUseSession.mockReturnValue({
		status: "ready",
		authEnabled: true,
		user: null,
		refresh,
	});
	return refresh;
}

function mockLoggedIn(refresh = vi.fn(async () => {})) {
	mockUseSession.mockReturnValue({
		status: "ready",
		authEnabled: true,
		user: { id: "u1", email: "t@example.com", name: "測試員" },
		refresh,
	});
	return refresh;
}

describe("AccountEntry", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it("載入中或未啟用時不渲染任何元素", () => {
		mockUseSession.mockReturnValue({ status: "loading", refresh: vi.fn() });
		const loading = render(<AccountEntry solid={true} />);
		expect(loading.container.childElementCount).toBe(0);
		loading.unmount();

		mockUseSession.mockReturnValue({
			status: "ready",
			authEnabled: false,
			user: null,
			refresh: vi.fn(),
		});
		const disabled = render(<AccountEntry solid={true} />);
		expect(disabled.container.childElementCount).toBe(0);
	});

	it("啟用且未登入時顯示指向 /login 的登入連結", () => {
		mockLoggedOut();
		render(<AccountEntry solid={true} />);

		const link = screen.getByRole("link", { name: "登入" });
		expect(link.getAttribute("href")).toBe("/login");
		expect(link.className).toContain("whitespace-nowrap");
		expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
	});

	it("已登入時顯示登出按鈕且 title 含使用者名稱", () => {
		mockLoggedIn();
		render(<AccountEntry solid={true} />);

		const button = screen.getByRole("button", { name: "登出" });
		expect(button.getAttribute("title")).toBe("已登入：測試員");
		expect(button.className).toContain("whitespace-nowrap");
		expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		expect(screen.queryByRole("link", { name: "登入" })).toBeNull();
	});

	it("點擊登出後呼叫 signOut 並重新取得 session", async () => {
		const order: string[] = [];
		const refresh = mockLoggedIn(
			vi.fn(async () => {
				order.push("refresh");
			}),
		);
		mockSignOut.mockImplementation(async () => {
			order.push("signOut");
			return true;
		});
		render(<AccountEntry solid={true} />);

		await userEvent.click(screen.getByRole("button", { name: "登出" }));

		expect(mockSignOut).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(order).toEqual(["signOut", "refresh"]);
	});

	it("登入連結與登出按鈕皆套用 shrink-0", () => {
		mockLoggedOut();
		const loggedOut = render(<AccountEntry solid={true} />);
		expect(screen.getByRole("link", { name: "登入" }).className).toContain(
			"shrink-0",
		);
		loggedOut.unmount();

		mockLoggedIn();
		render(<AccountEntry solid={true} />);
		expect(screen.getByRole("button", { name: "登出" }).className).toContain(
			"shrink-0",
		);
	});
});
