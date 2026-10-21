"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useSession";
import { signInWithEmail } from "@/lib/auth/session-client";

export function LoginForm() {
	const session = useSession();
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	// 載入中不渲染任何內容，避免閃現表單或未開放訊息。
	if (session.status === "loading") {
		return null;
	}

	if (!session.authEnabled) {
		return <p>此環境未開放登入</p>;
	}

	if (session.user !== null) {
		return (
			<p>
				已登入：{session.user.name}{" "}
				<Link href="/" className="underline">
					回首頁
				</Link>
			</p>
		);
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending) {
			return;
		}
		setPending(true);
		setErrorMessage(null);
		const result = await signInWithEmail(email, password);
		if (result.ok) {
			await session.refresh();
			// replace 而非 push：返回鍵不該回到登入表單。
			router.replace("/");
			return;
		}
		if (result.reason === "invalid-credentials") {
			setErrorMessage("帳號或密碼錯誤");
			setPassword("");
		} else if (result.reason === "unavailable") {
			setErrorMessage("此環境未開放登入");
		} else {
			setErrorMessage("登入失敗，請稍後再試");
		}
		setPending(false);
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Label htmlFor="login-email">電子郵件</Label>
				<Input
					id="login-email"
					name="email"
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="login-password">密碼</Label>
				<Input
					id="login-password"
					name="password"
					type="password"
					autoComplete="current-password"
					required
					value={password}
					onChange={(event) => setPassword(event.target.value)}
				/>
			</div>
			{errorMessage !== null && (
				<p role="alert" className="text-sm text-destructive">
					{errorMessage}
				</p>
			)}
			<Button type="submit" disabled={pending}>
				登入
			</Button>
		</form>
	);
}
