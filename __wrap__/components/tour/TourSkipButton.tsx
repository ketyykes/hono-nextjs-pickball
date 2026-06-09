"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// 右下角 fixed 「跳過 →」按鈕，導向 /#court。
// 視為「返回完整指南」的反向動作，傳入 transitionTypes: ["nav-back"]
// 讓 app/layout.tsx 的 <ViewTransition exit={{ "nav-back": "nav-back" }} /> 觸發反向過場。
export function TourSkipButton() {
	const router = useRouter();

	const onSkip = () => {
		router.push("/#court", { transitionTypes: ["nav-back"] });
	};

	return (
		<Button
			type="button"
			onClick={onSkip}
			className="fixed right-6 bottom-6 z-50 bg-white/10 text-white backdrop-blur hover:bg-white/20"
		>
			跳過 →
		</Button>
	);
}
