#!/usr/bin/env bash
#
# Stop hook：session 停止前的 TypeScript 型別把關。
#
# ── 為什麼從 settings.json 的一行指令改成獨立腳本 ────────────────────────────
# 原本的指令是從 session 的 cwd 直接跑 `pnpm -r exec tsc --noEmit`。
# `pnpm -r` 的範圍由 cwd 的 pnpm-workspace.yaml 決定，而該檔只列
# `nextjs-pickball` 與 `hono-pickball` 兩個**相對路徑**。
#
# 因此當 session 開在主 repo、實作卻由 subagent 在 linked worktree 內進行時
# （本專案 openspec apply 的常態：coordinator 在主 repo、leader 在 worktree），
# 這支 hook 檢查的是**沒被改動的主 repo**，對 worktree 內的程式碼完全無感——
# 而且它會回報綠燈，讓人以為已經把關過了。
#
# ── 分級處置（重要：不要圖省事改成一律 exit 2）──────────────────────────────
#   主 worktree      型別錯誤 → exit 2 擋下 session。main 必須恆為綠。
#   linked worktree  型別錯誤 → 以 systemMessage 提示使用者，不擋。
#   工具鏈跑不起來    → 一律不擋，只提示（見下方「fail-open」）。
#
# linked worktree 不擋的理由：
#   `nextjs-pickball/tsconfig.json` 的 include 是 `**/*.ts`，測試檔全在 tsc 範圍內
#   （實測 56 個 .test.ts 被納入）。而 root CLAUDE.md 的 TDD 三步要求
#   「先寫失敗測試並在 shell 實際看到紅燈」——「測試 import 一個尚不存在的模組」
#   這類紅燈**本身就是型別錯誤**，且本專案的 RED 步驟會單獨 commit，
#   因此「工作區乾淨」與「型別正確」在 worktree 內並不等價。
#   linked worktree 正是紅燈階段的所在地。在那裡擋下會把 Claude 推去「修好型別」，
#   等於逼它跳過或偽造紅燈，與 CLAUDE.md「不得偽造紅燈」直接衝突。
#   主 repo 沒有這個問題：main 上不做 TDD，恆為綠。
#
# ── fail-open：工具鏈故障絕不擋下 ──────────────────────────────────────────
#   tsc 的非零 exit 有兩種意義：「真的有型別錯誤」與「根本沒跑成 tsc」
#   （corepack 要下載 pnpm 但離線、fnm 沒裝該版 node、PATH 缺 homebrew、
#   node_modules 未安裝……）。只看 exit code 會把後者誤報成型別錯誤，
#   於是每次結束都被擋、理由還是「請修正型別錯誤」，而 Claude 會去改沒壞的程式碼。
#   因此判定分兩段：非零 exit **且**輸出含 `error TS` 才算型別錯誤；
#   否則視為基礎設施問題，放行並明確標示。閘門不該因為自己壞掉而鎖住使用者。
#
# ── 為什麼用 systemMessage 而不是 additionalContext ────────────────────────
#   Stop 事件**沒有**「訊息進 Claude context 又不阻擋」的管道：
#   `decision:"block"` 與 `hookSpecificOutput.additionalContext` 都會延續對話
#   （官方文件明載 additionalContext 走的是與 block 相同的 loop protection，
#   含 stop_hook_active 與 8 次連續延續上限）。而 exit 0 時 stderr 只進 debug log。
#   `systemMessage`（頂層欄位、exit 0）則顯示在使用者的終端機且不阻擋——
#   本情境要通知的對象本來就是人，不是 Claude。
#   （已核對官方文件：上限 10,000 字元；明列會丟棄 systemMessage 的 15 個事件不含 Stop。）
#
# ── 已知限制 ──────────────────────────────────────────────────────────────
#   1. `hono-pickball/tsconfig.json` 只 include `src/**/*.ts`，
#      後端測試檔的型別不在本 hook 範圍內（那段只在該 workspace `pnpm typecheck` 的第二段）。
#   2. 逾時（settings.json 設 300 秒）時 Claude Code 會丟棄輸出且**不阻擋**，
#      等於閘門靜默消失。這是 hook 機制本身的行為，不是本腳本可以攔的。
#   3. `tsc --noEmit` 仍會寫入 `tsconfig.tsbuildinfo`（incremental 快取，已被 gitignore）。
#      本 hook 並非完全唯讀。
#

