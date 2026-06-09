import Link from "next/link";
import { Button } from "@/components/ui/button";

// Hero 末段的 CTA：用 <Link transitionTypes> 走 Next.js 16 推薦的 view transition 路徑——
// 享受 prefetch、無 JS fallback，並交由 Next router 內部呼叫 React addTransitionType。
// 進場由父層 Hero 的 staggerChildren 變體帶出，CTA 載入後永遠可見、可點。
export function HeroTourCta() {
	return (
		<div className="flex flex-col items-center gap-3">
			<p className="text-sm tracking-wider text-white/60">
				想用「動」的方式快速看完？
			</p>
			<Button
				asChild
				className="bg-lime-400 text-slate-900 hover:bg-lime-300"
			>
				<Link href="/tour" transitionTypes={["nav-forward"]}>
					進入完整體驗 →
				</Link>
			</Button>
		</div>
	);
}
