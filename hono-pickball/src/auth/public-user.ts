/** 對外只暴露這三個欄位；新增欄位前須確認不含敏感資料。 */
export function toPublicUser(user: { id: string; email: string; name: string }) {
	return { id: user.id, email: user.email, name: user.name };
}
