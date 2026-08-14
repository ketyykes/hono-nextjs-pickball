import { test, expect } from "@playwright/test";

// /scoreboard 計分器頁的 E2E 驗收
// 對應 plan Task 26：navbar 進入、完整比賽到結束、Undo、二次確認重置、持久化、直式提示橫幅
//
// 注意 side-out 規則：我方先發、連續贏 11 球的劇本下接發方無法得分，
// 比分會直接從 0-0 跑到 11-0 觸發 GameOverDialog。
//
// 為避免 localStorage 跨測試污染，beforeEach 會清除 storage 與重新進入頁面。

const LS_KEY = "scoreboard:current:v1";

test.describe("/scoreboard 計分器", () => {
	test.beforeEach(async ({ page }) => {
		// 先到任一同 origin 的頁面，才能操作 localStorage（避免 about:blank）
		await page.goto("/");
		await page.evaluate(() => {
			window.localStorage.clear();
		});
	});

	test("從首頁 Navbar 可進入 /scoreboard 並顯示雙方面板", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("link", { name: "計分板" }).click();
		await expect(page).toHaveURL(/\/scoreboard$/);
		await expect(page.getByText("我方", { exact: true })).toBeVisible();
		await expect(page.getByText("對方", { exact: true })).toBeVisible();
	});

	test("我方連贏 11 球觸發 GameOverDialog 顯示「🏆 我方獲勝」與「11 – 0」", async ({
		page,
	}) => {
		await page.goto("/scoreboard");
		const usButton = page.getByRole("button", { name: /我方贏這一球/ });

		// 按 11 次。每次按下後 aria-label 會更新，因此用 role+name 正則重新查詢
		for (let i = 0; i < 11; i++) {
			await usButton.click();
		}

		const dialog = page.getByRole("dialog", { name: /我方獲勝/ });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("11 – 0")).toBeVisible();
	});

	test("Undo 可退回一分（按兩次得 2 → 撤銷後為 1）", async ({ page }) => {
		await page.goto("/scoreboard");
		const usButton = page.getByRole("button", { name: /我方贏這一球/ });

		await usButton.click();
		await usButton.click();
		await expect(page.getByLabel(/我方目前 2 分/)).toBeVisible();

		await page.getByRole("button", { name: "撤銷上一分" }).click();
		await expect(page.getByLabel(/我方目前 1 分/)).toBeVisible();
	});

	test("重置含二次確認；確認後 mode toggle 解鎖（enabled）", async ({ page }) => {
		await page.goto("/scoreboard");
		const usButton = page.getByRole("button", { name: /我方贏這一球/ });

		// 開賽得 1 分，確認 mode toggle 已 lock
		await usButton.click();
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeDisabled();

		// 按重置 → 跳出 AlertDialog
		await page.getByRole("button", { name: "重置比賽" }).click();
		const alert = page.getByRole("alertdialog", { name: /確定要重置比賽/ });
		await expect(alert).toBeVisible();

		// 按「確定重置」→ dialog 關閉 + mode toggle 解鎖
		await alert.getByRole("button", { name: "確定重置" }).click();
		await expect(alert).toBeHidden();
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeEnabled();
		await expect(page.getByLabel(/我方目前 0 分/)).toBeVisible();
	});

	test("localStorage 持久化：reload 後分數保留", async ({ page }) => {
			await page.goto("/scoreboard");
			const usButton = page.getByRole("button", { name: /我方贏這一球/ });
			await usButton.click();
			await usButton.click();
			await expect(page.getByLabel(/我方目前 2 分/)).toBeVisible();

			// 確認已寫進 localStorage
			const stored = await page.evaluate(
				(key) => window.localStorage.getItem(key),
				LS_KEY,
			);
			expect(stored).toContain('"us":2');

			await page.reload();
			await expect(page.getByLabel(/我方目前 2 分/)).toBeVisible();
		},
	);

	test("多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見", async ({
		page,
	}) => {
		// overflow-hidden 讓排版錯誤的失敗模式從「可捲動」變成「內容被裁切」，
		// 一般的 toBeVisible 斷言抓不到，此測試是唯一防線。
		const viewports = [
			{ width: 390, height: 844 }, // 手機直向
			{ width: 844, height: 390 }, // 手機橫向
			{ width: 768, height: 1024 }, // 平板直向
			{ width: 1024, height: 600 }, // 桌機臨界（修正前恰在此高度開始溢出）
		];
		for (const vp of viewports) {
			await page.setViewportSize(vp);
			await page.goto("/scoreboard");
			await expect(page.getByText("我方", { exact: true })).toBeVisible();

			// 整頁不可垂直捲動（容許 1px 次像素誤差）
			const { scrollHeight, clientHeight } = await page.evaluate(() => ({
				scrollHeight: document.scrollingElement!.scrollHeight,
				clientHeight: document.scrollingElement!.clientHeight,
			}));
			expect(
				scrollHeight,
				`${vp.width}x${vp.height} 不應有垂直捲動`,
			).toBeLessThanOrEqual(clientHeight + 1);

			// 核心按鈕 boundingBox 完整落在 viewport 內
			const coreButtons = [
				page.getByRole("button", { name: /我方贏這一球/ }),
				page.getByRole("button", { name: /對方贏這一球/ }),
				page.getByRole("button", { name: "撤銷上一分" }),
				page.getByRole("button", { name: "重置比賽" }),
			];
			for (const button of coreButtons) {
				const box = await button.boundingBox();
				expect(box, `${vp.width}x${vp.height} 按鈕應可見`).not.toBeNull();
				if (box) {
					expect(box.y).toBeGreaterThanOrEqual(0);
					expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
					expect(box.x).toBeGreaterThanOrEqual(0);
					expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
				}
			}
		}
	});

	test("專注模式：進入後隱藏 navbar 與設定列、退出後恢復", async ({ page }) => {
		await page.goto("/scoreboard");
		await expect(page.getByRole("link", { name: "計分板" })).toBeVisible();

		// 進入專注模式：navbar 與設定列消失，浮動退出鈕出現
		await page.getByRole("button", { name: "進入專注模式" }).click();
		await expect(page.getByRole("link", { name: "計分板" })).toBeHidden();
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeHidden();
		const exitButton = page.getByRole("button", { name: "退出專注模式" });
		await expect(exitButton).toBeVisible();

		// 專注模式中計分照常運作
		await page.getByRole("button", { name: /我方贏這一球/ }).click();
		await expect(page.getByLabel(/我方目前 1 分/)).toBeVisible();

		// 退出後 navbar 與設定列恢復
		await exitButton.click();
		await expect(page.getByRole("link", { name: "計分板" })).toBeVisible();
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeVisible();
	});

	test("直式 viewport 顯示「💡 建議橫向使用」提示橫幅", async ({ page }) => {
		// 進頁前先清 sessionStorage 避免「關閉提示」狀態殘留
		await page.addInitScript(() => {
			window.sessionStorage.clear();
		});
		await page.setViewportSize({ width: 400, height: 800 });
		await page.goto("/scoreboard");
		const hint = page.getByRole("status").filter({ hasText: "建議橫向使用" });
		await expect(hint).toBeVisible();
	});

	// scoreboard-target-score change：15 分制下 11-0 不該判勝（舊的 11 分制寫死門檻已移除）
	test("15 分制下連贏 11 球不觸發 GameOverDialog", async ({ page }) => {
		page.on("console", (msg) => {
			if (msg.type() === "error")
				console.error("Browser console error:", msg.text());
		});
		page.on("pageerror", (error) => console.error("Page error:", error.message));

		await page.goto("/scoreboard");
		await page.getByRole("radio", { name: "15" }).click();

		// 按 11 次。aria-label 會隨分數更新，因此用 role+name 正則重新查詢
		for (let i = 0; i < 11; i++) {
			await page.getByRole("button", { name: /我方贏這一球/ }).click();
		}

		await expect(page.getByLabel(/我方目前 11 分/)).toBeVisible();
		await expect(page.getByLabel(/對方目前 0 分/)).toBeVisible();
		await expect(page.getByRole("dialog", { name: /我方獲勝/ })).toBeHidden();
		await expect(
			page.getByRole("button", { name: /我方贏這一球/ }),
		).toBeEnabled();
	});

	// scoreboard-target-score change：目標分數與比賽形式、先發球方同屬賽前設定，開賽後三者一律鎖定
	test("比賽開始後三個賽前設定控制項皆為 disabled", async ({ page }) => {
		page.on("console", (msg) => {
			if (msg.type() === "error")
				console.error("Browser console error:", msg.text());
		});
		page.on("pageerror", (error) => console.error("Page error:", error.message));

		await page.goto("/scoreboard");

		// 開賽前三者皆為 enabled
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeEnabled();
		await expect(page.getByRole("combobox", { name: "先發球方" })).toBeEnabled();
		for (const score of ["11", "15", "21"] as const) {
			await expect(page.getByRole("radio", { name: score })).toBeEnabled();
		}

		// 按一次「贏這球+」使 status 進入 playing
		await page.getByRole("button", { name: /我方贏這一球/ }).click();

		// 開賽後三者全數 disabled
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeDisabled();
		await expect(page.getByRole("combobox", { name: "先發球方" })).toBeDisabled();
		for (const score of ["11", "15", "21"] as const) {
			await expect(page.getByRole("radio", { name: score })).toBeDisabled();
		}
	});

	// scoreboard-target-score change：專注模式不渲染設定列，分制須改由隊伍面板顯示，否則使用者無從得知比賽何時結束
	test("專注模式下隊伍面板仍顯示目標分數", async ({ page }) => {
		page.on("console", (msg) => {
			if (msg.type() === "error")
				console.error("Browser console error:", msg.text());
		});
		page.on("pageerror", (error) => console.error("Page error:", error.message));

		await page.goto("/scoreboard");
		await page.getByRole("radio", { name: "21" }).click();
		await page.getByRole("button", { name: "進入專注模式" }).click();

		// 設定列已隱藏
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeHidden();

		// 兩個隊伍面板皆顯示分制；strict mode 下需用 toHaveCount(2) 而非 toBeVisible()
		await expect(page.getByText(/21 分制/)).toHaveCount(2);
	});

	// scoreboard-target-score change：面板流體間距重新調校後的餘量迴歸防線。
	// 過去的教訓（commit 1cba147 review）：只驗證「boundingBox 落在 viewport
	// 內」與「可點擊」驗不出餘量被壓縮到只剩不到 1px——外層又有
	// overflow-hidden，未來若 clamp 參數被再次壓縮，失敗模式會是靜默裁切，
	// 不會有任何既有斷言變紅。此測試直接斷言頂部／底部餘量的絕對值。
	test("面板內容不得貼齊邊界：底部餘量須保留安全值", async ({ page }) => {
		// 固定量測 390x664：這是 mobile-safari project 的預設 viewport
		// （devices["iPhone 12"] 的 viewport 是 390x664，非 844），也是本
		// change 調校前 review 實測餘量僅 0.94px 的臨界尺寸。顯式設定可讓
		// 全部 5 個 browser project 都在同一個已知最脆弱的尺寸下驗證，
		// 不受各 project 各自的預設 viewport 影響。
		await page.setViewportSize({ width: 390, height: 664 });
		await page.goto("/scoreboard");
		await expect(page.getByText("我方", { exact: true })).toBeVisible();

		// 調校後於 chromium/firefox/webkit 三種引擎現場實測皆為 ~12–13px，
		// 這裡斷言 4px（對應本次調校「目標 1：底部餘量 ≥ 4px」的必達門檻），
		// 保留約 3 倍緩衝：clamp 參數若被調整到只剩個位數 px 級的餘量會直接
		// 紅燈，但不會對日後合理的微調反應過敏。
		const SAFE_MARGIN_PX = 4;
		const margins = await page.evaluate(() => {
			const panels = Array.from(document.querySelectorAll(".\\@container-size"));
			return panels.map((panel) => {
				const wrapper = panel.firstElementChild as HTMLElement;
				const labelRow = wrapper.firstElementChild as HTMLElement;
				const button = panel.querySelector("button") as HTMLElement;
				const panelBox = panel.getBoundingClientRect();
				const labelBox = labelRow.getBoundingClientRect();
				const buttonBox = button.getBoundingClientRect();
				return {
					topMargin: labelBox.top - panelBox.top,
					bottomMargin: panelBox.bottom - buttonBox.bottom,
				};
			});
		});

		expect(margins, "應找到兩個 TeamPanel 容器").toHaveLength(2);
		for (const { topMargin, bottomMargin } of margins) {
			expect(topMargin, "label 行與面板頂部的餘量").toBeGreaterThanOrEqual(
				SAFE_MARGIN_PX,
			);
			expect(bottomMargin, "按鈕與面板底部的餘量").toBeGreaterThanOrEqual(
				SAFE_MARGIN_PX,
			);
		}
	});

	// scoreboard-target-score change：code review 指出目標分數 radiogroup 缺少 WAI-ARIA
	// APG 慣用的方向鍵導覽，補上 roving tabindex + 方向鍵移動即選取（見
	// lib/scoreboard/radio-navigation.ts 的純函式與 ScoreboardSetup.tsx 的 onKeyDown）。
	test("目標分數 radiogroup 支援方向鍵導覽與 roving tabindex", async ({ page }) => {
		await page.goto("/scoreboard");

		const radio11 = page.getByRole("radio", { name: "11" });
		const radio15 = page.getByRole("radio", { name: "15" });
		const radio21 = page.getByRole("radio", { name: "21" });

		// 初始只有選中項（11）的 tabIndex 為 0，另兩顆為 -1
		await expect(radio11).toHaveAttribute("tabindex", "0");
		await expect(radio15).toHaveAttribute("tabindex", "-1");
		await expect(radio21).toHaveAttribute("tabindex", "-1");

		// 聚焦 11 後按 ArrowRight → 15 被選中且取得焦點
		await radio11.focus();
		await page.keyboard.press("ArrowRight");
		await expect(radio15).toHaveAttribute("aria-checked", "true");
		await expect(radio15).toBeFocused();
		await expect(radio15).toHaveAttribute("tabindex", "0");
		await expect(radio11).toHaveAttribute("tabindex", "-1");

		// 再按 ArrowRight → 21
		await page.keyboard.press("ArrowRight");
		await expect(radio21).toHaveAttribute("aria-checked", "true");
		await expect(radio21).toBeFocused();

		// 再按一次 → 循環回 11
		await page.keyboard.press("ArrowRight");
		await expect(radio11).toHaveAttribute("aria-checked", "true");
		await expect(radio11).toBeFocused();

		// 按 ArrowLeft → 循環回 21
		await page.keyboard.press("ArrowLeft");
		await expect(radio21).toHaveAttribute("aria-checked", "true");
		await expect(radio21).toBeFocused();

		// 比賽開始（按一次「贏這球+」）後按方向鍵 → 選取不變（仍鎖定）。
		// 按鈕開賽後為原生 disabled，無法真正取得鍵盤焦點（瀏覽器會直接拒絕聚焦），
		// 因此改用 dispatchEvent 讓 keydown 確實冒泡到掛在容器上的 onKeyDown，
		// 藉此驗證 handleTargetScoreKeyDown 內的 locked guard 本身有效，
		// 而不是只仰賴原生 disabled 順帶擋掉（原生 disabled 已由另一測試驗證）。
		await page.getByRole("button", { name: /我方贏這一球/ }).click();
		await expect(radio21).toBeDisabled();
		await radio21.evaluate((el) => {
			el.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "ArrowLeft",
					bubbles: true,
					cancelable: true,
				}),
			);
		});
		await expect(radio21).toHaveAttribute("aria-checked", "true");
	});
});
