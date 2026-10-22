import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * 核心模組清單（相對 src/、不含副檔名）。
 * 之後任何 change 新增核心模組時必須同步更新此清單，否則「清單與 src 一致」測試轉紅。
 */
export const CORE_MODULES = [
  "scoreboard/types",
  "scoreboard/rules",
  "scoreboard/reducer",
  "matchmaker/types",
  "matchmaker/allocation-types",
  "matchmaker/allocation",
  "matchmaker/candidates",
  "matchmaker/duplication",
  "matchmaker/pairing",
  "matchmaker/rating-math",
  "matchmaker/rating-types",
  "matchmaker/rating",
  "matchmaker/labels",
  "matchmaker/round-types",
  "matchmaker/round",
  "matchmaker/history",
  "matchmaker/history-range",
  "matchmaker/transfer-types",
];

const SRC_DIR = path.resolve(import.meta.dirname, "../src");

/** 遞迴列出 src 下的 .ts 檔（排除 *.test.ts），回傳去副檔名的相對路徑。 */
function listSourceModules(dir: string, prefix = ""): string[] {
  const modules: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      modules.push(...listSourceModules(path.join(dir, entry.name), relative));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      modules.push(relative.replace(/\.ts$/, ""));
    }
  }
  return modules;
}

describe("核心套件模組邊界", () => {
  it("核心模組清單與 src 實際檔案一致", () => {
    const actual = listSourceModules(SRC_DIR).sort();
    expect(actual).toEqual([...CORE_MODULES].sort());
    // 擋掉兩邊皆空的恆真
    expect(CORE_MODULES.length).toBeGreaterThanOrEqual(18);
  });

  it("每個核心模組可在沒有瀏覽器全域的 node 環境載入", async () => {
    expect(Reflect.get(globalThis, "window")).toBeUndefined();
    expect(Reflect.get(globalThis, "document")).toBeUndefined();
    expect(Reflect.get(globalThis, "localStorage")).toBeUndefined();

    for (const moduleName of CORE_MODULES) {
      // 清單是執行期資料，Vite 無法靜態分析子目錄的動態匯入，需略過其預處理。
      const mod = await import(/* @vite-ignore */ `../src/${moduleName}.ts`);
      expect(Object.keys(mod).length, moduleName).toBeGreaterThan(0);
    }
  });
});
