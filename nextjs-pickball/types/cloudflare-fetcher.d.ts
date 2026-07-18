// cloudflare-env.d.ts（cf-typegen 產物）的 CloudflareEnv 介面引用了 Fetcher 型別。
// 本專案是 DOM 環境（Next.js），不能引入完整 workers runtime 型別——其 HTMLRewriter
// 的 Element 介面會與 DOM lib 的 Element 全域合併，破壞 append 等 DOM API 的型別。
// 因此 cf-typegen 以 --include-runtime=false 產生，並在此宣告最小可用的 Fetcher。
declare interface Fetcher {
  fetch: typeof fetch;
}
