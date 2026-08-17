// components/matchmaker/ResetRosterDialog.tsx
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

interface ResetRosterDialogProps {
	onConfirm: () => void;
}

// 重置名單前的二次確認（spec Requirement「重置名單與二次確認」／prd.md 4.1.5、
// 第 10 節）。Description 採 prd.md 4.1.5 的原文、逐字不改寫，並整段放在同一個
// 元素內（不拆到 Title），避免未來 E2E 用整句文字比對時因跨元素斷開而落空。
// 本階段尚無匯出功能，文案刻意不承諾「先匯出備份」這類尚不存在的操作入口。
export function ResetRosterDialog({ onConfirm }: ResetRosterDialogProps) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="outline">重置名單</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>重置參賽者名單</AlertDialogTitle>
					<AlertDialogDescription>
						確定要重置參賽者名單嗎？這會清除全部參賽者、目前回合與歷史賽果，且無法復原。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						確定重置
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
