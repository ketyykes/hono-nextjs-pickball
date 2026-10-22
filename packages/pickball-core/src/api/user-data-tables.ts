/**
 * 所有使用者資料表（auth 核心四張以外）的名稱。
 * 後端測試雙向比對 sqlite_master，E2E 清空資料以此為唯一來源；新增資料表時必須同步列入。
 */
export const USER_DATA_TABLES = ["scoreboard_current"] as const;

export type UserDataTable = (typeof USER_DATA_TABLES)[number];
