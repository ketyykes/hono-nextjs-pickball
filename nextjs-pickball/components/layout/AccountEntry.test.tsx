import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(),
}));

vi.mock("@/lib/auth/session-client", () => ({
	signOut: vi.fn(),
}));

// 真實 Link 不會把 transitionTypes 反映到 DOM；以 data 屬性暴露才能觀察。
vi.mock("next/link", () => ({
	default: ({
		href,
		transitionTypes,
		children,
		...rest
	}: {
		href: string;
		transitionTypes?: string[];
		children: React.ReactNode;
	}) => (
		<a href={href} data-transition-types={transitionTypes?.join(",")} {...rest}>
			{children}
		</a>
	),
}));

import { useSession } from "@/hooks/useSession";
import { signOut } from "@/lib/auth/session-client";
import { AccountEntry } from "./AccountEntry";
import { NAV_ITEM_BASE } from "./navItemStyles";

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

// 回傳根元素排序後的 class token；根元素不存在時直接失敗，不讓後續比較在空值上通過。
function rootClassTokens(container: HTMLElement): string[] {
	const root = container.firstElementChild;
	expect(root).not.toBeNull();
	return Array.from(new Set((root?.className ?? "").split(/\s+/)))
		.filter((token) => token !== "")
		.sort();
}

function expectInvisiblePlaceholder(
	container: HTMLElement,
	state: "loading" | "disabled",
) {
	expect(container.childElementCount).toBe(1);
	const root = container.firstElementChild as HTMLElement;
	expect(root.getAttribute("aria-hidden")).toBe("true");
	expect(root.className.split(/\s+/)).toContain("invisible");
	expect(root.getAttribute("data-account-entry")).toBe(state);
	// hidden: true 讓 aria-hidden 的元素也納入查詢，確認真的沒有互動元素。
	expect(screen.queryAllByRole("link", { hidden: true })).toHaveLength(0);
	expect(screen.queryAllByRole("button", { hidden: true })).toHaveLength(0);
	expect(root.querySelector("a, button, input, [tabindex]")).toBeNull();
	const icon = root.firstElementChild;
	expect(icon).not.toBeNull();
	expect(icon?.className.split(/\s+/)).toContain("size-4");
}

describe("AccountEntry", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it("載入中或未啟用時渲染隱形佔位元素且不含互動元素", () => {
		mockUseSession.mockReturnValue({ status: "loading", refresh: vi.fn() });
		const loading = render(<AccountEntry solid={true} />);
		expectInvisiblePlaceholder(loading.container, "loading");
		loading.unmount();

		mockUseSession.mockReturnValue({
			status: "ready",
			authEnabled: false,
			user: null,
			refresh: vi.fn(),
		});
		const disabled = render(<AccountEntry solid={true} />);
		expectInvisiblePlaceholder(disabled.container, "disabled");
	});

	it("佔位元素、登入連結與登出按鈕共用同一組版面 class", () => {
		mockUseSession.mockReturnValue({ status: "loading", refresh: vi.fn() });
		const loading = render(<AccountEntry solid={true} />);
		const placeholder = rootClassTokens(loading.container);
		loading.unmount();

		mockLoggedOut();
		const loggedOut = render(<AccountEntry solid={true} />);
		const loginLink = rootClassTokens(loggedOut.container);
		loggedOut.unmount();

		mockLoggedIn();
		const loggedIn = render(<AccountEntry solid={true} />);
		const logoutButton = rootClassTokens(loggedIn.container);

		expect(placeholder).toEqual([...loginLink, "invisible"].sort());
		expect(logoutButton).toEqual(loginLink);
		for (const token of NAV_ITEM_BASE.split(" ")) {
			expect(placeholder).toContain(token);
			expect(loginLink).toContain(token);
			expect(logoutButton).toContain(token);
		}
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

	it("登入連結與登出按鈕在 sm 以下隱藏", () => {
		mockLoggedOut();
		const loggedOut = render(<AccountEntry solid={true} />);
		const linkClass = screen.getByRole("link", { name: "登入" }).className;
		expect(linkClass).toContain("hidden");
		expect(linkClass).toContain("sm:inline-flex");
		loggedOut.unmount();

		mockLoggedIn();
		render(<AccountEntry solid={true} />);
		const buttonClass = screen.getByRole("button", { name: "登出" }).className;
		expect(buttonClass).toContain("hidden");
		expect(buttonClass).toContain("sm:inline-flex");
	});

	it("登出請求失敗時仍重新取得 session", async () => {
		const refresh = mockLoggedIn();
		mockSignOut.mockResolvedValue(false);
		render(<AccountEntry solid={true} />);

		await userEvent.click(screen.getByRole("button", { name: "登出" }));

		// 失敗時也要 refresh，UI 才會回到伺服器真實的登入狀態。
		expect(mockSignOut).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("登入連結與 navbar 其他前進連結一致，帶 nav-forward 轉場類型", () => {
		mockLoggedOut();
		render(<AccountEntry solid={true} />);

		const link = screen.getByRole("link", { name: "登入" });
		expect(link.getAttribute("data-transition-types")).toBe("nav-forward");
	});
});
