// KitchenViolationStage 廚房違規場景的純邏輯：球的飛行、球拍揮擊、幽靈軌跡與撞擊回饋。
// 進度 p 來自 useStageProgress（0→1，1.5s easeOut），所有函式皆為純函式以利單元測試。
//
// 場景敘事（viewBox 0 0 460 270，側視）：站在廚房內的球員在球「落地前」凌空攔截 → 犯規定格。
//   0.00–0.12 場景淡入（球網、廚房警戒區、球員剪影）
//   0.14–0.52 球從左側快速平飛越網（軌跡殘點）
//   0.42–0.52 球拍由預備後引角度加速揮向來球
//   0.52      撞擊瞬間：球貼拍面壓扁、畫面震動、紅色衝擊波、廚房區閃紅
//   0.58–0.78 慢動作揭示：幽靈球沿虛線延伸至「本來會落地」的空心落點標記
//   0.72–0.86 「✕ 犯規」印章砸下定格
// easeOut 讓 0.52 前的飛行在前 0.35s 內快速完成，其後近 1s 皆為慢動作揭示。

export interface BallPose {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	opacity: number;
}

export interface GhostBallPose {
	x: number;
	y: number;
	opacity: number;
}

export interface TrailDot {
	x: number;
	y: number;
	// 球飛過此點的進度時機，軌跡點在此之後亮起
	appearAt: number;
}

export interface RingPose {
	r: number;
	opacity: number;
}

export interface ShakeOffset {
	x: number;
	y: number;
}

export interface StampPose {
	scale: number;
	opacity: number;
}

export const GROUND_Y = 230;
export const NET_X = 130;
export const NET_TOP_Y = 176;
export const KITCHEN_LINE_X = 408;
export const BALL_RADIUS = 7;
// 球拍握把底端（球員前伸的手的位置），球拍繞此點旋轉
export const PADDLE_ANCHOR: readonly [number, number] = [310, 172];
// 球拍預備後引角度與撞擊接觸角度（deg，負值 = 往球網方向傾斜）
export const READY_ANGLE = -50;
export const CONTACT_ANGLE = -28;
// 凌空攔截的接觸點（球心）：貼在拍面朝來球側的前緣、明顯高於地面
export const CONTACT_POINT: readonly [number, number] = [273, 146];
// 幽靈落點（球心）：若未被攔截，球本來會落在球員腳後、仍在廚房內的位置
export const GHOST_LANDING: readonly [number, number] = [388, GROUND_Y - BALL_RADIUS];

// 來球拋物線：左側低平飛入、越過球網、直達接觸點
const BALL_START: readonly [number, number] = [14, 144];
const FLIGHT_CTRL: readonly [number, number] = [105, 88];
// 幽靈延伸拋物線：控制點沿撞擊當下的飛行方向外推，讓虛線看起來是自然的延續
const GHOST_CTRL: readonly [number, number] = [323, 163];

export { BALL_START };

// 各動作的進度窗
const BALL_FADE_IN: readonly [number, number] = [0.08, 0.14];
const FLIGHT_WINDOW: readonly [number, number] = [0.14, 0.52];
const SQUASH_WINDOW: readonly [number, number] = [0.52, 0.6];
const SWING_WINDOW: readonly [number, number] = [0.42, 0.52];
const RECOIL_WINDOW: readonly [number, number] = [0.52, 0.62];
const GHOST_WINDOW: readonly [number, number] = [0.58, 0.72];
const GHOST_FADE_OUT: readonly [number, number] = [0.72, 0.78];
const TRACE_WINDOW: readonly [number, number] = [0.58, 0.66];
const MARKER_WINDOW: readonly [number, number] = [0.7, 0.78];
const SHAKE_WINDOW: readonly [number, number] = [0.52, 0.66];
const STAMP_WINDOW: readonly [number, number] = [0.72, 0.86];
const IMPACT_AT = SQUASH_WINDOW[0];

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
function quadBez(
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
	if (p < FLIGHT_WINDOW[0]) {
		// 尚未起飛：停在起點，於 BALL_FADE_IN 窗內淡入
		return {
			x: BALL_START[0],
			y: BALL_START[1],
			scaleX: 1,
			scaleY: 1,
			opacity: windowProgress(p, BALL_FADE_IN),
		};
	}
	if (p < SQUASH_WINDOW[0]) {
		// 低平快攻拋物線：越過球網、直達拍面
		const u = windowProgress(p, FLIGHT_WINDOW);
		const [x, y] = quadBez(BALL_START, FLIGHT_CTRL, CONTACT_POINT, u);
		return { x, y, scaleX: 1, scaleY: 1, opacity: 1 };
	}
	if (p < SQUASH_WINDOW[1]) {
		// 貼直立拍面的壓扁脈衝：x 壓縮、y 拉伸
		const squash = Math.sin(Math.PI * windowProgress(p, SQUASH_WINDOW));
		return {
			x: CONTACT_POINT[0],
			y: CONTACT_POINT[1],
			scaleX: 1 - 0.32 * squash,
			scaleY: 1 + 0.24 * squash,
			opacity: 1,
		};
	}
	// 犯規瞬間定格：球凍結在接觸點（reduced-motion 的終點狀態）
	return {
		x: CONTACT_POINT[0],
		y: CONTACT_POINT[1],
		scaleX: 1,
		scaleY: 1,
		opacity: 1,
	};
}

