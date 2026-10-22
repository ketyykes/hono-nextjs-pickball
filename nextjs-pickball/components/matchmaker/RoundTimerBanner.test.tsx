// components/matchmaker/RoundTimerBanner.test.tsx
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoundTimerBanner } from "./RoundTimerBanner";
import type { RoundTimer } from "@pickball/core/matchmaker/round-types";
import { ROUND_TIMER_EXPIRED_MESSAGE } from "@pickball/core/matchmaker/labels";

// useRoundTimer 內部以 setInterval／Date 驅動倒數，本檔以 vi.useFakeTimers() 讓
// 「經過 30 秒」等情境可預期地重現（比照 useRoundTimer.test.ts 既有寫法）。
describe("RoundTimerBanner", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("倒數期間顯示 mm:ss 格式的剩餘時間且每秒遞減", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};

		render(<RoundTimerBanner timer={timer} />);

		expect(screen.getByText("10:00")).not.toBeNull();

		act(() => {
			vi.advanceTimersByTime(30 * 1000);
		});

		expect(screen.queryByText("10:00")).toBeNull();
	});

	// durationMinutes 特意用 20（而非沿用上一個測試的 10），避免「忽略該欄位、
	// 寫死到期秒數」這種恆真實作矇混過關（本 change 已知的恆真形態之一）。
	it("時間到時顯示帶 role alert 的時間到大字與繁體中文提示文案", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 20,
			startedAt: "2026-09-07T00:00:00.000Z",
		};

		render(<RoundTimerBanner timer={timer} />);

		act(() => {
			vi.advanceTimersByTime(20 * 60 * 1000);
		});

		const alert = screen.getByRole("alert");
		// 用精確文字比對（getByText 預設 exact match）分別驗證「時間到」大字與提示文案
		// 兩個獨立節點，不用子字串比對（toContain）——ROUND_TIMER_EXPIRED_MESSAGE 本身
		// 就含有「時間到」三個字，子字串比對即使拿掉大字節點也會誤判通過。
		expect(within(alert).getByText("時間到")).not.toBeNull();
		expect(within(alert).getByText(ROUND_TIMER_EXPIRED_MESSAGE)).not.toBeNull();
	});

	// M15 之後計時回合的同分可直接送出並記為平手，舊文案的「平手請再打一球」是錯誤指示
	// （會讓最終送出的比分不再是時間到當下的比分）。斷言用語意片段而非整句逐字比對，
	// 是為了不讓下次微調用字時整條測試失效，同時仍能擋住「改回含『再打一球』舊文案」這個退化。
	it("時間到提示文案說明同分可直接送出平手而非再打一球", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 15,
			startedAt: "2026-09-07T00:00:00.000Z",
		};

		render(<RoundTimerBanner timer={timer} />);

		act(() => {
			vi.advanceTimersByTime(15 * 60 * 1000);
		});

		const alert = screen.getByRole("alert");
		const alertText = alert.textContent ?? "";

		expect(alertText).toContain("同分");
		expect(alertText).toContain("平手");
		expect(alertText).not.toContain("再打一球");
	});

	it("時間到時播放提示音，同一次到期不因重新渲染而重複播放", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};
		const playChime = vi.fn();

		const { rerender } = render(
			<RoundTimerBanner timer={timer} playChime={playChime} />,
		);

		expect(playChime).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(10 * 60 * 1000);
		});

		expect(playChime).toHaveBeenCalledTimes(1);

		// 因其他 props（不影響 timer）變動觸發重新渲染，同一次到期不應重播。
		rerender(<RoundTimerBanner timer={timer} playChime={playChime} />);

		expect(playChime).toHaveBeenCalledTimes(1);
	});

	// 「同一次到期不重播」的保證不能只靠 useEffect 依賴陣列本身（依賴不變就不重跑），
	// 必須靠 useRef 記住「已為哪個 startedAt 播放過」——本測試模擬呼叫端傳入不穩定的
	// 音效函式參考（例如每次 render 都建立新的箭頭函式，而非模組層級具名函式），
	// 讓 playChime 這個 prop 本身變動、觸發 effect 依賴陣列重新執行；即使如此，
	// 同一次到期（startedAt 不變）仍不應呼叫這個新的函式參考。
	it("到期後音效函式參考改變時，新的參考不會被重複呼叫", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const timer: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};
		const firstPlayChime = vi.fn();
		const secondPlayChime = vi.fn();

		const { rerender } = render(
			<RoundTimerBanner timer={timer} playChime={firstPlayChime} />,
		);

		act(() => {
			vi.advanceTimersByTime(10 * 60 * 1000);
		});

		expect(firstPlayChime).toHaveBeenCalledTimes(1);

		rerender(<RoundTimerBanner timer={timer} playChime={secondPlayChime} />);

		expect(secondPlayChime).not.toHaveBeenCalled();
	});

	// regression guard（非 spec 錨點）：去重旗標記錄的是「已為哪個 startedAt 播放過」而非
	// 單純的 boolean，語意是「這一次計時器的這一次到期有沒有播過」——同一輪重新開始計時
	// （新的 startedAt）後再次到期時仍應播放一次。把旗標換成永不重置的 boolean 會讓第二次
	// 到期被永久靜音，且上方任何一個測試都抓不到（審查時實測該變異存活），故補本測試守住。
	it("換成新的計時器後再次到期時會再播放一次", () => {
		vi.setSystemTime(new Date("2026-09-07T00:00:00.000Z"));
		const first: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:00:00.000Z",
		};
		const playChime = vi.fn();

		const { rerender } = render(
			<RoundTimerBanner timer={first} playChime={playChime} />,
		);

		act(() => {
			vi.advanceTimersByTime(10 * 60 * 1000);
		});

		expect(playChime).toHaveBeenCalledTimes(1);

		// 同一個元件實例（未 unmount，useRef 不會重置）收到重新開始計時後的新 startedAt。
		const second: RoundTimer = {
			durationMinutes: 10,
			startedAt: "2026-09-07T00:10:00.000Z",
		};
		rerender(<RoundTimerBanner timer={second} playChime={playChime} />);

		act(() => {
			vi.advanceTimersByTime(10 * 60 * 1000);
		});

		expect(playChime).toHaveBeenCalledTimes(2);
	});

	it("timer 為 null 時不渲染任何內容", () => {
		const { container } = render(<RoundTimerBanner timer={null} />);

		expect(container.firstChild).toBeNull();
	});

	it("timer.startedAt 為 null（尚未開始計時）時不渲染任何內容", () => {
		const timer: RoundTimer = { durationMinutes: 10, startedAt: null };

		const { container } = render(<RoundTimerBanner timer={timer} />);

		expect(container.firstChild).toBeNull();
	});
});
