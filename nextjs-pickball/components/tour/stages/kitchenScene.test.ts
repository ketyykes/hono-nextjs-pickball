import { describe, it, expect } from "vitest";
import {
	BALL_RADIUS,
	CONTACT_ANGLE,
	CONTACT_POINT,
	GHOST_LANDING,
	NET_TOP_Y,
	NET_X,
	READY_ANGLE,
	TRAIL_DOTS,
	ballPose,
	ghostBallPose,
	ghostTraceOpacity,
	impactRingPose,
	kitchenFlashOpacity,
	landingMarkerOpacity,
	paddleAngle,
	shakeOffset,
	stampPose,
	vignetteOpacity,
} from "./kitchenScene";

describe("ballPose", () => {
	it("進場前（p=0）球不可見", () => {
		expect(ballPose(0).opacity).toBe(0);
	});

	it("飛行途中越網點高於網頂（凌空而非落地彈起）", () => {
		// 取樣飛行窗（0.14–0.52），凡 x 接近球網者 y 必須高於網頂（SVG y 越小越高）
		let nearNetSamples = 0;
		for (let p = 0.14; p <= 0.52; p += 0.005) {
			const pose = ballPose(p);
			if (Math.abs(pose.x - NET_X) <= 6) {
				nearNetSamples += 1;
				expect(pose.y).toBeLessThan(NET_TOP_Y - BALL_RADIUS);
			}
		}
		expect(nearNetSamples).toBeGreaterThan(0);
	});

	it("撞拍瞬間球貼著拍面橫向壓扁", () => {
		// 壓扁窗為 [0.52, 0.6]，取中點檢查：貼直立拍面 → x 壓縮、y 拉伸
		const pose = ballPose(0.56);
		expect(pose.scaleX).toBeLessThan(1);
		expect(pose.scaleY).toBeGreaterThan(1);
		expect(pose.x).toBeCloseTo(CONTACT_POINT[0], 5);
		expect(pose.y).toBeCloseTo(CONTACT_POINT[1], 5);
	});

	it("p=1 球凍結在接觸點、恢復正圓、完全可見（犯規瞬間定格）", () => {
		const pose = ballPose(1);
		expect(pose.x).toBeCloseTo(CONTACT_POINT[0], 5);
		expect(pose.y).toBeCloseTo(CONTACT_POINT[1], 5);
		expect(pose.scaleX).toBe(1);
		expect(pose.scaleY).toBe(1);
		expect(pose.opacity).toBe(1);
	});

	it("球的 x 座標隨進度單調不減（一路向右飛向拍面後凍結）", () => {
		let prevX = ballPose(0.14).x;
		for (let p = 0.15; p <= 1.0001; p += 0.01) {
			const currentX = ballPose(p).x;
			expect(currentX).toBeGreaterThanOrEqual(prevX - 1e-9);
			prevX = currentX;
		}
	});
});

describe("paddleAngle", () => {
	it("p=0 球拍位於預備後引角度", () => {
		expect(paddleAngle(0)).toBeCloseTo(READY_ANGLE, 5);
	});

	it("撞擊瞬間（p=0.52）球拍到達接觸角度", () => {
		expect(paddleAngle(0.52)).toBeCloseTo(CONTACT_ANGLE, 5);
	});

	it("p=1 球拍定格在接觸角度（犯規瞬間凍結）", () => {
		expect(paddleAngle(1)).toBeCloseTo(CONTACT_ANGLE, 5);
	});
});

describe("TRAIL_DOTS", () => {
	it("出現時機沿飛行時序遞增且皆落在 0.14–0.52 飛行窗內", () => {
		expect(TRAIL_DOTS.length).toBeGreaterThan(0);
		let prevAt = 0;
		for (const dot of TRAIL_DOTS) {
			expect(dot.appearAt).toBeGreaterThan(0.14);
			expect(dot.appearAt).toBeLessThan(0.52);
			expect(dot.appearAt).toBeGreaterThan(prevAt);
			prevAt = dot.appearAt;
		}
	});
});

describe("ghostBallPose", () => {
	it("撞擊前（p=0.5）幽靈球不可見", () => {
		expect(ghostBallPose(0.5).opacity).toBe(0);
	});

	it("延伸途中（p=0.65）幽靈球可見且位於接觸點與落點之間", () => {
		const pose = ghostBallPose(0.65);
		expect(pose.opacity).toBeGreaterThan(0);
		expect(pose.x).toBeGreaterThan(CONTACT_POINT[0]);
		expect(pose.x).toBeLessThan(GHOST_LANDING[0]);
	});

	it("p=1 幽靈球已淡出（僅留落點標記）", () => {
		expect(ghostBallPose(1).opacity).toBe(0);
	});
});

describe("ghostTraceOpacity 與 landingMarkerOpacity", () => {
	it("撞擊前（p=0.5）幽靈軌跡與落點標記皆不可見", () => {
		expect(ghostTraceOpacity(0.5)).toBe(0);
		expect(landingMarkerOpacity(0.5)).toBe(0);
	});

	it("p=1 幽靈軌跡與落點標記保持可見（reduced-motion 終點可讀）", () => {
		expect(ghostTraceOpacity(1)).toBeGreaterThan(0);
		expect(landingMarkerOpacity(1)).toBe(1);
	});
});

describe("shakeOffset", () => {
	it("撞擊前（p=0）與 p=1 皆無位移", () => {
		expect(shakeOffset(0)).toEqual({ x: 0, y: 0 });
		expect(shakeOffset(1)).toEqual({ x: 0, y: 0 });
	});

	it("撞擊後短窗內（p=0.53）有明顯震動位移", () => {
		const offset = shakeOffset(0.53);
		expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(1);
	});
});

describe("impactRingPose", () => {
	it("撞擊前（p=0.4）波紋不可見", () => {
		expect(impactRingPose(0.4, 0).opacity).toBe(0);
	});

	it("撞擊後（p=0.58）波紋可見且半徑擴大", () => {
		const ring = impactRingPose(0.58, 0);
		expect(ring.opacity).toBeGreaterThan(0);
		expect(ring.r).toBeGreaterThan(6);
	});

	it("p=1 所有波紋已淡出（終點畫面乾淨）", () => {
		expect(impactRingPose(1, 0).opacity).toBe(0);
		expect(impactRingPose(1, 0.05).opacity).toBe(0);
	});
});

describe("stampPose", () => {
	it("揭示前（p=0.7）犯規印章不可見", () => {
		expect(stampPose(0.7).opacity).toBe(0);
	});

	it("p=1 印章完全落定（scale=1、完全可見）", () => {
		const pose = stampPose(1);
		expect(pose.opacity).toBe(1);
		expect(pose.scale).toBeCloseTo(1, 5);
	});
});

describe("kitchenFlashOpacity", () => {
	it("撞擊前（p=0.4）廚房區無警示紅", () => {
		expect(kitchenFlashOpacity(0.4)).toBe(0);
	});

	it("p=1 廚房區保留警示紅色調（終點狀態傳達違規）", () => {
		expect(kitchenFlashOpacity(1)).toBeGreaterThan(0);
	});
});

describe("vignetteOpacity", () => {
	it("撞擊瞬間（p=0.56）全畫面紅閃達峰值", () => {
		expect(vignetteOpacity(0.56)).toBeGreaterThan(0);
	});

	it("p=1 紅閃已完全退去（終點畫面乾淨）", () => {
		expect(vignetteOpacity(1)).toBe(0);
	});
});
