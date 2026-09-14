// components/matchmaker/PlayerForm.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerForm } from "./PlayerForm";

describe("PlayerForm", () => {
	// 所有測試共用的預設 props：onSubmit 與 onCancel 用 vi.fn() mock，
	// 其他必要屬性則依各測試需求設定。
	const createDefaultProps = () => ({
		mode: "add" as const,
		onSubmit: vi.fn(),
		onCancel: vi.fn(),
	});

	it("表單提供新手 1.00、中階 3.00、高階 5.00 三顆快速帶入按鈕", () => {
		render(<PlayerForm {...createDefaultProps()} />);

		// 以可及名稱查找三顆按鈕，驗證其存在；期望值寫死字面值。
		const beginnerBtn = screen.getByRole("button", { name: "新手 1.00" });
		const intermediateBtn = screen.getByRole("button", { name: "中階 3.00" });
		const advancedBtn = screen.getByRole("button", { name: "高階 5.00" });

		expect(beginnerBtn).toBeTruthy();
		expect(intermediateBtn).toBeTruthy();
		expect(advancedBtn).toBeTruthy();
	});

	it("點擊快速帶入按鈕後強度分數欄位填入該級別的兩位小數分數", async () => {
		const user = userEvent.setup();
		render(<PlayerForm {...createDefaultProps()} />);

		// 用 getByLabelText 取得強度分數輸入框，確保不會抓到姓名或兩個 color picker。
		const ratingInput = screen.getByLabelText("強度分數") as HTMLInputElement;

		// 點擊「中階 3.00」，驗證值變成 "3.00"。
		await user.click(screen.getByRole("button", { name: "中階 3.00" }));
		expect(ratingInput.value).toBe("3.00");

		// 續點「高階 5.00」，驗證值被覆蓋為 "5.00"。
		await user.click(screen.getByRole("button", { name: "高階 5.00" }));
		expect(ratingInput.value).toBe("5.00");

		// 再點「新手 1.00」，驗證值被覆蓋為 "1.00"。
		await user.click(screen.getByRole("button", { name: "新手 1.00" }));
		expect(ratingInput.value).toBe("1.00");
	});

	it("快速帶入後仍可手動改為 1.00～8.00 範圍內的兩位小數分數並送出", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(<PlayerForm {...createDefaultProps()} onSubmit={onSubmit} />);

		const ratingInput = screen.getByLabelText("強度分數") as HTMLInputElement;
		const nameInput = screen.getByLabelText("姓名") as HTMLInputElement;
		const submitBtn = screen.getByRole("button", { name: "新增參賽者" });

		// 點擊「新手 1.00」。
		await user.click(screen.getByRole("button", { name: "新手 1.00" }));

		// 清空強度分數欄位，然後輸入自訂值 4.25。
		await user.clear(ratingInput);
		await user.type(ratingInput, "4.25");

		// 填入姓名以通過必填驗證。
		await user.type(nameInput, "王小明");

		// 點擊表單送出按鈕。
		await user.click(submitBtn);

		// 驗證 onSubmit 被呼叫且傳入的 rating 為 4.25，且不等於 1（驗證手動更改確實生效）。
		expect(onSubmit).toHaveBeenCalled();
		expect(onSubmit.mock.calls[0][0].rating).toBe(4.25);
		expect(onSubmit.mock.calls[0][0].rating).not.toBe(1);
	});

	it("快速帶入按鈕不會觸發表單送出", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(<PlayerForm {...createDefaultProps()} onSubmit={onSubmit} />);

		// 姓名欄位留白，只點擊「高階 5.00」按鈕。
		await user.click(screen.getByRole("button", { name: "高階 5.00" }));

		// 驗證 onSubmit 未被呼叫。
		expect(onSubmit).not.toHaveBeenCalled();

		// 驗證畫面上不存在錯誤提示區塊（role="alert"）。
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
