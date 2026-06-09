"use client";

// 對應原型 .court-diagram：球場俯視 SVG，emerald 底色 + 廚房 lime 半透明區。
export function CourtDiagram() {
	return (
		<div className="relative my-10 overflow-hidden rounded-2xl bg-emerald-700 px-10 py-10">
			<div className="mx-auto max-w-[500px]">
				<svg
					viewBox="0 0 400 680"
					xmlns="http://www.w3.org/2000/svg"
					className="h-auto w-full"
					role="img"
					aria-label="標準匹克球場地俯視圖"
				>
					{/* 場地外框 */}
					<rect
						x="30"
						y="20"
						width="340"
						height="640"
						rx="4"
						fill="#3A9B8A"
						stroke="white"
						strokeWidth="3"
					/>
					{/* 球網 */}
					<line
						x1="30"
						y1="340"
						x2="370"
						y2="340"
						stroke="white"
						strokeWidth="4"
						strokeDasharray="8 4"
					/>
					<text x="380" y="344" fill="rgba(255,255,255,0.7)" fontSize="11">
						球網
					</text>
					{/* 廚房 */}
					<rect
						x="30"
						y="235"
						width="340"
						height="105"
						fill="rgba(163,230,53,0.18)"
						stroke="white"
						strokeWidth="2"
					/>
					<rect
						x="30"
						y="340"
						width="340"
						height="105"
						fill="rgba(163,230,53,0.18)"
						stroke="white"
						strokeWidth="2"
					/>
					<text
						x="200"
						y="295"
						fill="rgba(255,255,255,0.85)"
						fontSize="14"
						textAnchor="middle"
						fontWeight="700"
					>
						廚房 (NVZ)
					</text>
					<text
						x="200"
						y="315"
						fill="rgba(255,255,255,0.55)"
						fontSize="10"
						textAnchor="middle"
					>
						7 ft / 2.13m
					</text>
					<text
						x="200"
						y="395"
						fill="rgba(255,255,255,0.85)"
						fontSize="14"
						textAnchor="middle"
						fontWeight="700"
					>
						廚房 (NVZ)
					</text>
					<text
						x="200"
						y="415"
						fill="rgba(255,255,255,0.55)"
						fontSize="10"
						textAnchor="middle"
					>
						7 ft / 2.13m
					</text>
					{/* 中線 */}
					<line x1="200" y1="20" x2="200" y2="235" stroke="white" strokeWidth="2" />
					<line x1="200" y1="445" x2="200" y2="660" stroke="white" strokeWidth="2" />
					{/* 發球區標籤 */}
					<text
						x="115"
						y="140"
						fill="rgba(255,255,255,0.65)"
						fontSize="11"
						textAnchor="middle"
					>
						左發球區
					</text>
					<text
						x="285"
						y="140"
						fill="rgba(255,255,255,0.65)"
						fontSize="11"
						textAnchor="middle"
					>
						右發球區
					</text>
					<text
						x="115"
						y="555"
						fill="rgba(255,255,255,0.65)"
						fontSize="11"
						textAnchor="middle"
					>
						右發球區
					</text>
					<text
						x="285"
						y="555"
						fill="rgba(255,255,255,0.65)"
						fontSize="11"
						textAnchor="middle"
					>
						左發球區
					</text>
					{/* 尺寸 */}
					<text
						x="200"
						y="12"
						fill="rgba(255,255,255,0.55)"
						fontSize="10"
						textAnchor="middle"
					>
						20 ft (6.10m)
					</text>
					<text
						x="18"
						y="340"
						fill="rgba(255,255,255,0.55)"
						fontSize="10"
						textAnchor="middle"
						transform="rotate(-90,18,340)"
					>
						44 ft (13.41m)
					</text>
					<text
						x="200"
						y="675"
						fill="rgba(255,255,255,0.55)"
						fontSize="10"
						textAnchor="middle"
					>
						底線
					</text>
				</svg>
			</div>
			<div className="mt-4 text-center text-xs text-white/70">
				▲ 標準匹克球場地俯視圖（綠色區域為非截擊區 / 廚房）
			</div>
		</div>
	);
}
