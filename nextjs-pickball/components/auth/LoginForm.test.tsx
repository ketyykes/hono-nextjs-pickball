import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(),
}));

vi.mock("@/lib/auth/session-client", () => ({
	signInWithEmail: vi.fn(),
	signOut: vi.fn(),
	startGoogleSignIn: vi.fn(),
}));

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: mockReplace }),
}));

import { useSession } from "@/hooks/useSession";
import {
	signInWithEmail,
	signOut,
	startGoogleSignIn,
} from "@/lib/auth/session-client";
import { LoginForm } from "./LoginForm";

const mockUseSession = vi.mocked(useSession);
const mockSignIn = vi.mocked(signInWithEmail);
const mockSignOut = vi.mocked(signOut);
const mockStartGoogleSignIn = vi.mocked(startGoogleSignIn);

function mockLoggedOut(refresh = vi.fn(async () => {})) {
	mockUseSession.mockReturnValue({
		status: "ready",
		authEnabled: true,
		user: null,
		refresh,
	});
	return refresh;
}

function mockWithMethods(signInMethods: {
	google: boolean;
	emailPassword: boolean;
}) {
	const refresh = vi.fn(async () => {});
	mockUseSession.mockReturnValue({
		status: "ready",
		authEnabled: true,
		user: null,
		signInMethods,
		refresh,
	});
	return refresh;
}

async function fillAndSubmit(email = "a@example.com", password = "pw") {
	const user = userEvent.setup();
	await user.type(screen.getByLabelText("電子郵件"), email);
	await user.type(screen.getByLabelText("密碼"), password);
	await user.click(screen.getByRole("button", { name: "登入" }));
}

