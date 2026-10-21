import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

// 本機開發用的測試帳號登入頁，不進搜尋索引，也不列入 NAV_LINKS。
export const metadata: Metadata = {
	title: "登入 | 匹克球指南",
	robots: { index: false, follow: false },
};

// pt-14 對齊全站固定 navbar 高度（--site-nav-h），沿用 matchmaker layout 的做法。
export default function LoginPage() {
	return (
		<main className="min-h-screen bg-background pt-14">
			<div className="mx-auto flex max-w-sm flex-col gap-4 p-6">
				<LoginForm />
			</div>
		</main>
	);
}
