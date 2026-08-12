"use client";

import { useRef } from "react";
import {
	motion,
	useMotionValue,
	useTransform,
	type MotionValue,
} from "motion/react";
import { useRouter } from "next/navigation";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";
import { Button } from "@/components/ui/button";
import {
	BALL_RADIUS,
	BOUNCE_POINT,
	CONFETTI_PIECES,
	GROUND_Y,
	NET_X,
	SWEET_SPOT,
	TRAIL_DOTS,
	ballPose,
	confettiPiecePose,
	paddlePose,
	type ConfettiPiece,
	type TrailDot,
} from "@/components/tour/stages/closingScene";

// 匹克球上的洞（相對球心、以球半徑為比例）
const BALL_HOLES: ReadonlyArray<readonly [number, number]> = [
	[0, 0],
	[-0.45, -0.35],
	[0.45, -0.35],
	[-0.45, 0.4],
	[0.45, 0.4],
	[0, -0.62],
	[0, 0.65],
];

// 軌跡點：球飛過後亮起的虛線殘影（呼應 stage 3 兩跳規則的軌跡）
function TrailDotView({
	source,
	dot,
}: {
	source: MotionValue<number>;
	dot: TrailDot;
}) {
	const opacity = useTransform(source, [dot.appearAt, dot.appearAt + 0.03], [0, 0.45]);
	return <motion.circle cx={dot.x} cy={dot.y} r="2.5" fill="#fb923c" style={{ opacity }} />;
}

// 慶祝粒子：從甜蜜點噴出、受重力下墜、尾段淡出。
// 位移／旋轉透過 motion 的 x / y / rotate style 驅動（motion 會輸出合法的 CSS transform；
// 直接餵 SVG transform 字串會被當成無單位的 CSS transform 而失效）。
// 粒子圖形以自身原點為中心繪製，搭配 fill-box 預設 origin（bbox 中心）旋轉即正確。
function ConfettiPieceView({
	source,
	piece,
}: {
	source: MotionValue<number>;
	piece: ConfettiPiece;
}) {
	const x = useTransform(source, (p) => confettiPiecePose(p, piece).x);
	const y = useTransform(source, (p) => confettiPiecePose(p, piece).y);
	const rotate = useTransform(source, (p) => confettiPiecePose(p, piece).rotate);
	const opacity = useTransform(source, (p) => confettiPiecePose(p, piece).opacity);
	if (piece.shape === "rect") {
		return (
			<motion.rect
				x="-3"
				y="-1.5"
				width="6"
				height="3"
				rx="1"
				fill={piece.color}
				style={{ x, y, rotate, opacity }}
			/>
		);
	}
	return <motion.circle r="2.2" fill={piece.color} style={{ x, y, rotate, opacity }} />;
}

