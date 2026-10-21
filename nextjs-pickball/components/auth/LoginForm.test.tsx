import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(),
}));

vi.mock("@/lib/auth/session-client", () => ({
	signInWithEmail: vi.fn(),
}));

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: mockReplace }),
}));

import { useSession } from "@/hooks/useSession";
import { signInWithEmail } from "@/lib/auth/session-client";
import { LoginForm } from "./LoginForm";

const mockUseSession = vi.mocked(useSession);
const mockSignIn = vi.mocked(signInWithEmail);

function mockLoggedOut(refresh = vi.fn(async () => {})) {
	mockUseSession.mockReturnValue({
		status: "ready",
		authEnabled: true,
		user: null,
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
});
