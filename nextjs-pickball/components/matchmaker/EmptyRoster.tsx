// components/matchmaker/EmptyRoster.tsx
"use client";

import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyRosterProps {
	onAddPlayer: () => void;
}

// 空白初始狀態（spec Requirement「空白初始狀態」）：首次開啟 MUST 為空白，
// 系統 SHALL NOT 自動帶入任何假姓名、假分數或假資料，僅提供「新增第一位參賽者」
// 的操作入口。onAddPlayer 由父層注入、開啟與頁面頂部「新增參賽者」共用的同一個
// Dialog，避免重複實作兩份新增表單狀態。
export function EmptyRoster({ onAddPlayer }: EmptyRosterProps) {
	return (
		<div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-16 text-center">
			<UserPlus className="size-10 text-muted-foreground" aria-hidden="true" />
			<div className="space-y-1">
				<p className="text-lg font-semibold">目前還沒有參賽者</p>
				<p className="text-sm text-muted-foreground">新增參賽者後即可開始安排對戰。</p>
			</div>
			<Button onClick={onAddPlayer}>新增第一位參賽者</Button>
		</div>
	);
}
