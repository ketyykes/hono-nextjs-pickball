---
name: invisible-chars-in-regex
description: 審查 regex／字串常數時要用 od -c 驗證是否含肉眼看不見的字面字元（如 U+FE0F），應改成 \u{FE0F} 跳脫
metadata:
  type: feedback
---

審查含 emoji／Unicode 的 regex 時，用 `sed -n <行>p file | od -c` 檢查位元組；U+FE0F（變體選擇器）等字元在編輯器與 diff 中看不見，應要求寫成 `\u{FE0F}`。

**Why:** remove-emoji change（2026-10-10）的 `app/emojiFree.test.ts` 把 U+FE0F 以字面字元寫進 pattern，閱讀時看起來像空的 `||` 分支；連 openspec spec／design 原文也是字面字元，容易被照抄。

**How to apply:** 任何以字元類別守門的測試（emoji、全形符號、零寬字元）都先 od 檢查；同檔其他地方已用 `\u{...}` 時更應統一。
