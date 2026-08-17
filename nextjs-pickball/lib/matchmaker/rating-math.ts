// 隊伍分數四捨五入的共用工具。純函式、無狀態，供 pairing.ts（初始配對）與 duplication.ts
// （avoidRepeats 換人後重建隊伍）兩處共用同一條四捨五入規則，避免同一個 magic number（100）
// 在兩個檔案裡各自維護一份（reviewer M6，見 tasks.md 11.B.3 記錄的後續項）。
//
// 放在獨立檔案而非 allocation-types.ts：該檔依註解明訂「純型別與常數，無執行期邏輯、無函式」
// （見該檔開頭），本函式屬執行期邏輯，放進去會破壞那份界線。也不讓 duplication.ts 反過來
// import pairing.ts——design Decision 1 的單向依賴（候選 → 配對 → 重複迴避 → 分配入口）
// 不允許低順位的迴避模組依賴配對模組，兩者只能共同依賴一個更底層、不參與排序或配對決策的檔案。

/** rating 四捨五入到小數第 2 位所使用的位數換算基準（PRD 的 rating 為兩位小數）。 */
const RATING_ROUNDING_FACTOR = 100;

/**
 * 將隊伍分數四捨五入至小數第 2 位。
 *
 * PRD 的 rating 為兩位小數（1.00～8.00），隊伍分數是隊內成員 rating 的 reduce 加總，
 * 浮點加總在十進位小數上會有誤差（例如 2.01 + 1.01 在 IEEE754 下得到 3.0199999999999996，
 * 而非數學上相等的 3.02）。Team 會被第 3 段持久化進 LocalStorage，且 avoidRepeats 的採納
 * 條件是「調整後總和 <= 調整前總和」，若混入浮點雜訊，數學上相等的比較可能被誤判為變大，
 * 等同悄悄把 `<=` 退化成 `<`（見 pairing.ts 的 buildTeam、duplication.ts 的 rebuildMatch
 * 原本各自的同一段說明）。
 */
export function roundRating(value: number): number {
	return Math.round(value * RATING_ROUNDING_FACTOR) / RATING_ROUNDING_FACTOR;
}
