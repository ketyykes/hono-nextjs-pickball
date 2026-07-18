import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkHonoHealth } from "@/lib/health";

// 每次 request 都即時檢查；不可於 build 期預渲染（屆時無 binding 的 runtime context）。
export const dynamic = "force-dynamic";

export default async function HealthPage() {
	const { env } = getCloudflareContext();
	const result = await checkHonoHealth(env.HONO_API);

	return (
		<main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6">
			<Card
				className="w-full"
				data-testid="health-status"
				data-status={result.ok ? "ok" : "fail"}
			>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						API 連線狀態
						{result.ok ? (
							<Badge>ok</Badge>
						) : (
							<Badge variant="destructive">fail</Badge>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-1 text-sm">
					{result.ok ? (
						<>
							<p>service：{result.service}</p>
							<p>timestamp：{result.timestamp}</p>
							<p className="break-all">requestUrl：{result.requestUrl}</p>
							<p>latency：{result.latencyMs} ms</p>
						</>
					) : (
						<p className="break-all text-destructive">error：{result.error}</p>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
