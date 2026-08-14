"use client";

import { Button } from "@/components/ui/button";
import { ServeIndicator } from "@/components/scoreboard/ServeIndicator";
import { cn } from "@/lib/utils";
import type { ScoreboardState, Team } from "@/lib/scoreboard/types";

interface TeamPanelProps {
	team: Team;
	label: string;
	state: ScoreboardState;
	disabled: boolean;
	onWinRally: () => void;
}

// 單隊面板：分數、發球指示（僅當該隊在發球時顯示）、「贏這球+」按鈕
export function TeamPanel({ team, label, state, disabled, onWinRally }: TeamPanelProps) {
	const score = state.scores[team];
	const isServing = state.servingTeam === team;
	return (
		// @container-size（需 tailwindcss >= 4.3）：panel 為 size container，
		// 「後代」的 cqh/cqw 以 panel 內容盒為基準——分數字級因此跟隨面板實際
		// 可用高度，直向（panel≈可用高一半）與橫向（panel≈全高）共用同一組參數，
		// 並自動吸收 OrientationHint、ScoreboardSetup 折行等高度變因。禁用寬度斷點
		// 字級（md:text-[14rem] 會讓平板直向、橫向手機誤中大字而溢出）。
		// 此節點本身只負責建立 size container 與參與外層 flex 版面，不直接排版
		// 子項——排版與 gap/padding 交給下面的內層 wrapper（原因見其註解）。
		<div className="@container-size min-h-0 min-w-0 flex-1 overflow-hidden">
			{/* gap/padding 改掛在這層而非 @container-size 容器自身：cq 單位在容器
			「自己身上」查不到自己（規格：只會 fallback 回視口），必須降一層子孫元素
			才查得到外層容器的實際高度。故用 cqh 而非 dvh——dvh 只反映整個視口高度，
			當 ScoreboardSetup 因窄視口折成兩列、擠壓掉面板可用高度時，dvh 基準的
			gap/padding 不會跟著縮小，只有分數字級（cqh 基準）會縮，兩者不同步的
			落差即是 Mobile Safari 下設定列折行後面板與相鄰面板重疊的根因（面板實際
			可用高度已因折行而縮到不足以容納固定不變的 gap/padding + label/發球
			指示/按鈕高度）。改用 cqh 後 gap/padding 與字級共用同一份「面板實際
			可用高度」基準，折行擠壓面板時三者同步收斂，才能維持零重疊。
			外層容器加 overflow-hidden 作最後防線：justify-content: center 在內容
			仍超出（例如極端視窗高度、不同平台字體 metrics 造成的次像素差異）時會
			向上下對稱溢出，沒有 overflow-hidden 會直接吃進相鄰面板的版面；有了它，
			即使 fluid 公式仍有極小殘差，溢出也只會被裁在「自己這格」的邊界，不會
			再侵犯到另一隊的可點擊區域。 */}
			<div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-[clamp(0.25rem,3cqh,1.5rem)] p-[clamp(0.25rem,3cqh,1.5rem)]">
				<div className="font-outfit text-sm uppercase tracking-[3px] text-muted-foreground">
					<span>{label}</span>
					<span className="opacity-70"> · {state.targetScore} 分制</span>
				</div>
				<div
					aria-live="polite"
					aria-label={`${label}目前 ${score} 分`}
					className={cn(
						// leading-none 必須排在 text-[clamp(...)] 之後：twMerge 會把帶
						// 逗號的 arbitrary text-[] 值誤判為與 leading 同一 class group
						// （Tailwind 的 text-{size} utility 本身可能連帶設定
						// line-height），若 leading-none 排在前面會被判定衝突而整個被
						// twMerge 丟棄——結果是分數實際套用瀏覽器/字型預設的
						// line-height（約 1.5×字級），而非預期的 1×，白白多吃約
						// 0.5×字級的垂直空間（已用 twMerge() 現場驗證此排序修法）。
						"font-bebas text-[clamp(2.5rem,min(37cqh,38cqw),14rem)] leading-none",
						isServing ? "text-lime-400" : "text-foreground",
					)}
				>
					{score}
				</div>
				{/* 永遠保留 indicator slot 佔位（含上下 gap）；非發球方用 invisible 隱藏內容但保留版面，避免「贏這球+」按鈕在發球權切換時上下跳動。aria-hidden 讓讀屏不重複讀出隱藏字串 */}
				<div className={cn(!isServing && "invisible")} aria-hidden={!isServing}>
					<ServeIndicator
						servingTeamScore={score}
						serverNumber={state.serverNumber}
						showServerNumber={state.mode === "doubles"}
					/>
				</div>
				<Button
					size="lg"
					disabled={disabled}
					onClick={onWinRally}
					aria-label={`${label}贏這一球，當前 ${score} 分`}
					className="bg-lime-400 text-slate-900 hover:bg-lime-300"
				>
					贏這球 +
				</Button>
			</div>
		</div>
	);
}