set -uo pipefail

# systemMessage 全文的字元預算。官方上限 10,000（超過會被存檔並代換成預覽），
# 這裡抓保守值，確保多個 worktree 同時紅燈時訊息仍然可讀。
MSG_BUDGET=7000
MAX_LINES_PER_WORKTREE=12

# ── 讀取 hook 輸入 ────────────────────────────────────────────────────────
# stdin 是 Stop 事件的 JSON。手動執行（stdin 為終端機）時跳過，避免 cat 卡住。
input=""
if [ ! -t 0 ]; then
	input=$(cat 2>/dev/null || true)
fi

stop_active="false"
if [ -n "$input" ] && command -v jq >/dev/null 2>&1; then
	stop_active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || printf 'false')
fi

# ── 執行型別檢查 ──────────────────────────────────────────────────────────
# 在指定目錄執行 workspace 全域型別檢查，輸出寫入全域 OUT。
# 回傳 0 = 通過、1 = 真的有型別錯誤、2 = 工具鏈跑不起來（fail-open）。
run_tsc() {
	(
		cd "$1" 2>/dev/null || exit 127
		nv=$(cat .node-version 2>/dev/null || echo 22)
		if command -v fnm >/dev/null 2>&1; then
			fnm exec --using="$nv" -- corepack pnpm -r exec tsc --noEmit
		else
			corepack pnpm -r exec tsc --noEmit
		fi
	)
}

OUT=""
check_dir() {
	OUT=$(run_tsc "$1" 2>&1)
	rc=$?

	[ "$rc" -eq 0 ] || {
		printf '%s\n' "$OUT" | grep -q "error TS" && return 1
		return 2
	}

	# pnpm 在找不到任何 workspace 時會以 0 結束並印出 "No projects found"。
	# 那代表這個目錄根本沒被檢查到，不可當成綠燈。
	printf '%s\n' "$OUT" | grep -q "No projects found" && return 2
	return 0
}

# 把一段 tsc 輸出壓縮成報告用的片段。
excerpt() {
	printf '%s\n' "$1" | grep "error TS" | head -"$MAX_LINES_PER_WORKTREE" | sed 's/^/    /'
}

report=""
add_report() {
	if [ "${#report}" -lt "$MSG_BUDGET" ]; then
		report="${report}$1"
	fi
}

emit_and_exit() {
	# $1 = 完整訊息。以 jq 組 JSON 確保跳脫正確；jq 不在時退回 stderr（只進 debug log）。
	if [ "${#1}" -gt "$MSG_BUDGET" ]; then
		set -- "$(printf '%s' "$1" | cut -c1-"$MSG_BUDGET")
…（訊息過長已截斷，完整內容見 debug log）"
	fi
	if command -v jq >/dev/null 2>&1; then
		printf '%s' "$1" | jq -Rs '{systemMessage: .}'
	else
		printf '%s\n' "$1" >&2
	fi
	exit 0
}

# ── 定位所有 worktree ─────────────────────────────────────────────────────
# 錨點用 $CLAUDE_PROJECT_DIR（官方契約：固定在 session 起始的專案根目錄，
# 不隨 cwd 或進入 worktree 而移動），cwd 只當備援。
# 只靠 cwd 的話，session 若從非 repo 目錄啟動，整支腳本會什麼都不檢查卻回報綠燈。
list_worktrees() {
	git -C "$1" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print substr($0, 10)}'
}

worktrees=""
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
	worktrees=$(list_worktrees "$CLAUDE_PROJECT_DIR")
fi
if [ -z "$worktrees" ]; then
	worktrees=$(list_worktrees "$PWD")
fi

