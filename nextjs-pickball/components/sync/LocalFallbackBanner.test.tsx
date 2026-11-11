import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocalFallbackBanner } from "./LocalFallbackBanner";
import { useSession, type UseSessionResult } from "@/hooks/useSession";
import { LOCAL_FALLBACK_NOTICE } from "@/lib/sync/sync-status";

vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(),
}));

describe("LocalFallbackBanner", () => {
	afterEach(() => {
		vi.mocked(useSession).mockReset();
	});

	it("只在本機備援時顯示修改只存在這台裝置的提示，其餘快照不渲染", () => {
		const refresh = vi.fn();
		const user = { id: "u1", email: "a@example.com", name: "A" };

		vi.mocked(useSession).mockReturnValue({
			status: "loading",
			localFallback: true,
			hydrated: true,
			refresh,
		});
		const fallback = render(<LocalFallbackBanner />);
		expect(screen.getByRole("status").textContent).toBe(LOCAL_FALLBACK_NOTICE);
		// 層級須低於 ActionBar 專注模式的 z-40 與對話框的 z-50，且不可擋操作、列印時隱藏
		const root = fallback.container.firstElementChild;
		expect(root).not.toBeNull();
		expect(root?.classList.contains("fixed")).toBe(true);
		expect(root?.classList.contains("pointer-events-none")).toBe(true);
		expect(root?.classList.contains("print:hidden")).toBe(true);
		expect(root?.classList.contains("z-30")).toBe(true);
		// 專注模式的操作列固定在 bottom-2，提示要讓到其上方
		expect(root?.classList.contains("[.sb-focus_&]:bottom-16")).toBe(true);
		fallback.unmount();

		const others: UseSessionResult[] = [
			{ status: "loading", signedInHint: true, unavailable: true, hydrated: true, refresh },
			{ status: "loading", signedInHint: true, hydrated: true, refresh },
			{ status: "loading", hydrated: true, refresh },
			{ status: "ready", authEnabled: false, user: null, hydrated: true, refresh },
			{ status: "ready", authEnabled: true, user: null, hydrated: true, refresh },
			{ status: "ready", authEnabled: true, user, hydrated: true, refresh },
		];
		for (const snapshot of others) {
			vi.mocked(useSession).mockReturnValue(snapshot);
			const rendered = render(<LocalFallbackBanner />);
			expect(rendered.container.innerHTML).toBe("");
			rendered.unmount();
		}
	});
});
