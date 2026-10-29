// components/matchmaker/LocalImportResultMessage.tsx
import type { ImportResultView } from "@/components/matchmaker/local-import-view";

interface LocalImportResultMessageProps {
	view: ImportResultView;
	/** 結果訊息的 data-testid；補充說明為 `${testId}-note`。 */
	testId: string;
}

// 匯入結果的呈現：錯誤用 role="alert"、成功用 role="status"，補充說明另起一行不混進主訊息。
export function LocalImportResultMessage({ view, testId }: LocalImportResultMessageProps) {
	return (
		<>
			<p
				role={view.tone === "error" ? "alert" : "status"}
				data-testid={testId}
				className={view.tone === "error" ? "text-sm text-destructive" : "text-sm"}
			>
				{view.text}
			</p>
			{view.note !== undefined && (
				<p data-testid={`${testId}-note`} className="text-sm text-muted-foreground">
					{view.note}
				</p>
			)}
		</>
	);
}
