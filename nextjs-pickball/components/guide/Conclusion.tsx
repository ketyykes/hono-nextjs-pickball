"use client";

interface ConclusionCard {
	icon: string;
	title: string;
	text: string;
}

const conclusionCards: readonly ConclusionCard[] = [
	{
		icon: "🏓",
		title: "下手發球打對角",
		text: "只有一次機會，新手可以用落地發球降低難度",
	},
	{
		icon: "🔄",
		title: "前兩拍必須落地",
		text: "雙彈跳規則消除發球搶攻優勢",
	},
	{
		icon: "🍳",
		title: "廚房裡不能截擊",
		text: "可以進去，但不能在裡面凌空打球",
	},
] as const;

// 對應原型 .conclusion：深色漸層 + 結語 + 三張總結卡。
export function Conclusion() {
	return (
		<section className="relative mt-16 overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950 px-8 py-20 text-white">
			<div className="pointer-events-none absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-lime-400/10" />

			<div className="relative mx-auto max-w-[860px]">
				<h2 className="mb-6 text-[clamp(1.5rem,3vw,2rem)] font-black text-lime-400">
					結論：從規則到裝備的關鍵決策
				</h2>
				<p className="mb-4 text-base leading-[1.9] text-white/80">
					匹克球的規則核心可以濃縮為三個最重要的概念。掌握這三點，你就已經可以上場打球了。球拍選購方面，新手的最佳策略是中等重量的寬體拍，搭配聚丙烯蜂巢芯和玻璃纖維或碳纖維拍面。在台灣市場上，NT$1,500–3,000 就能入手品質可靠的入門拍，NT$2,000–4,000 的雙拍套組是與朋友一起開始最經濟的選擇。
				</p>

				<div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
					{conclusionCards.map((card) => (
						<div
							key={card.title}
							className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"
						>
							<div className="mb-2 text-3xl">{card.icon}</div>
							<div className="mb-1 text-[0.95rem] font-bold text-white">
								{card.title}
							</div>
							<div className="text-[0.82rem] leading-relaxed text-white/60">
								{card.text}
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
