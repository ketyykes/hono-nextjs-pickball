import { describe, it, expect } from "vitest";
import {
	BALL_RADIUS,
	CONFETTI_PIECES,
	GROUND_Y,
	SWEET_SPOT,
	TRAIL_DOTS,
	ballPose,
	confettiPiecePose,
	paddlePose,
	quadBez,
} from "./closingScene";

describe("quadBez", () => {
	it("u=0 回傳起點、u=1 回傳終點", () => {
		const p0: readonly [number, number] = [10, 20];
		const c: readonly [number, number] = [50, 0];
		const p1: readonly [number, number] = [90, 40];
		expect(quadBez(p0, c, p1, 0)).toEqual([10, 20]);
		expect(quadBez(p0, c, p1, 1)).toEqual([90, 40]);
	});

	it("u=0.5 為 0.25·起點 + 0.5·控制點 + 0.25·終點", () => {
		const p0: readonly [number, number] = [0, 0];
		const c: readonly [number, number] = [100, 200];
		const p1: readonly [number, number] = [200, 0];
		expect(quadBez(p0, c, p1, 0.5)).toEqual([100, 100]);
	});
});

describe("ballPose", () => {
	it("進場前（p=0）球不可見", () => {
		expect(ballPose(0).opacity).toBe(0);
	});

	it("落地瞬間球壓扁且底部貼齊地面", () => {
		// 落地壓扁窗為 [0.5, 0.555]，取中點檢查
		const pose = ballPose(0.5275);
		expect(pose.scaleX).toBeGreaterThan(1);
		expect(pose.scaleY).toBeLessThan(1);
		expect(pose.y).toBeCloseTo(GROUND_Y - BALL_RADIUS * pose.scaleY, 5);
	});

	it("p=1 球停在甜蜜點且恢復正圓、完全可見", () => {
		const pose = ballPose(1);
		expect(pose.x).toBeCloseTo(SWEET_SPOT[0], 5);
		expect(pose.y).toBeCloseTo(SWEET_SPOT[1], 5);
		expect(pose.scaleX).toBe(1);
		expect(pose.scaleY).toBe(1);
		expect(pose.opacity).toBe(1);
	});

	it("球的 x 座標隨進度單調不減（一路往右飛向球拍）", () => {
		let prevX = ballPose(0.12).x;
		for (let p = 0.13; p <= 1.0001; p += 0.01) {
			const currentX = ballPose(p).x;
			expect(currentX).toBeGreaterThanOrEqual(prevX - 1e-9);
			prevX = currentX;
		}
	});
});

describe("paddlePose", () => {
	it("p=0 球拍位於畫面下方（ty 大於 100）", () => {
		expect(paddlePose(0).ty).toBeGreaterThan(100);
	});

	it("p=1 球拍歸位（ty=0、rotate=0）", () => {
		const pose = paddlePose(1);
		expect(pose.ty).toBeCloseTo(0, 5);
		expect(pose.rotate).toBeCloseTo(0, 5);
	});
});

describe("TRAIL_DOTS", () => {
	it("出現時機沿飛行時序遞增且皆落在 0.12–0.74 區間內", () => {
		expect(TRAIL_DOTS.length).toBeGreaterThan(0);
		let prevAt = 0;
		for (const dot of TRAIL_DOTS) {
			expect(dot.appearAt).toBeGreaterThan(0.12);
			expect(dot.appearAt).toBeLessThan(0.74);
			expect(dot.appearAt).toBeGreaterThan(prevAt);
			prevAt = dot.appearAt;
		}
	});
});

describe("confettiPiecePose", () => {
	it("爆發前（p=0.7）所有粒子不可見", () => {
		for (const piece of CONFETTI_PIECES) {
			expect(confettiPiecePose(0.7, piece).opacity).toBe(0);
		}
	});

	it("爆發中（p=0.88）至少一半粒子可見", () => {
		const visibleCount = CONFETTI_PIECES.filter(
			(piece) => confettiPiecePose(0.88, piece).opacity > 0,
		).length;
		expect(visibleCount).toBeGreaterThanOrEqual(CONFETTI_PIECES.length / 2);
	});

	it("p=1 全部粒子已淡出（reduced-motion 終點狀態乾淨）", () => {
		for (const piece of CONFETTI_PIECES) {
			expect(confettiPiecePose(1, piece).opacity).toBe(0);
		}
	});
});
