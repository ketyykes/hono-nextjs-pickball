import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 本站為純靜態內容＋client 互動，無 ISR / data cache 需求，
// 空設定即可（不需 R2 / KV / Queue）。未來若加入 ISR 或 revalidate，
// 再依 https://opennext.js.org/cloudflare/caching 補上 incrementalCache。
export default defineCloudflareConfig();