// 球拍在進度 p 時的旋轉角度（deg，繞 PADDLE_ANCHOR）：預備後引 → 加速揮擊 → 撞擊回彈 → 定格
export function paddleAngle(p: number): number {
	if (p < SWING_WINDOW[0]) {
		return READY_ANGLE;
	}
	if (p < SWING_WINDOW[1]) {
		// u² 讓揮拍由慢加速到快，呈現鞭擊感
		const u = windowProgress(p, SWING_WINDOW);
		return lerp(READY_ANGLE, CONTACT_ANGLE, u * u);
	}
	if (p < RECOIL_WINDOW[1]) {
		// 撞擊後往回彈一小段再定格在接觸角度
		const s = windowProgress(p, RECOIL_WINDOW);
		return CONTACT_ANGLE - 7 * Math.sin(Math.PI * s);
	}
	return CONTACT_ANGLE;
}

// 沿來球拋物線預先取樣的軌跡點；appearAt 對應球實際飛過該點的進度
function buildTrailDots(): TrailDot[] {
	const dots: TrailDot[] = [];
	const DOT_COUNT = 9;
	for (let i = 0; i < DOT_COUNT; i++) {
		const u = (i + 0.5) / DOT_COUNT;
		const [x, y] = quadBez(BALL_START, FLIGHT_CTRL, CONTACT_POINT, u);
		dots.push({ x, y, appearAt: lerp(FLIGHT_WINDOW[0], FLIGHT_WINDOW[1], u) });
	}
	return dots;
}

export const TRAIL_DOTS: readonly TrailDot[] = buildTrailDots();

// 幽靈球：撞擊後沿延伸拋物線滑向落點，抵達後淡出（教學重點：球本來還沒落地）
export function ghostBallPose(p: number): GhostBallPose {
	if (p < GHOST_WINDOW[0]) {
		return { x: CONTACT_POINT[0], y: CONTACT_POINT[1], opacity: 0 };
	}
	const u = windowProgress(p, GHOST_WINDOW);
	const [x, y] = quadBez(CONTACT_POINT, GHOST_CTRL, GHOST_LANDING, u);
	// 抵達落點後淡出，把視覺焦點交給落點標記
	const fadeOut = windowProgress(p, GHOST_FADE_OUT);
	return { x, y, opacity: 0.55 * (1 - fadeOut) };
}

// 幽靈虛線軌跡的透明度：撞擊後浮現並保持（reduced-motion 終點可讀）
export function ghostTraceOpacity(p: number): number {
	return 0.55 * windowProgress(p, TRACE_WINDOW);
}

// 落點標記（空心虛線圓 + 「還沒落地」標籤）的透明度：幽靈球抵達前後浮現並保持
export function landingMarkerOpacity(p: number): number {
	return windowProgress(p, MARKER_WINDOW);
}

// 撞擊衝擊波紋：自接觸點向外擴散後淡出；delay 讓多道波紋錯開
export function impactRingPose(p: number, delay: number): RingPose {
	const window: readonly [number, number] = [
		SHAKE_WINDOW[0] + delay,
		SHAKE_WINDOW[0] + delay + 0.16,
	];
	const s = windowProgress(p, window);
	if (s <= 0 || s >= 1) {
		return { r: 6, opacity: 0 };
	}
	let opacity: number;
	if (s <= 0.18) {
		opacity = 0.65 * (s / 0.18);
	} else {
		opacity = 0.65 * (1 - (s - 0.18) / 0.82);
	}
	return { r: 6 + 26 * s, opacity };
}

// 撞擊瞬間的畫面震動：衰減正弦，窗兩端皆歸零（p=1 無殘留位移）
export function shakeOffset(p: number): ShakeOffset {
	const s = windowProgress(p, SHAKE_WINDOW);
	if (s <= 0 || s >= 1) {
		return { x: 0, y: 0 };
	}
	const decay = 1 - s;
	return {
		x: 5 * decay * Math.sin(6 * Math.PI * s),
		y: 2.5 * decay * Math.sin(4 * Math.PI * s),
	};
}

// 廚房警戒區的紅色調：撞擊瞬間閃紅後收斂至常駐警示（終點狀態傳達違規）
export function kitchenFlashOpacity(p: number): number {
	if (p < IMPACT_AT) {
		return 0;
	}
	if (p < 0.57) {
		return lerp(0, 0.5, windowProgress(p, [IMPACT_AT, 0.57]));
	}
	if (p < 0.85) {
		return lerp(0.5, 0.28, windowProgress(p, [0.57, 0.85]));
	}
	return 0.28;
}

// 撞擊紅暈：以接觸點為中心的放射漸層短促脈衝，p=1 前完全退去
export function vignetteOpacity(p: number): number {
	if (p < IMPACT_AT) {
		return 0;
	}
	if (p < 0.56) {
		return lerp(0, 0.4, windowProgress(p, [IMPACT_AT, 0.56]));
	}
	return 0.4 * (1 - windowProgress(p, [0.56, 0.66]));
}

// 「✕ 犯規」印章：由大而小砸下（快速收斂）後定格
export function stampPose(p: number): StampPose {
	const s = windowProgress(p, STAMP_WINDOW);
	const settle = 1 - s;
	return {
		scale: 1 + 1.1 * settle * settle,
		opacity: windowProgress(p, [STAMP_WINDOW[0], 0.8]),
	};
}