// stage 6：收束 CTA。場景敘事：球從左側飛越球網（軌跡虛點）→ 落地一跳（兩跳規則）
// → 右側大球拍接住球（壓扁回彈 + 衝擊波紋）→ 球停在甜蜜點、慶祝粒子爆發 → 標題與按鈕浮現。
// 座標由 closingScene.ts 純函式計算，經 motion 的 x / y / rotate / scale style 驅動；
// 需要非預設旋轉軸心的元素（球拍繞握把）以 originX / originY 明確指定，
// 避免 CSS transform 在 SVG 上預設以 bounding box 中心為 origin 造成的偏移（原版手臂脫臼的成因）。
// 按鈕點擊以 nav-back transition type 觸發 view transition 反向過場並回到 /。
export function ClosingStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);
	const router = useRouter();

	// fallback 設動畫終點 (1)：reduced-motion 直接看到球停在球拍甜蜜點 + 標題 + CTA
	// （否則 progress=null 時 source=0、CTA opacity=0，使用者完全看不到「回到完整指南」按鈕）
	const fallback = useMotionValue(1);
	const source = progress ?? fallback;

	// 場景基礎（地面與球網）淡入
	const sceneOpacity = useTransform(source, [0, 0.12], [0, 1]);

	// 球拍：升起（微過衝）→ 歸位 → 接球下沉回彈。
	// 外層以靜態 attribute transform 定位到 (330, 236)，內層 motion 只負責 y 位移與旋轉；
	// originY=1（fill-box 底部中心）讓旋轉繞握把底端而非 bbox 中心。
	const paddleY = useTransform(source, (p) => paddlePose(p).ty);
	const paddleRotate = useTransform(source, (p) => paddlePose(p).rotate);

	// 球：兩段拋物線 + 落地／接拍壓扁。球本體以原點為中心繪製，
	// fill-box 預設 origin 即為球心，scale 壓扁不會偏移。
	const ballX = useTransform(source, (p) => ballPose(p).x);
	const ballY = useTransform(source, (p) => ballPose(p).y);
	const ballScaleX = useTransform(source, (p) => ballPose(p).scaleX);
	const ballScaleY = useTransform(source, (p) => ballPose(p).scaleY);
	const ballOpacity = useTransform(source, (p) => ballPose(p).opacity);

	// 落地與接拍的衝擊波紋、收尾光圈脈衝
	const bounceRingR = useTransform(source, [0.5, 0.62], [6, 26]);
	const bounceRingOpacity = useTransform(source, [0.5, 0.53, 0.62], [0, 0.6, 0]);
	const catchRingR = useTransform(source, [0.74, 0.88], [8, 34]);
	const catchRingOpacity = useTransform(source, [0.74, 0.77, 0.88], [0, 0.7, 0]);
	const glowRingR = useTransform(source, [0.86, 1], [10, 24]);
	const glowRingOpacity = useTransform(source, [0.86, 0.92, 1], [0, 0.5, 0]);

	// 標題與按鈕在球被接住後浮現
	const ctaOpacity = useTransform(source, [0.62, 0.95], [0, 1]);
	const ctaY = useTransform(source, [0.62, 0.95], [30, 0]);

	const onBack = () => {
		router.push("/", { transitionTypes: ["nav-back"] });
	};

	return (
		<TourStage id="closing" ariaLabel="準備好開始了嗎？" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-8">
					{/* 收尾場景 SVG：球網 + 球飛行軌跡 + 球拍接球 + 慶祝粒子 */}
					<svg
						viewBox="0 0 460 260"
						className="h-[260px] w-[460px] max-md:h-[190px] max-md:w-[336px]"
					>
						{/* 場景基礎：地面與側視球網 */}
						<motion.g style={{ opacity: sceneOpacity }}>
							<line
								x1="16"
								y1={GROUND_Y}
								x2="444"
								y2={GROUND_Y}
								stroke="#475569"
								strokeWidth="2.5"
							/>
							<line
								x1={NET_X}
								y1={GROUND_Y}
								x2={NET_X}
								y2="152"
								stroke="#cbd5e1"
								strokeWidth="3"
							/>
							<line
								x1={NET_X - 7}
								y1="152"
								x2={NET_X + 7}
								y2="152"
								stroke="#fff"
								strokeWidth="4"
								strokeLinecap="round"
							/>
							<line
								x1={NET_X}
								y1="158"
								x2={NET_X}
								y2="206"
								stroke="#fff"
								strokeWidth="1"
								strokeDasharray="3 4"
								opacity="0.5"
							/>
						</motion.g>

						{/* 飛行軌跡虛點 */}
						{TRAIL_DOTS.map((dot) => (
							<TrailDotView key={dot.appearAt} source={source} dot={dot} />
						))}

						{/* 球拍（面朝觀者）：握把 + 圓角拍面 + 甜蜜點 */}
						<g transform="translate(330 236)">
							<motion.g
								style={{ y: paddleY, rotate: paddleRotate, originX: 0.5, originY: 1 }}
							>
								<rect x="-7" y="-38" width="14" height="40" rx="6" fill="#334155" />
								<line x1="-7" y1="-26" x2="7" y2="-23" stroke="#1e293b" strokeWidth="2.5" />
								<line x1="-7" y1="-14" x2="7" y2="-11" stroke="#1e293b" strokeWidth="2.5" />
								<rect x="-30" y="-118" width="60" height="86" rx="24" fill="#fb923c" />
								<rect
									x="-24"
									y="-112"
									width="48"
									height="74"
									rx="19"
									fill="none"
									stroke="rgba(255,255,255,.22)"
									strokeWidth="2"
								/>
								<circle cx="0" cy="-76" r="8" fill="rgba(255,255,255,.16)" />
							</motion.g>
						</g>

						{/* 落地與接拍的衝擊波紋 */}
						<motion.circle
							cx={BOUNCE_POINT[0]}
							cy={GROUND_Y}
							fill="none"
							stroke="#a3e635"
							strokeWidth="2.5"
							r={bounceRingR}
							style={{ opacity: bounceRingOpacity }}
						/>
						<motion.circle
							cx={SWEET_SPOT[0]}
							cy={SWEET_SPOT[1]}
							fill="none"
							stroke="#a3e635"
							strokeWidth="2.5"
							r={catchRingR}
							style={{ opacity: catchRingOpacity }}
						/>
						<motion.circle
							cx={SWEET_SPOT[0]}
							cy={SWEET_SPOT[1]}
							fill="none"
							stroke="#a3e635"
							strokeWidth="2"
							r={glowRingR}
							style={{ opacity: glowRingOpacity }}
						/>

						{/* 匹克球（有洞）：以原點為中心繪製，位移與壓扁由 motion x/y/scale 驅動 */}
						<motion.g
							style={{
								x: ballX,
								y: ballY,
								scaleX: ballScaleX,
								scaleY: ballScaleY,
								opacity: ballOpacity,
							}}
						>
							<circle r={BALL_RADIUS} fill="#a3e635" />
							{BALL_HOLES.map(([hx, hy]) => (
								<circle
									key={`${hx},${hy}`}
									cx={hx * BALL_RADIUS}
									cy={hy * BALL_RADIUS}
									r={BALL_RADIUS * 0.16}
									fill="#0f172a"
									opacity="0.55"
								/>
							))}
						</motion.g>

						{/* 慶祝粒子 */}
						{CONFETTI_PIECES.map((piece, index) => (
							<ConfettiPieceView key={index} source={source} piece={piece} />
						))}
					</svg>

					{/* 標題與按鈕 */}
					<motion.div
						style={{ opacity: ctaOpacity, y: ctaY }}
						className="flex flex-col items-center gap-6"
					>
						<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
							準備好<span className="text-lime-400">開始了嗎？</span>
						</h2>
						<Button
							onClick={onBack}
							className="bg-lime-400 text-slate-900 hover:bg-lime-300"
						>
							回到完整指南
						</Button>
					</motion.div>
				</div>
			</div>
		</TourStage>
	);
}
