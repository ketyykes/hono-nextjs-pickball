// components/matchmaker/ClearLocalDataDialog.tsx
"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ClearLocalDataDialogProps {
	onConfirm: () => void;
}

// 清除本機資料前的二次確認（spec Requirement「清除本機資料與其確認流程」／
// prd.md §10、12.4）。比照既有 ResetRosterDialog 的 AlertDialog + destructive 模式。
// 三句文案（無法復原／建議先匯出 JSON 備份／JSON 備份不含 /scoreboard 計分進度）
// 整段放在同一個 AlertDialogDescription 內，避免未來 E2E 用整句文字比對時因跨元素
// 斷開而落空（沿用 ResetRosterDialog 的既有慣例）。
export function ClearLocalDataDialog({ onConfirm }: ClearLocalDataDialogProps) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive">清除本機資料</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>清除本機資料</AlertDialogTitle>
					<AlertDialogDescription>
						清除後本機資料無法復原，建議先匯出 JSON 備份。JSON
						備份不包含 /scoreboard 進行中的逐球計分進度。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						確定清除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
