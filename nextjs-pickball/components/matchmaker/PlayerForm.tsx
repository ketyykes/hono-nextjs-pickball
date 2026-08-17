// components/matchmaker/PlayerForm.tsx
"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { PlayerSchema } from "@/lib/matchmaker/types";
import type { Gender, Player } from "@/lib/matchmaker/types";

// 表單子集 schema：從 PlayerSchema 挑出本表單實際收集的欄位（姓名／性別／
// 雙色漸層／強度分數），沿用同一份驗證規則（trim、hex 格式、1~8 範圍），
// 避免另外重寫一份規則與 PlayerSchema 各自漂移，變成第二個真相來源。
const PlayerFormSchema = PlayerSchema.pick({
	name: true,
	gender: true,
	colorFrom: true,
	colorTo: true,
	rating: true,
});

export type PlayerFormValues = z.infer<typeof PlayerFormSchema>;

// 送給 onSubmit 的形狀：colorFrom／colorTo 選填——新增時若使用者未動過顏色
// 選擇器，不送出這兩個欄位，讓 useRosterStore → addPlayer 走自動配色
// （lib/matchmaker/roster.ts 的 nextAutoGradient，會避開目前名單已佔用的顏色，
// 比本元件自行猜一個顏色更精準，尤其是刪除後再新增的情境）。
export interface PlayerFormSubmitValues {
	name: string;
	gender: Gender;
	rating: number;
	colorFrom?: string;
	colorTo?: string;
}

interface PlayerFormProps {
	mode: "add" | "edit";
	/** 編輯模式下的既有參賽者資料，用來預填表單欄位。 */
	initialPlayer?: Player;
	/** 新增模式下顏色選擇器的預覽起始值（僅供預覽，實際配色由 store 決定，見上）。 */
	suggestedColorFrom?: string;
	suggestedColorTo?: string;
	onSubmit: (values: PlayerFormSubmitValues) => void;
	onCancel: () => void;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
	{ value: "male", label: "男" },
	{ value: "female", label: "女" },
	{ value: "other", label: "其他" },
];

// 強度分數快速帶入，對應 prd.md 的三個常見級距。
const RATING_PRESETS: { label: string; value: number }[] = [
	{ label: "新手 1.00", value: 1 },
	{ label: "中階 3.00", value: 3 },
	{ label: "高階 5.00", value: 5 },
];

const DEFAULT_COLOR_FROM = "#0E6B63";
const DEFAULT_COLOR_TO = "#134E4A";

// 依 zod issue 的欄位路徑，轉譯為繁體中文、且說明可採取修正動作的錯誤訊息
// （prd.md 11：不得只顯示技術錯誤碼）。
function describeIssuePath(path: PropertyKey | undefined): string {
	switch (path) {
		case "name":
			return "請輸入姓名，不可留空或僅有空白字元";
		case "rating":
			return "強度分數需介於 1.00 至 8.00 之間，請重新輸入";
		case "colorFrom":
		case "colorTo":
			return "顏色格式不正確，請重新選擇顏色";
		case "gender":
			return "請選擇性別";
		default:
			return "表單資料有誤，請確認後再試一次";
	}
}

