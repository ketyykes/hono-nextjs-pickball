"use client";

import type { ReactNode } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ComparisonTableProps {
	headers: readonly string[];
	rows: ReactNode[][];
	className?: string;
}

// 對應原型 .table-wrap：深底表頭、隔行底、hover 高亮。
export function ComparisonTable({
	headers,
	rows,
	className,
}: ComparisonTableProps) {
	return (
		<div
			className={cn(
				"my-8 overflow-hidden rounded-xl border border-border",
				className,
			)}
		>
			<Table>
				<TableHeader>
					<TableRow className="border-b-0 bg-slate-900 hover:bg-slate-900">
						{headers.map((header) => (
							<TableHead
								key={header}
								className="px-5 py-4 text-[0.82rem] font-semibold tracking-wide text-white"
							>
								{header}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row, rowIndex) => (
						<TableRow
							key={rowIndex}
							className="even:bg-foreground/[0.015] hover:bg-lime-400/[0.06]"
						>
							{row.map((cell, cellIndex) => (
								<TableCell
									key={cellIndex}
									className={cn(
										"whitespace-normal px-5 py-4 align-top text-[0.9rem]",
										cellIndex === 0 && "font-semibold",
									)}
								>
									{cell}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
