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
		fallback.unmount();

		const others: UseSessionResult[] = [
			{ status: "loading", signedInHint: true, unavailable: true, hydrated: true, refresh },
			{ status: "loading", signedInHint: true, hydrated: true, refresh },
			{ status: "loading", hydrated: true, refresh },
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
