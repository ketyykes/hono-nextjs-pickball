import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// 用 Proxy 把 motion.* 換成記錄 props 的假元件，才能斷言傳給 motion 的動畫參數。
// 手法沿用 components/tour/shared/ScrollTimelineProvider.test.tsx 的既有 precedent。
const capturedProps: Record<string, unknown>[] = [];

vi.mock("motion/react", () => ({
	motion: new Proxy(
		{},
		{
			get: (_target, tag: string) => {
				const Fake = ({
					children,
					...rest
				}: {
					children?: React.ReactNode;
				} & Record<string, unknown>) => {
					capturedProps.push(rest);
					const Tag = tag as "section";
					// 只把 DOM 認得的屬性往下傳，避免 React 對 initial/whileInView 等發出 unknown prop 警告。
					return (
						<Tag id={rest.id as string} className={rest.className as string}>
							{children}
						</Tag>
					);
				};
				return Fake;
			},
		},
	),
}));

// 注意：mock 掉 motion/react 之後不能用它的同名 export，
// 必須 mock repo 自己的 @/hooks/useReducedMotion，否則會被上面的 Proxy 吞成 undefined。
vi.mock("@/hooks/useReducedMotion", () => ({
	useReducedMotion: vi.fn(),
}));

import { Section } from "./Section";

async function setReducedMotion(value: boolean) {
	const { useReducedMotion } = await import("@/hooks/useReducedMotion");
	(
		useReducedMotion as unknown as { mockReturnValue: (v: boolean) => void }
	).mockReturnValue(value);
}

describe("Section", () => {
	beforeEach(() => {
		capturedProps.length = 0;
	});

	it("一般情況下以 whileInView 觸發淡入且 viewport.once 為 true", async () => {
		await setReducedMotion(false);

		render(
			<Section id="court" tag="Part 01" title="球場規則">
				<p>內容</p>
			</Section>,
		);

		const props = capturedProps[0];
		expect(props.initial).toEqual({ opacity: 0, y: 24 });
		expect(props.whileInView).toEqual({ opacity: 1, y: 0 });
		expect((props.viewport as { once: boolean }).once).toBe(true);
	});

	it("prefers-reduced-motion 啟用時不套用 initial 位移", async () => {
		await setReducedMotion(true);

		render(
			<Section id="court" tag="Part 01" title="球場規則">
				<p>內容</p>
			</Section>,
		);

		const props = capturedProps[0];
		// 不得帶入 y 位移；直接以終點狀態渲染。
		expect(props.initial).not.toEqual({ opacity: 0, y: 24 });
		expect(props.whileInView).toBeUndefined();
	});

	it("渲染 id、tag 與 title，children 原樣輸出", async () => {
		await setReducedMotion(false);

		const { container } = render(
			<Section id="kitchen" tag="Part 02" title="非截擊區">
				<p>廚房規則說明</p>
			</Section>,
		);

		expect(container.querySelector("#kitchen")).not.toBeNull();
		expect(screen.getByText("Part 02")).toBeTruthy();
		expect(screen.getByText("非截擊區")).toBeTruthy();
		expect(screen.getByText("廚房規則說明")).toBeTruthy();
	});
});
