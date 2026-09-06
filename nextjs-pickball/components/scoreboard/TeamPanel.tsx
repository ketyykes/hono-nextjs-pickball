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
			再侵犯到另一隊的可點擊區域。

			`portrait:md:` 疊加斷點只調 gap/padding 密度，不觸碰分數字級：直向
			兩面板垂直對切，同一 cqh 係數在「面板高度佔比」上，平板直向（例如
			768×1024，面板約 398px）與手機直向（例如 390×664，面板約 194px）
			差近一倍，單一係數只能挑一邊安全——3cqh 對手機直向剛好卡在安全餘量
			下限，加大係數會讓手機直向的餘量被壓縮甚至變負值。單獨用 `portrait:`
			不夠，因為兩者同為 portrait；改疊加 `md:`（寬度 ≥768px）縮小命中
			範圍到「直向且夠寬」，只有平板直向會進入這組加密係數，手機直向
			（寬度 <768px）與橫向手機（md 寬度達標但 orientation 非 portrait）
			都不受影響。字級 SHALL NOT 比照辦理：分數字級的 cqh/cqw 已用 min()
			讓兩種形態共用同一組平滑曲線，用寬度斷點分流字級正是先前平板直向／
			橫向手機誤中過大字級而溢出的根因（見上方字級註解）；gap/padding
			是版面密度而非內容本身，用斷點分流不會重蹈覆轍。 */}
			<div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-[clamp(0.25rem,3cqh,1.5rem)] p-[clamp(0.25rem,3cqh,1.5rem)] portrait:md:gap-[clamp(0.25rem,5.15cqh,2rem)] portrait:md:p-[clamp(0.25rem,5.15cqh,2rem)]">
				<div className="font-outfit text-sm uppercase tracking-[3px] text-muted-foreground">
					<span>{label}</span>
					{/* 綁定場次的球員姓名色塊（design Decision 5）：teamPlayers 為 null 時
					（獨立計分板，或本次變更前已建立的舊版計分板槽）不渲染，此時上下兩行
					與外層 div 的既有 JSX 逐字未變，維持既有的「我方」／「對方」純文字
					呈現，不改變任何既有互動（spec「綁定場次的隊伍標示」Requirement）。
					色塊群組本身另包一層 inline-flex span 承載 gap，不動外層 div 的
					className，避免影響 teamPlayers 為 null 時的既有排版。foreground 為
					seed 建立端已算好存入的欄位，本元件只讀取、直接當成 CSS color 值套用，
					不自行計算亮度或對比（design Decision 1，維持 lib/scoreboard/ 不
					import lib/matchmaker/ 的單向相依）。 */}
					{state.teamPlayers !== null && (
						<span className="mx-1 inline-flex items-center gap-1 align-middle">
							{state.teamPlayers[team].map((badge) => (
								<span
									key={badge.name}
									title={badge.name}
									className="max-w-24 truncate rounded-full px-2 py-0.5 text-[0.6rem] normal-case tracking-normal"
									style={{
										background: `linear-gradient(135deg, ${badge.colorFrom}, ${badge.colorTo})`,
										color: badge.foreground,
									}}
								>
									{badge.name}
								</span>
							))}
						</span>
					)}
					<span className="opacity-70"> · {state.targetScore} 分制</span>
				</div>
				<div
					aria-live="polite"
					aria-label={`${label}目前 ${score} 分`}
					className={cn(
						// leading-none 必須排在 text-* 之後。twMerge 把「所有 text-{size}」
						// 與「所有 leading-*」歸為同一衝突群組並套用「後者覆蓋前者」——
						// 這是刻意設計（Tailwind 的 text-{size} 本身即可連帶設定
						// line-height），不是 bug。條件與是否為 arbitrary 值、值裡有無
						// 逗號都無關：`leading-none text-sm`、`leading-none text-[14rem]`、
						// `leading-none text-[clamp(...)]` 三者的 leading 全會被丟棄
						// （已對專案安裝的 tailwind-merge 現場驗證）。
						// 被丟棄時分數會套用瀏覽器/字型預設 line-height（約 1.5×字級）
						// 而非預期的 1×，白白多吃約 0.5×字級的垂直空間——這正是本頁
						// 面板長期餘量吃緊的根因。稽核同類問題時要找的是「leading-* 排在
						// 任何 text-* 之前」，不要只找 arbitrary 值。
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
