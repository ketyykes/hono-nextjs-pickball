// lib/matchmaker/round-timer-sound.ts
//
// 【例外層】本檔是本 workspace TDD 規則的例外層，不走「先紅燈單元測試」——原因：
// 本檔只有一個函式、零分支決策（沒有 if/else、沒有依輸入變化的行為），純粹是
// 「呼叫瀏覽器 Web Audio API 合成一段提示音」，沒有網域邏輯可測。happy-dom
// 沒有實作 `AudioContext`，硬要在單元測試裡驗證就得自造一個假 AudioContext／
// OscillatorNode／GainNode 錄下呼叫序列——那驗證的是「我有沒有照我自己寫的順序
// 呼叫 Web Audio API」，不是「聲音對不對」，沒有意義。
// 故本檔改以後續群組驗收：`RoundTimerBanner.test.tsx` 以 `vi.fn()` 注入替換本函式，
// 驗證「音效函式被呼叫幾次」；E2E 則以 `addInitScript` stub `window.AudioContext`，
// 驗證「真實頁面確實觸發建構」（比照 `scene-canvas.ts` 的既有分層先例，見 design
// Decision 6、M9 Decision 7）。
//
// 與 `useRoundTimer.ts` 的分工邊界（design Decision 6）：`useRoundTimer.ts` 是
// 「持續的時間來源」（`setInterval`／`Date` 驅動的倒數 tick），本檔是「一次性的
// 副作用」（時間到那一刻的音效播放）。兩者性質不同、測試手法也不同
// （前者用 `vi.useFakeTimers()`，後者無法在 happy-dom 下真的發聲），混在同一個
// hook 內會讓 `useRoundTimer.ts` 的單元測試意外需要一併 mock `AudioContext`，
// 拖累原本單純的計時邏輯測試，故拆成獨立模組。
// 本檔刻意不含任何「是否已播放過」的去重狀態——那是呼叫端（`RoundTimerBanner.tsx`
// 以 `useRef` 旗標）的責任，避免出現兩處互相獨立的去重邏輯。
//
// Cloudflare Workers（OpenNext）部署注意：本檔所有瀏覽器 API（`window`／
// `AudioContext`）呼叫 MUST 只在函式內部觸發，模組層級零觸碰，否則 SSR／
// prerender 階段會在 workerd 內炸掉。

// 音長（秒）。0.15 秒足以讓人耳辨識「叮」一聲的音高與起訖，短到不會讓連續操作
// （切換分頁、確認彈窗）感覺被提示音卡住；再更短則接近純粹的 click，音高不易辨識。
const CHIME_DURATION_SECONDS = 0.15;

// 振盪器頻率（Hz）與波形：A5（880Hz）落在多數裝置喇叭的清晰頻段、不刺耳；
// 選 sine 是因為它是唯一不含高次諧波的波形，短音長下也不會產生 square／sawtooth
// 那種明顯的電子雜音感，適合「提示音」而非「警報音」的語氣。
const CHIME_FREQUENCY_HZ = 880;
const CHIME_WAVEFORM: OscillatorType = "sine";

// gain 包絡的峰值與衰減時間常數。直接把振盪器接到輸出再開關會在啟動／停止瞬間
// 造成波形不連續（click／pop 爆音），因此改用 `gain.setValueAtTime` 先拉到峰值、
// 再用 `gain.exponentialRampToValueAtTime` 指數衰減到趨近 0，讓聲音自然淡出。
// 0.3 的峰值音量足以在一般裝置喇叭上被聽見，又不會刺耳；
// `exponentialRampToValueAtTime` 不能以 0 為終值（數學上未定義），故衰減終值取
// 一個趨近 0 的極小值。
const CHIME_GAIN_PEAK = 0.3;
const CHIME_GAIN_FLOOR = 0.0001;

/**
 * 播放一段時間到的提示音（由 Web Audio API 即時合成，不使用任何音檔資產）。
 *
 * 執行環境未提供 `AudioContext` 時安全返回、不拋出例外——涵蓋兩種情況：
 * SSR／prerender 階段 `window` 本身不存在，以及舊版 Safari 只提供
 * `webkitAudioContext` 前綴（`AudioContext` 未定義）。
 */
export function playTimerExpiredChime(): void {
	if (typeof window === "undefined") {
		return;
	}

	const AudioContextCtor =
		window.AudioContext ??
		(window as typeof window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (AudioContextCtor === undefined) {
		return;
	}

	const audioContext = new AudioContextCtor();
	const oscillator = audioContext.createOscillator();
	const gain = audioContext.createGain();

	oscillator.type = CHIME_WAVEFORM;
	oscillator.frequency.setValueAtTime(CHIME_FREQUENCY_HZ, audioContext.currentTime);

	const now = audioContext.currentTime;
	const stopAt = now + CHIME_DURATION_SECONDS;
	gain.gain.setValueAtTime(CHIME_GAIN_PEAK, now);
	gain.gain.exponentialRampToValueAtTime(CHIME_GAIN_FLOOR, stopAt);

	oscillator.connect(gain);
	gain.connect(audioContext.destination);

	oscillator.start(now);
	oscillator.stop(stopAt);

	// 播放結束後才 close AudioContext：太早 close 會截斷尚未播完的聲音，不 close
	// 則每次呼叫都會累積一個未釋放的 AudioContext（瀏覽器對同時存在的數量有上限）。
	// 用 `oscillator.onended`（由 Web Audio API 自身排程觸發，音訊執行緒精準對齊
	// `stop()` 的時間點）而非 `setTimeout`——後者是主執行緒計時器，在分頁節流
	// （背景分頁）下可能延遲觸發，且會讓本檔意外多一個「非 Web Audio API」的計時依賴。
	oscillator.onended = () => {
		void audioContext.close();
	};
}