// 新增／編輯共用表單。送出前以 PlayerFormSchema（PlayerSchema 的子集）驗證，
// 失敗時把 zod issues 轉為繁中且可據以修正的訊息列表（見 describeIssuePath）。
export function PlayerForm({
	mode,
	initialPlayer,
	suggestedColorFrom,
	suggestedColorTo,
	onSubmit,
	onCancel,
}: PlayerFormProps) {
	const formId = useId();
	const [name, setName] = useState(initialPlayer?.name ?? "");
	const [gender, setGender] = useState<Gender>(initialPlayer?.gender ?? "male");
	// 強度分數用字串狀態保留使用者輸入中的小數點，送出時才轉數字，
	// 避免 controlled number input 在輸入過程中把 "3." 這類中繼狀態吃掉。
	const [ratingText, setRatingText] = useState(
		initialPlayer ? initialPlayer.rating.toFixed(2) : "",
	);
	const [colorFrom, setColorFrom] = useState(
		initialPlayer?.colorFrom ?? suggestedColorFrom ?? DEFAULT_COLOR_FROM,
	);
	const [colorTo, setColorTo] = useState(
		initialPlayer?.colorTo ?? suggestedColorTo ?? DEFAULT_COLOR_TO,
	);
	// 新增模式下，只有使用者實際動過顏色選擇器才視為「手動指定」並一併送出；
	// 兩個欄位同進同出，呼應 roster.ts AddPlayerInput 的 JSDoc 約定。
	const [colorCustomized, setColorCustomized] = useState(mode === "edit");
	const [errors, setErrors] = useState<string[]>([]);

	function handleColorFromChange(value: string) {
		setColorFrom(value);
		setColorCustomized(true);
	}

	function handleColorToChange(value: string) {
		setColorTo(value);
		setColorCustomized(true);
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const ratingNumber = Number(ratingText);
		// 空字串／純空白會被 Number() 轉成 0，仍落在 1~8 範圍之外，交給下方
		// zod 驗證統一處理即可；這裡只攔截真正的 NaN（例如貼上非數字內容）。
		if (Number.isNaN(ratingNumber)) {
			setErrors(["強度分數需為數字，請重新輸入"]);
			return;
		}

		const result = PlayerFormSchema.safeParse({
			name,
			gender,
			colorFrom,
			colorTo,
			rating: ratingNumber,
		});

		if (!result.success) {
			const messages = Array.from(
				new Set(result.error.issues.map((issue) => describeIssuePath(issue.path[0]))),
			);
			setErrors(messages);
			return;
		}

		setErrors([]);
		onSubmit({
			name: result.data.name,
			gender: result.data.gender,
			rating: result.data.rating,
			...(colorCustomized
				? { colorFrom: result.data.colorFrom, colorTo: result.data.colorTo }
				: {}),
		});
	}

	return (
		// noValidate：強度分數 input 帶有 min/max 屬性（見下方），若不關閉瀏覽器原生的
		// HTML5 constraint validation，超出範圍時瀏覽器會攔截 submit 事件、直接擋下
		// handleSubmit 執行並顯示瀏覽器原生（非繁中、我們無法控制文案）的提示泡泡——
		// 實測會讓 describeIssuePath 的繁中訊息完全不會被觸發。關閉原生驗證後，
		// min/max 只保留作為語意提示與捲動按鈕範圍限制，實際驗證一律交給下方 zod。
		<form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
			{errors.length > 0 && (
				<div
					role="alert"
					className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
				>
					<ul className="list-inside list-disc space-y-1">
						{errors.map((message) => (
							<li key={message}>{message}</li>
						))}
					</ul>
				</div>
			)}

			<div className="flex flex-col gap-2">
				<Label htmlFor={`${formId}-name`}>姓名</Label>
				<Input
					id={`${formId}-name`}
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="輸入參賽者姓名"
					autoComplete="off"
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor={`${formId}-gender`}>性別</Label>
				<Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
					<SelectTrigger id={`${formId}-gender`} className="w-full" aria-label="性別">
						<SelectValue />
					</SelectTrigger>
					<SelectContent position="popper">
						{GENDER_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="flex flex-col gap-2">
					<Label htmlFor={`${formId}-color-from`}>漸層起始色</Label>
					<input
						id={`${formId}-color-from`}
						type="color"
						value={colorFrom}
						onChange={(e) => handleColorFromChange(e.target.value)}
						className="h-9 w-full cursor-pointer rounded-md border border-input"
						aria-label="漸層起始色"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor={`${formId}-color-to`}>漸層結束色</Label>
					<input
						id={`${formId}-color-to`}
						type="color"
						value={colorTo}
						onChange={(e) => handleColorToChange(e.target.value)}
						className="h-9 w-full cursor-pointer rounded-md border border-input"
						aria-label="漸層結束色"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor={`${formId}-rating`}>強度分數</Label>
				<Input
					id={`${formId}-rating`}
					type="number"
					inputMode="decimal"
					step="0.01"
					min={1}
					max={8}
					value={ratingText}
					onChange={(e) => setRatingText(e.target.value)}
					placeholder="1.00 ~ 8.00"
				/>
				<div className="flex flex-wrap gap-2">
					{RATING_PRESETS.map((preset) => (
						<Button
							key={preset.label}
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setRatingText(preset.value.toFixed(2))}
						>
							{preset.label}
						</Button>
					))}
				</div>
			</div>

			<div className="flex justify-end gap-2 pt-2">
				<Button type="button" variant="outline" onClick={onCancel}>
					取消
				</Button>
				<Button type="submit">{mode === "add" ? "新增參賽者" : "儲存變更"}</Button>
			</div>
		</form>
	);
}
