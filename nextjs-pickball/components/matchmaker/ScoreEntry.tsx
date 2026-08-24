// components/matchmaker/ScoreEntry.tsx
"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ScoreEntryProps {
	teamALabel: string;
	teamBLabel: string;
	disabled: boolean;
	onSubmitScore: (rawScoreA: string, rawScoreB: string) => void;
	submitError: string | null;
}

// 手動輸入比分是 prd.md 6.3 明訂不得移除的 fallback，MUST 能獨立完成一場。比分驗證規則
// （空白、非數字、平局、已完成）歸屬回合 capability 的送出 pipeline，本元件 SHALL NOT
// 複製一份——只負責把欄位原樣往上傳並把 submitError 原樣顯示出來（design Open Questions 2e）。
//
// 送出時 SHALL NOT 先 Number() 轉換：lib/matchmaker/round.ts 的 validateScoreInput 靠
// 「原始字串」才分得出空白（EMPTY_FIELD）與非數字（INVALID_NUMBER）兩種不同的拒絕原因——
// 若在此提前轉成數字，空白欄位會被 Number("") 靜默補成 0，等於把「空白＝0」這條規則
// 搬進了 UI，且會讓只填一欄的使用者意外送出一筆 0 比分並被判定完成。
export function ScoreEntry({
	teamALabel,
	teamBLabel,
	disabled,
	onSubmitScore,
	submitError,
}: ScoreEntryProps) {
	const teamAId = useId();
	const teamBId = useId();
	const [teamAValue, setTeamAValue] = useState("");
	const [teamBValue, setTeamBValue] = useState("");

	function handleSubmit() {
		onSubmitScore(teamAValue, teamBValue);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-end gap-2">
				<div className="flex flex-col gap-1">
					<Label htmlFor={teamAId}>{teamALabel}比分</Label>
					<Input
						id={teamAId}
						type="text"
						inputMode="numeric"
						disabled={disabled}
						value={teamAValue}
						onChange={(event) => setTeamAValue(event.target.value)}
						className="w-16 text-center"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor={teamBId}>{teamBLabel}比分</Label>
					<Input
						id={teamBId}
						type="text"
						inputMode="numeric"
						disabled={disabled}
						value={teamBValue}
						onChange={(event) => setTeamBValue(event.target.value)}
						className="w-16 text-center"
					/>
				</div>
				<Button type="button" size="sm" disabled={disabled} onClick={handleSubmit}>
					送出比分
				</Button>
			</div>
			{submitError !== null && (
				<p role="alert" className="text-xs text-destructive">
					{submitError}
				</p>
			)}
		</div>
	);
}
