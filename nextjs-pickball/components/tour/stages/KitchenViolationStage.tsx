"use client";

import { useRef } from "react";
import {
	motion,
	useMotionValue,
	useTransform,
	type MotionValue,
} from "motion/react";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";
import {
	BALL_RADIUS,
	CONTACT_POINT,
	GHOST_LANDING,
	GROUND_Y,
	KITCHEN_LINE_X,
	NET_TOP_Y,
	NET_X,
	PADDLE_ANCHOR,
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
	type TrailDot,
} from "@/components/tour/stages/kitchenScene";

// 匹克球上的洞（相對球心、以球半徑為比例），與 ClosingStage 同款視覺語言
const BALL_HOLES: ReadonlyArray<readonly [number, number]> = [
	[0, 0],
	[-0.45, -0.35],
	[0.45, -0.35],
	[-0.45, 0.4],
	[0.45, 0.4],
	[0, -0.62],
	[0, 0.65],
];

// 軌跡點：球飛過後亮起的虛線殘影
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

// 撞擊衝擊波紋：自接觸點向外擴散的紅色圓環，delay 讓兩道波紋錯開
function ImpactRingView({
	source,
	delay,
}: {
	source: MotionValue<number>;
	delay: number;
}) {
	const r = useTransform(source, (p) => impactRingPose(p, delay).r);
	const opacity = useTransform(source, (p) => impactRingPose(p, delay).opacity);
	return (
		<motion.circle
			cx={CONTACT_POINT[0]}
			cy={CONTACT_POINT[1]}
			fill="none"
			stroke="#f87171"
			strokeWidth="2.5"
			r={r}
			style={{ opacity }}
		/>
	);
}

