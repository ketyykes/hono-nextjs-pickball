import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "找不到頁面 | 匹克球指南",
};

export default function NotFound() {
	return (
		<main className="min-h-screen bg-background pt-(--site-nav-h)">
			<div className="mx-auto max-w-[640px] px-6 py-12">
				<p className="font-outfit text-sm font-bold tracking-[2px] text-muted-foreground">
					404
				</p>
				<h1 className="font-outfit mt-2 text-3xl font-bold tracking-tight">
					找不到這個頁面
				</h1>
				<p className="mt-2 text-muted-foreground">
					你要找的網址不存在，可能是連結已失效或網址輸入有誤。
				</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<Button asChild>
						<Link href="/" transitionTypes={["nav-back"]}>
							回首頁
						</Link>
					</Button>
					<Button asChild variant="outline">
						<Link href="/matchmaker" transitionTypes={["nav-forward"]}>
							前往對戰分配
						</Link>
					</Button>
				</div>
			</div>
		</main>
	);
}