# 連 repo 都找不到：不擋（無法判定身分時的安全預設），但要出聲，不可靜默通過。
if [ -z "$worktrees" ]; then
	emit_and_exit "⚠️ Stop hook 未執行型別檢查：找不到 git repo
  CLAUDE_PROJECT_DIR=${CLAUDE_PROJECT_DIR:-（未設定）}
  cwd=$PWD
  本次結束未經型別把關，請自行確認。"
fi

# `git worktree list` 保證**主 worktree 為第一筆**，其後才是各 linked worktree
# （git-worktree(1) 的 list 子指令明載）。porcelain 格式沒有標示身分的欄位，
# 依賴的是這個順序保證，而不是路徑推導——
# `dirname $(git rev-parse --git-common-dir)` 在 --separate-git-dir、submodule、
# bare repo 三種佈局下都會算錯，且算錯後會靜默通過。
main_wt=$(printf '%s\n' "$worktrees" | head -1)

# ── 主 worktree：型別錯誤即擋 ─────────────────────────────────────────────
check_dir "$main_wt"
case $? in
	1)
		printf '%s\n' "$OUT" >&2
		# stop_hook_active 為真代表上一次已經擋過一輪。再擋只會空轉到 8 次上限，
		# 改為出聲放行，把決定權交還使用者。
		if [ "$stop_active" = "true" ]; then
			emit_and_exit "⚠️ 主 worktree 仍有型別錯誤，但已擋過一輪，本次放行
  $main_wt
$(excerpt "$OUT")
  請自行修正後再繼續。"
		fi
		printf '\n❌ 主 worktree 型別檢查失敗：%s\n' "$main_wt" >&2
		printf '   main 必須恆為綠，請修正上述型別錯誤後再結束 session。\n' >&2
		exit 2
		;;
	2)
		printf '%s\n' "$OUT" >&2
		add_report "  · ${main_wt}（主 worktree）
    型別檢查跑不起來（非型別錯誤），已放行未擋下。詳見 debug log。
$(printf '%s\n' "$OUT" | head -5 | sed 's/^/    /')
"
		;;
esac

# ── linked worktree：檢查但不擋 ────────────────────────────────────────────
while IFS= read -r wt; do
	[ -n "$wt" ] || continue
	[ "$wt" != "$main_wt" ] || continue
	# porcelain 不會跳脫換行，含換行的路徑會被拆成兩筆而產生相對路徑；一律拒絕。
	case "$wt" in
		/*) ;;
		*) continue ;;
	esac
	[ -d "$wt" ] || continue

	# 沒裝相依就跳過，不要因此判紅——新開的 worktree 尚未 pnpm install 是正常狀態。
	if [ ! -d "$wt/node_modules" ]; then
		add_report "  · ${wt}
    尚未安裝相依，已略過檢查（在該目錄執行 pnpm install 後才會納入）
"
		continue
	fi

	check_dir "$wt"
	case $? in
		1)
			printf '=== linked worktree 型別錯誤：%s ===\n%s\n' "$wt" "$OUT" >&2
			n=$(printf '%s\n' "$OUT" | grep -c "error TS")
			add_report "  · ${wt}
$(excerpt "$OUT")
    （共 ${n} 個 error TS；重跑：cd ${wt} && pnpm -r exec tsc --noEmit）
"
			;;
		2)
			printf '=== linked worktree 工具鏈故障：%s ===\n%s\n' "$wt" "$OUT" >&2
			add_report "  · ${wt}
    型別檢查跑不起來（非型別錯誤），詳見 debug log。
$(printf '%s\n' "$OUT" | head -5 | sed 's/^/    /')
"
			;;
	esac
done <<EOF
$worktrees
EOF

# 全部乾淨：安靜通過。
[ -n "$report" ] || exit 0

emit_and_exit "⚠️ 型別檢查有未通過項目（不擋下 session，僅提示）
${report}
註：TDD 的 RED 步驟本身就會產生型別錯誤（測試 import 尚不存在的模組），
若目前正處於紅燈階段，這是預期狀態，不需要修。"