// stage 4：廚房違規。側視場景敘事：球員站在廚房警戒區內 → 來球快速平飛越網 →
// 球拍在「球落地前」凌空攔截（撞擊震動 + 紅色衝擊波 + 廚房區閃紅）→
// 慢動作揭示幽靈軌跡與「本來會落地」的空心落點 → 「✕ 犯規」印章砸下定格。
// 座標由 kitchenScene.ts 純函式計算，經 motion 的 x / y / rotate / scale style 驅動；
// 球拍繞握把底端旋轉，以 originX / originY 明確指定旋轉軸心（同 ClosingStage 的做法）。
// z-order 原則：警戒紅 flash 只染背景區塊層，球員、球拍與球維持清晰。
export function KitchenViolationStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	// fallback 設動畫終點 (1)：reduced-motion 直接看到犯規定格畫面
	// （球凍結在拍面、幽靈軌跡與落點標記、犯規印章、廚房警戒紅）
	const fallback = useMotionValue(1);
	const source = progress ?? fallback;

	// 場景基礎（地面、球網、廚房區、球員剪影）淡入
	const sceneOpacity = useTransform(source, [0, 0.12], [0, 1]);

	// 球：低平快攻拋物線 → 貼拍面壓扁 → 定格
	const ballX = useTransform(source, (p) => ballPose(p).x);
	const ballY = useTransform(source, (p) => ballPose(p).y);
	const ballScaleX = useTransform(source, (p) => ballPose(p).scaleX);
	const ballScaleY = useTransform(source, (p) => ballPose(p).scaleY);
	const ballOpacity = useTransform(source, (p) => ballPose(p).opacity);

	// 球拍：預備後引 → 加速揮擊 → 撞擊回彈 → 定格在接觸角度
	const paddleRotate = useTransform(source, (p) => paddleAngle(p));

	// 幽靈球與其虛線軌跡、落點標記
	const ghostX = useTransform(source, (p) => ghostBallPose(p).x);
	const ghostY = useTransform(source, (p) => ghostBallPose(p).y);
	const ghostOpacity = useTransform(source, (p) => ghostBallPose(p).opacity);
	const traceOpacity = useTransform(source, (p) => ghostTraceOpacity(p));
	const markerOpacity = useTransform(source, (p) => landingMarkerOpacity(p));

	// 撞擊回饋：畫面震動、廚房區閃紅、全畫面紅閃
	const shakeX = useTransform(source, (p) => shakeOffset(p).x);
	const shakeY = useTransform(source, (p) => shakeOffset(p).y);
	const flashOpacity = useTransform(source, (p) => kitchenFlashOpacity(p));
	const vignette = useTransform(source, (p) => vignetteOpacity(p));

	// 「✕ 犯規」印章
	const stampScale = useTransform(source, (p) => stampPose(p).scale);
	const stampOpacity = useTransform(source, (p) => stampPose(p).opacity);

	// 說明文字在印章落定後浮現
	const captionOpacity = useTransform(source, [0.78, 0.96], [0, 1]);
	const captionY = useTransform(source, [0.78, 0.96], [16, 0]);

	return (
		<TourStage
			id="kitchen-violation"
			ariaLabel="廚房：站在裡面絕對不能截擊"
			stageRef={ref}
		>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-8">
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						廚房：<span className="text-orange-500">絕對不能截擊</span>
					</h2>

					{/* 側視場景 SVG：球網 + 廚房警戒區 + 球員凌空攔截 + 幽靈落點 + 犯規印章 */}
					<svg
						viewBox="0 0 460 270"
						className="h-[270px] w-[460px] max-md:h-[196px] max-md:w-[334px]"
					>
						<defs>
							{/* 廚房區的空氣感漸層：貼地最濃、向上淡出 */}
							<linearGradient id="kitchen-air-grad" x1="0" y1="1" x2="0" y2="0">
								<stop offset="0" stopColor="#fb923c" stopOpacity="0.24" />
								<stop offset="1" stopColor="#fb923c" stopOpacity="0" />
							</linearGradient>
							{/* 廚房警戒紅的漸層：同樣貼地最濃、向上淡出，避免硬直的上緣 */}
							<linearGradient id="kitchen-flash-grad" x1="0" y1="1" x2="0" y2="0">
								<stop offset="0" stopColor="#ef4444" stopOpacity="0.9" />
								<stop offset="1" stopColor="#ef4444" stopOpacity="0" />
							</linearGradient>
							{/* 撞擊紅暈：以接觸點為中心向外淡出，避免整塊 SVG 變紅的硬邊 */}
							<radialGradient
								id="impact-flash-grad"
								gradientUnits="userSpaceOnUse"
								cx={CONTACT_POINT[0]}
								cy={CONTACT_POINT[1]}
								r="240"
							>
								<stop offset="0" stopColor="#ef4444" stopOpacity="0.9" />
								<stop offset="1" stopColor="#ef4444" stopOpacity="0" />
							</radialGradient>
						</defs>

						{/* 撞擊震動套用於整個場景群組 */}
						<motion.g style={{ x: shakeX, y: shakeY }}>
							{/* 背景區塊層：廚房區漸層與地板色帶（警戒紅 flash 只染這一層） */}
							<motion.g style={{ opacity: sceneOpacity }}>
								<rect
									x={NET_X}
									y="152"
									width={KITCHEN_LINE_X - NET_X}
									height={GROUND_Y - 152}
									fill="url(#kitchen-air-grad)"
								/>
								<rect
									x={NET_X}
									y={GROUND_Y}
									width={KITCHEN_LINE_X - NET_X}
									height="20"
									fill="#fb923c"
									opacity="0.3"
								/>
							</motion.g>
							<motion.g style={{ opacity: flashOpacity }}>
								<rect
									x={NET_X}
									y="152"
									width={KITCHEN_LINE_X - NET_X}
									height={GROUND_Y - 152}
									fill="url(#kitchen-flash-grad)"
								/>
								<rect
									x={NET_X}
									y={GROUND_Y}
									width={KITCHEN_LINE_X - NET_X}
									height="20"
									fill="#ef4444"
									opacity="0.85"
								/>
							</motion.g>

							{/* 線條與標示層 */}
							<motion.g style={{ opacity: sceneOpacity }}>
								{/* 地面 */}
								<line
									x1="8"
									y1={GROUND_Y}
									x2="452"
									y2={GROUND_Y}
									stroke="#475569"
									strokeWidth="2.5"
								/>

								{/* 廚房線與標示 */}
								<line
									x1={KITCHEN_LINE_X}
									y1={GROUND_Y}
									x2={KITCHEN_LINE_X}
									y2="172"
									stroke="#fb923c"
									strokeWidth="2"
									strokeDasharray="5 5"
									opacity="0.8"
								/>
								<text
									x={KITCHEN_LINE_X}
									y="164"
									textAnchor="middle"
									fill="rgba(255,255,255,.45)"
									fontSize="10"
									fontFamily="sans-serif"
								>
									廚房線
								</text>
								<text
									x={(NET_X + KITCHEN_LINE_X) / 2}
									y={GROUND_Y + 14.5}
									textAnchor="middle"
									fill="rgba(255,255,255,.85)"
									fontSize="12"
									fontWeight="bold"
									fontFamily="sans-serif"
								>
									廚房 NVZ
								</text>

								{/* 側視球網 */}
								<line
									x1={NET_X}
									y1={GROUND_Y}
									x2={NET_X}
									y2={NET_TOP_Y}
									stroke="#cbd5e1"
									strokeWidth="3"
								/>
								<line
									x1={NET_X - 7}
									y1={NET_TOP_Y}
									x2={NET_X + 7}
									y2={NET_TOP_Y}
									stroke="#fff"
									strokeWidth="4"
									strokeLinecap="round"
								/>
								<line
									x1={NET_X}
									y1={NET_TOP_Y + 6}
									x2={NET_X}
									y2={GROUND_Y - 6}
									stroke="#fff"
									strokeWidth="1"
									strokeDasharray="3 4"
									opacity="0.5"
								/>
								<text
									x={NET_X}
									y="166"
									textAnchor="middle"
									fill="rgba(255,255,255,.5)"
									fontSize="10"
									fontFamily="sans-serif"
								>
									網
								</text>
							</motion.g>

							{/* 幽靈軌跡：球「本來會」繼續飛到球員腳後落地的虛線延伸（畫在球員後方） */}
							<motion.path
								d={`M ${CONTACT_POINT[0]} ${CONTACT_POINT[1]} Q 323 163 ${GHOST_LANDING[0]} ${GHOST_LANDING[1]}`}
								fill="none"
								stroke="#a3e635"
								strokeWidth="2"
								strokeDasharray="5 6"
								style={{ opacity: traceOpacity }}
							/>
							<motion.g style={{ opacity: markerOpacity }}>
								<circle
									cx={GHOST_LANDING[0]}
									cy={GHOST_LANDING[1]}
									r="9"
									fill="none"
									stroke="#a3e635"
									strokeWidth="2"
									strokeDasharray="4 4"
								/>
								<text
									x={KITCHEN_LINE_X - 4}
									y={GROUND_Y + 15.5}
									textAnchor="end"
									fill="#a3e635"
									fontSize="11"
									fontWeight="bold"
									fontFamily="sans-serif"
								>
									還沒落地！
								</text>
							</motion.g>

							{/* 幽靈球：沿延伸軌跡滑向落點的空心球 */}
							<motion.circle
								r={BALL_RADIUS}
								fill="none"
								stroke="#a3e635"
								strokeWidth="1.5"
								strokeDasharray="3 3"
								style={{ x: ghostX, y: ghostY, opacity: ghostOpacity }}
							/>

							{/* 站在廚房內的球員剪影：前傾攔截姿勢（頭、軀幹、前伸手臂、雙腿與鞋） */}
							<motion.g
								style={{ opacity: sceneOpacity }}
								fill="#64748b"
								stroke="#64748b"
							>
								<circle cx="352" cy="116" r="9.5" stroke="none" />
								<line
									x1="350"
									y1="134"
									x2="345"
									y2="188"
									strokeWidth="15"
									strokeLinecap="round"
								/>
								<line
									x1="348"
									y1="144"
									x2="313"
									y2="170"
									strokeWidth="7"
									strokeLinecap="round"
								/>
								<line
									x1="343"
									y1="187"
									x2="331"
									y2="220"
									strokeWidth="7"
									strokeLinecap="round"
								/>
								<line
									x1="346"
									y1="187"
									x2="361"
									y2="220"
									strokeWidth="7"
									strokeLinecap="round"
								/>
								<rect x="320" y="222" width="22" height="8" rx="4" stroke="none" />
								<rect x="352" y="222" width="22" height="8" rx="4" stroke="none" />
							</motion.g>

							{/* 飛行軌跡虛點 */}
							{TRAIL_DOTS.map((dot) => (
								<TrailDotView key={dot.appearAt} source={source} dot={dot} />
							))}

							{/* 球拍：外層靜態定位到握把底端，內層 motion 只負責繞軸心旋轉 */}
							<g transform={`translate(${PADDLE_ANCHOR[0]} ${PADDLE_ANCHOR[1]})`}>
								<motion.g
									style={{ rotate: paddleRotate, originX: 0.5, originY: 1 }}
								>
									<rect x="-4.5" y="-18" width="9" height="20" rx="4" fill="#334155" />
									<rect x="-14" y="-62" width="28" height="46" rx="12" fill="#fb923c" />
									<rect
										x="-10.5"
										y="-57.5"
										width="21"
										height="37"
										rx="9"
										fill="none"
										stroke="rgba(255,255,255,.22)"
										strokeWidth="1.5"
									/>
								</motion.g>
							</g>

							{/* 撞擊衝擊波紋（兩道錯開） */}
							<ImpactRingView source={source} delay={0} />
							<ImpactRingView source={source} delay={0.05} />

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

							{/* 撞擊紅暈：以接觸點為中心的放射漸層短促脈衝 */}
							<motion.rect
								x="0"
								y="0"
								width="460"
								height="270"
								fill="url(#impact-flash-grad)"
								style={{ opacity: vignette }}
							/>
						</motion.g>

						{/* 「✕ 犯規」印章：由大而小砸下定格 */}
						<g transform="translate(240 78) rotate(-8)">
							<motion.g
								style={{
									scale: stampScale,
									opacity: stampOpacity,
									originX: 0.5,
									originY: 0.5,
								}}
							>
								<rect
									x="-78"
									y="-28"
									width="156"
									height="56"
									rx="10"
									fill="rgba(239,68,68,.1)"
									stroke="#f87171"
									strokeWidth="4"
								/>
								<line
									x1="-52"
									y1="-10"
									x2="-32"
									y2="10"
									stroke="#f87171"
									strokeWidth="5"
									strokeLinecap="round"
								/>
								<line
									x1="-32"
									y1="-10"
									x2="-52"
									y2="10"
									stroke="#f87171"
									strokeWidth="5"
									strokeLinecap="round"
								/>
								<text
									x="14"
									y="12"
									textAnchor="middle"
									fill="#f87171"
									fontSize="32"
									fontWeight="900"
									fontFamily="sans-serif"
									letterSpacing="4"
								>
									犯規
								</text>
							</motion.g>
						</g>
					</svg>

					<motion.p
						style={{ opacity: captionOpacity, y: captionY }}
						className="max-w-md text-center text-sm text-white/60"
					>
						隨時都能進入廚房，但站在裡面（包括踩線）
						<span className="text-orange-400">絕對不能截擊</span>
						<br />
						<span className="text-white/40">
							截擊 = 球落地前直接凌空回擊
						</span>
					</motion.p>
				</div>
			</div>
		</TourStage>
	);
}
