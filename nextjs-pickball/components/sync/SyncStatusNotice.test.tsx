import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncStatusNotice } from "./SyncStatusNotice";

describe("SyncStatusNotice", () => {
	it("pending 顯示正在載入資料，loading 顯示雲端文案，local 不渲染", () => {
		const pending = render(<SyncStatusNotice status="pending" />);
		expect(screen.getByRole("status").textContent).toBe("正在載入資料…");
		pending.unmount();

		const loading = render(<SyncStatusNotice status="loading" />);
		expect(screen.getByRole("status").textContent).toBe("正在載入雲端資料…");
		loading.unmount();

		const local = render(<SyncStatusNotice status="local" />);
		expect(local.container.innerHTML).toBe("");
	});
});