describe("LoginForm", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it("載入中不顯示表單也不顯示未開放訊息", () => {
		mockUseSession.mockReturnValue({ status: "loading", refresh: vi.fn() });
		const { container } = render(<LoginForm />);
		expect(container.querySelector("input[type=password]")).toBeNull();
		expect(screen.queryByText("此環境未開放登入")).toBeNull();
	});

	it("未啟用時顯示此環境未開放登入且不顯示表單", () => {
		mockUseSession.mockReturnValue({
			status: "ready",
			authEnabled: false,
			user: null,
			refresh: vi.fn(),
		});
		const { container } = render(<LoginForm />);
		expect(screen.getByText("此環境未開放登入")).toBeTruthy();
		expect(screen.queryAllByRole("textbox")).toEqual([]);
		expect(container.querySelector("input[type=password]")).toBeNull();
	});

	it("已登入時顯示已登入訊息且不顯示表單", () => {
		mockUseSession.mockReturnValue({
			status: "ready",
			authEnabled: true,
			user: { id: "u1", email: "t@example.com", name: "測試員" },
			refresh: vi.fn(),
		});
		const { container } = render(<LoginForm />);
		expect(screen.getByText("已登入：測試員")).toBeTruthy();
		expect(screen.getByRole("link").getAttribute("href")).toBe("/");
		expect(container.querySelector("input[type=password]")).toBeNull();
		expect(screen.queryAllByRole("textbox")).toEqual([]);
	});

	it("已登入時於登入頁點擊登出後呼叫 signOut 並重新取得 session", async () => {
		const refresh = vi.fn(async () => {});
		mockUseSession.mockReturnValue({
			status: "ready",
			authEnabled: true,
			user: { id: "u1", email: "t@example.com", name: "測試員" },
			refresh,
		});
		mockSignOut.mockResolvedValue(true);
		render(<LoginForm />);

		await userEvent.click(screen.getByRole("button", { name: "登出" }));

		expect(mockSignOut).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		// 登出後須先清掉伺服器 session，再重新取得，否則會讀到舊登入態。
		expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(
			refresh.mock.invocationCallOrder[0],
		);
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("送出正確帳密後重新取得 session 並導向首頁", async () => {
		const refresh = mockLoggedOut();
		mockSignIn.mockResolvedValue({ ok: true });
		render(<LoginForm />);
		await fillAndSubmit("a@example.com", "pw");
		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
		expect(mockSignIn).toHaveBeenCalledTimes(1);
		expect(mockSignIn).toHaveBeenCalledWith("a@example.com", "pw");
		expect(refresh).toHaveBeenCalledTimes(1);
		// refresh 必須先於 replace：首頁才能讀到最新 session。
		expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
			mockReplace.mock.invocationCallOrder[0],
		);
	});

	it("送出正確帳密後 refresh 完成前不導向首頁", async () => {
		let resolveRefresh: () => void = () => {};
		const refresh = mockLoggedOut(
			vi.fn(
				() =>
					new Promise<void>((resolve) => {
						resolveRefresh = resolve;
					}),
			),
		);
		mockSignIn.mockResolvedValue({ ok: true });
		render(<LoginForm />);
		await fillAndSubmit();
		await waitFor(() => expect(refresh).toHaveBeenCalled());
		expect(mockReplace).not.toHaveBeenCalled();
		resolveRefresh();
		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
	});

	it("表單欄位型別與 autocomplete 供瀏覽器與 E2E 辨識", () => {
		mockLoggedOut();
		render(<LoginForm />);
		const email = screen.getByLabelText("電子郵件");
		const password = screen.getByLabelText("密碼");
		expect(email.getAttribute("type")).toBe("email");
		expect(password.getAttribute("type")).toBe("password");
		expect(password.getAttribute("autocomplete")).toBe("current-password");
	});

	it("送出表單時阻止瀏覽器預設送出", async () => {
		// 預設送出會以 GET 把帳密放進網址，必須由元件攔下
		mockLoggedOut();
		mockSignIn.mockResolvedValue({ ok: false, reason: "failed" });
		const { container } = render(<LoginForm />);
		const form = container.querySelector("form") as HTMLFormElement;
		const notPrevented = fireEvent.submit(form);
		expect(notPrevented).toBe(false);
		await screen.findByRole("alert");
	});

	it("帳密錯誤時顯示帳號或密碼錯誤並清空密碼", async () => {
		mockLoggedOut();
		mockSignIn.mockResolvedValue({ ok: false, reason: "invalid-credentials" });
		render(<LoginForm />);
		await fillAndSubmit("a@example.com", "pw");
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe("帳號或密碼錯誤");
		expect((screen.getByLabelText("電子郵件") as HTMLInputElement).value).toBe(
			"a@example.com",
		);
		expect((screen.getByLabelText("密碼") as HTMLInputElement).value).toBe("");
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("unavailable 與 failed 分別顯示對應訊息", async () => {
		mockLoggedOut();
		mockSignIn.mockResolvedValueOnce({ ok: false, reason: "unavailable" });
		render(<LoginForm />);
		await fillAndSubmit();
		expect((await screen.findByRole("alert")).textContent).toBe(
			"此環境未開放登入",
		);

		mockSignIn.mockResolvedValueOnce({ ok: false, reason: "failed" });
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("密碼"), "pw");
		await user.click(screen.getByRole("button", { name: "登入" }));
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toBe("登入失敗，請稍後再試"),
		);
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("送出期間登入按鈕為 disabled", async () => {
		mockLoggedOut();
		let resolveSignIn: (value: { ok: false; reason: "failed" }) => void = () => {};
		mockSignIn.mockReturnValue(
			new Promise((resolve) => {
				resolveSignIn = resolve;
			}),
		);
		render(<LoginForm />);
		await fillAndSubmit();
		const button = screen.getByRole("button", { name: "登入" }) as HTMLButtonElement;
		await waitFor(() => expect(button.disabled).toBe(true));
		resolveSignIn({ ok: false, reason: "failed" });
		await waitFor(() => expect(button.disabled).toBe(false));
	});

	it("只啟用 Google 時顯示使用 Google 登入按鈕且不顯示測試帳號表單", () => {
		mockWithMethods({ google: true, emailPassword: false });
		const { container } = render(<LoginForm />);
		expect(screen.getByRole("button", { name: "使用 Google 登入" })).toBeTruthy();
		expect(screen.queryAllByRole("textbox")).toEqual([]);
		expect(container.querySelector("input[type=password]")).toBeNull();
		expect(screen.queryByRole("button", { name: "登入" })).toBeNull();
		expect(screen.queryByText("此環境未開放登入")).toBeNull();
	});

	it("Google 與測試帳號皆啟用時兩種登入方式皆顯示且 Google 在前", () => {
		mockWithMethods({ google: true, emailPassword: true });
		render(<LoginForm />);
		const googleButton = screen.getByRole("button", { name: "使用 Google 登入" });
		const emailInput = screen.getByLabelText("電子郵件");
		expect(screen.getByLabelText("密碼")).toBeTruthy();
		expect(screen.getByRole("button", { name: "登入" })).toBeTruthy();
		// 不用 compareDocumentPosition：happy-dom 對此 DOM 形狀回傳的前後關係是反的。
		const ordered = Array.from(document.querySelectorAll("button, input"));
		expect(ordered.indexOf(googleButton)).toBeGreaterThanOrEqual(0);
		expect(ordered.indexOf(googleButton)).toBeLessThan(
			ordered.indexOf(emailInput),
		);
	});

	// 性質：regression guard。快照不含 signInMethods 時的缺省行為早已如此，
	// 這裡釘住缺省值必須是「只有測試帳號」。
	it("快照不含 signInMethods 時只顯示測試帳號表單", () => {
		mockLoggedOut();
		render(<LoginForm />);
		expect(screen.getByLabelText("電子郵件")).toBeTruthy();
		expect(screen.getByLabelText("密碼")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "使用 Google 登入" })).toBeNull();
	});

	it("點擊使用 Google 登入後呼叫 startGoogleSignIn 且按鈕維持 disabled", async () => {
		mockWithMethods({ google: true, emailPassword: false });
		mockStartGoogleSignIn.mockResolvedValue({ ok: true });
		render(<LoginForm />);
		const button = screen.getByRole("button", {
			name: "使用 Google 登入",
		}) as HTMLButtonElement;

		await userEvent.click(button);

		expect(mockStartGoogleSignIn).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(button.disabled).toBe(true));
		// 結果回傳後頁面即將導向 Google，按鈕不得恢復可點擊
		await Promise.resolve();
		expect(button.disabled).toBe(true);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("Google 登入請求失敗時顯示錯誤訊息並恢復按鈕", async () => {
		mockWithMethods({ google: true, emailPassword: false });
		mockStartGoogleSignIn.mockResolvedValue({ ok: false });
		render(<LoginForm />);
		const button = screen.getByRole("button", {
			name: "使用 Google 登入",
		}) as HTMLButtonElement;

		await userEvent.click(button);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe("Google 登入失敗，請稍後再試");
		await waitFor(() => expect(button.disabled).toBe(false));
	});
});
