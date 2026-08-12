// ClosingStage 收尾場景的純邏輯：球的飛行路徑、球拍姿態、軌跡點與慶祝粒子。
// 進度 p 來自 useStageProgress（0→1，1.5s easeOut），所有函式皆為純函式以利單元測試。
//
// 場景時間軸（viewBox 0 0 460 260）：
//   0.00–0.12 場景淡入、球拍從畫面下方升起
//   0.12–0.50 球從左側飛越球網（第一段拋物線 + 軌跡點）
//   0.50–0.555 落地壓扁回彈（呼應兩跳規則：先讓球落地）
//   0.555–0.74 彈起飛向球拍（第二段拋物線）
//   0.74–0.79 球拍接住球：接觸壓扁 + 球拍下沉回彈
//   0.76–1.00 球停在甜蜜點、慶祝粒子爆發後淡出

export interface BallPose {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	opacity: number;
}

export interface PaddlePose {
	// 相對歸位位置的垂直位移（正值 = 往下、離開畫面）
	ty: number;
	rotate: number;
}

export interface TrailDot {
	x: number;
	y: number;
	// 球飛過此點的進度時機，軌跡點在此之後亮起
	appearAt: number;
}

export interface ConfettiPiece {
	vx: number;
	vy: number;
	rotate: number;
	delay: number;
	shape: "rect" | "circle";
	color: string;
}

export interface ConfettiPose {
	x: number;
	y: number;
	rotate: number;
	opacity: number;
}

export const GROUND_Y = 210;
export const NET_X = 170;
export const BALL_RADIUS = 7;
// 球拍甜蜜點（球最後停下的球心位置），對應球拍握把原點 (330, 236) 上方 76
export const SWEET_SPOT: readonly [number, number] = [330, 160];
// 第一跳落點（球心，底部貼齊地面）
export const BOUNCE_POINT: readonly [number, number] = [268, GROUND_Y - BALL_RADIUS];

// 第一段拋物線：左側飛入、越過球網、落地
const ARC1_START: readonly [number, number] = [28, 158];
const ARC1_CTRL: readonly [number, number] = [150, 30];
// 第二段拋物線：落地彈起、被球拍接住
const ARC2_CTRL: readonly [number, number] = [300, 128];

// 各動作的進度窗
const BALL_FADE_IN: readonly [number, number] = [0.08, 0.12];
const ARC1_WINDOW: readonly [number, number] = [0.12, 0.5];
const BOUNCE_WINDOW: readonly [number, number] = [0.5, 0.555];
const ARC2_WINDOW: readonly [number, number] = [0.555, 0.74];
const CATCH_WINDOW: readonly [number, number] = [0.74, 0.79];
const CONFETTI_START = 0.76;
const CONFETTI_DURATION = 0.2;

