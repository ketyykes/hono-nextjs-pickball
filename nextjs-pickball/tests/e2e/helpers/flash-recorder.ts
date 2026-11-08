import type { Page } from "@playwright/test";

// 閃爍記錄器：在每個文件（含 reload）載入時注入，用 MutationObserver 監看整個 document，
// 每批 DOM 變動後檢查指定文字與選擇器，命中就記下。用來證明「從未出現」某個畫面，
// 這是事後的 web-first 斷言做不到的（斷言只看得到當下）。

export interface FlashRecorderTargets {
	/** 出現在 `document.body.innerText` 的文字。 */
	texts: readonly string[];
	/** 以 `document.querySelector` 命中的選擇器。 */
	selectors: readonly string[];
}

declare global {
	interface Window {
		__flashHits?: string[];
	}
}

export async function installFlashRecorder(page: Page, targets: FlashRecorderTargets): Promise<void> {
	await page.addInitScript((config: FlashRecorderTargets) => {
		const hits: string[] = [];
		window.__flashHits = hits;

		const check = () => {
			const text = document.body?.innerText ?? "";
			for (const needle of config.texts) {
				const hit = `text:${needle}`;
				if (text.includes(needle) && !hits.includes(hit)) hits.push(hit);
			}
			for (const selector of config.selectors) {
				const hit = `selector:${selector}`;
				if (document.querySelector(selector) !== null && !hits.includes(hit)) hits.push(hit);
			}
		};

		const observer = new MutationObserver(check);
		observer.observe(document, { childList: true, subtree: true, characterData: true });
		// 伺服器輸出在 observer 掛上前就可能已解析完成，補查一次
		check();
	}, targets);
}

export async function readFlashHits(page: Page): Promise<string[]> {
	return page.evaluate(() => window.__flashHits ?? []);
}
