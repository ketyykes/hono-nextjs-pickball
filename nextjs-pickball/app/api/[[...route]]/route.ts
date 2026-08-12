import { getCloudflareContext } from "@opennextjs/cloudflare";

// 將 /api/* 的請求經 service binding 原樣轉發給 hono-pickball Worker。
// 瀏覽器視角為 same-origin（請求的 URL host 不會被改寫），未來 better-auth
// 的 Set-Cookie 會直接落在前端 origin，沒有跨域 cookie 問題。
//
// 注意：不能把任何 Request 實例（連 new Request() 重建的也不行）傳給 binding
// 的 fetch。`next dev` 下 getCloudflareContext() 的 service binding 是 miniflare
// proxy，跨 realm 的 Request 物件會被字串化成「[object Request]」而拋 Invalid URL。
// 因此改傳「URL 字串 + init」，dev（miniflare）與正式（workerd）皆可通。
const proxyToHono = async (request: Request): Promise<Response> => {
  const { env } = getCloudflareContext();
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await env.HONO_API.fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? request.body : undefined,
    // 串流 request body 時 undici/workerd 要求 duplex: "half"
    ...(hasBody ? { duplex: "half" } : {}),
  });
  // 同理，`next dev` 下 miniflare 回傳的是跨 realm 的 Response（Next.js 認不得的
  // 「_Response」），需在本 realm 重建一份，Next 才會接受為合法 Response。
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
};

export const GET = proxyToHono;
export const POST = proxyToHono;
export const PUT = proxyToHono;
export const PATCH = proxyToHono;
export const DELETE = proxyToHono;
export const OPTIONS = proxyToHono;
export const HEAD = proxyToHono;