function clamp01(t: number): number {
	return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

// 將進度 p 映射到 [a, b] 窗內的 0→1
function windowProgress(p: number, window: readonly [number, number]): number {
	return clamp01((p - window[0]) / (window[1] - window[0]));
}

// 二次貝茲曲線取點
export function quadBez(
	p0: readonly [number, number],
	c: readonly [number, number],
	p1: readonly [number, number],
	u: number,
): [number, number] {
	const v = 1 - u;
	return [
		v * v * p0[0] + 2 * u * v * c[0] + u * u * p1[0],
		v * v * p0[1] + 2 * u * v * c[1] + u * u * p1[1],
	];
}

// 球在進度 p 時的位置、壓扁比例與透明度
export function ballPose(p: number): BallPose {
	if (p < ARC1_WINDOW[0]) {
		// 尚未起飛：停在起點，於 BALL_FADE_IN 窗內淡入
		return {
			x: ARC1_START[0],
			y: ARC1_START[1],
			scaleX: 1,
			scaleY: 1,
			opacity: windowProgress(p, BALL_FADE_IN),
		};
	}
	if (p < BOUNCE_WINDOW[0]) {
		// 第一段拋物線：飛越球網
		const u = windowProgress(p, ARC1_WINDOW);
		const [x, y] = quadBez(ARC1_START, ARC1_CTRL, BOUNCE_POINT, u);
		return { x, y, scaleX: 1, scaleY: 1, opacity: 1 };
	}
	if (p < ARC2_WINDOW[0]) {
		// 落地壓扁：底部貼齊地面，壓扁程度以正弦脈衝呈現
		const squash = Math.sin(Math.PI * windowProgress(p, BOUNCE_WINDOW));
		const scaleY = 1 - 0.38 * squash;
		return {
			x: BOUNCE_POINT[0],
			y: GROUND_Y - BALL_RADIUS * scaleY,
			scaleX: 1 + 0.28 * squash,
			scaleY,
			opacity: 1,
		};
	}
	if (p < CATCH_WINDOW[0]) {
		// 第二段拋物線：彈起飛向球拍甜蜜點
		const u = windowProgress(p, ARC2_WINDOW);
		const [x, y] = quadBez(BOUNCE_POINT, ARC2_CTRL, SWEET_SPOT, u);
		return { x, y, scaleX: 1, scaleY: 1, opacity: 1 };
	}
	if (p < CATCH_WINDOW[1]) {
		// 接觸球拍面的壓扁脈衝（面朝觀者，繞球心均勻壓扁即可）
		const squash = Math.sin(Math.PI * windowProgress(p, CATCH_WINDOW));
		return {
			x: SWEET_SPOT[0],
			y: SWEET_SPOT[1],
			scaleX: 1 + 0.18 * squash,
			scaleY: 1 - 0.22 * squash,
			opacity: 1,
		};
	}
	// 停在甜蜜點（reduced-motion 的終點狀態）
	return { x: SWEET_SPOT[0], y: SWEET_SPOT[1], scaleX: 1, scaleY: 1, opacity: 1 };
}

// 球拍在進度 p 時的姿態：升起（微過衝）→ 歸位 → 接球下沉 → 回正
export function paddlePose(p: number): PaddlePose {
	let ty: number;
	if (p < 0.22) {
		ty = lerp(120, -8, windowProgress(p, [0, 0.22]));
	} else if (p < 0.32) {
		ty = lerp(-8, 0, windowProgress(p, [0.22, 0.32]));
	} else {
		ty = 0;
	}
	// 接球瞬間的下沉回彈
	if (p >= CATCH_WINDOW[0] && p < 0.84) {
		ty += 6 * Math.sin(Math.PI * windowProgress(p, [CATCH_WINDOW[0], 0.84]));
	}

	let rotate: number;
	if (p < 0.22) {
		rotate = lerp(14, -5, windowProgress(p, [0, 0.22]));
	} else if (p < 0.34) {
		rotate = lerp(-5, 0, windowProgress(p, [0.22, 0.34]));
	} else if (p >= CATCH_WINDOW[0] && p < 0.9) {
		// 接球時往後仰一點再回正
		const u = windowProgress(p, [CATCH_WINDOW[0], 0.9]);
		rotate = 4 * Math.sin(Math.PI * u);
	} else {
		rotate = 0;
	}
	return { ty, rotate };
}

// 沿兩段拋物線預先取樣的軌跡點；appearAt 對應球實際飛過該點的進度
function buildTrailDots(): TrailDot[] {
	const dots: TrailDot[] = [];
	const ARC1_DOTS = 10;
	for (let i = 0; i < ARC1_DOTS; i++) {
		const u = (i + 0.5) / ARC1_DOTS;
		const [x, y] = quadBez(ARC1_START, ARC1_CTRL, BOUNCE_POINT, u);
		dots.push({ x, y, appearAt: lerp(ARC1_WINDOW[0], ARC1_WINDOW[1], u) });
	}
	const ARC2_DOTS = 4;
	for (let i = 0; i < ARC2_DOTS; i++) {
		const u = (i + 0.5) / ARC2_DOTS;
		const [x, y] = quadBez(BOUNCE_POINT, ARC2_CTRL, SWEET_SPOT, u);
		dots.push({ x, y, appearAt: lerp(ARC2_WINDOW[0], ARC2_WINDOW[1], u) });
	}
	return dots;
}

export const TRAIL_DOTS: readonly TrailDot[] = buildTrailDots();

// 慶祝粒子的初始配置：以固定公式產生（不用亂數，確保 SSR 與測試皆可重現）
function buildConfettiPieces(): ConfettiPiece[] {
	const COLORS = ["#a3e635", "#fb923c", "#f8fafc"];
	const pieces: ConfettiPiece[] = [];
	for (let i = 0; i < 12; i++) {
		// 195°–345°：朝上方扇形噴發（SVG y 軸向下，sin 為負即向上）
		const angleDeg = 195 + (i / 11) * 150;
		const angleRad = (angleDeg * Math.PI) / 180;
		const speedX = 46 + ((i * 7) % 26);
		const speedY = 54 + ((i * 11) % 30);
		let shape: "rect" | "circle";
		if (i % 2 === 0) {
			shape = "rect";
		} else {
			shape = "circle";
		}
		pieces.push({
			vx: Math.cos(angleRad) * speedX,
			vy: Math.sin(angleRad) * speedY,
			rotate: (i * 67) % 360,
			delay: (i % 4) * 0.012,
			shape,
			color: COLORS[i % 3],
		});
	}
	return pieces;
}

export const CONFETTI_PIECES: readonly ConfettiPiece[] = buildConfettiPieces();

// 單一粒子在進度 p 時的位置與透明度：從甜蜜點噴出、受重力下墜、尾段淡出。
// 所有粒子在 p=1 前一定淡出完畢（delay 最大 0.036 + duration 0.2 < 0.24），
// 確保 reduced-motion 直接顯示 p=1 時畫面乾淨。
export function confettiPiecePose(p: number, piece: ConfettiPiece): ConfettiPose {
	const s = clamp01((p - CONFETTI_START - piece.delay) / CONFETTI_DURATION);
	if (s <= 0 || s >= 1) {
		return { x: SWEET_SPOT[0], y: SWEET_SPOT[1], rotate: 0, opacity: 0 };
	}
	let opacity: number;
	if (s > 0.65) {
		opacity = (1 - s) / 0.35;
	} else {
		opacity = 1;
	}
	return {
		x: SWEET_SPOT[0] + piece.vx * s,
		y: SWEET_SPOT[1] - 6 + piece.vy * s + 52 * s * s,
		rotate: piece.rotate * s,
		opacity,
	};
}
