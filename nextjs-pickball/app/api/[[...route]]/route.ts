import { getCloudflareContext } from "@opennextjs/cloudflare";

// 將 /api/* 的請求經 service binding 原樣轉發給 hono-pickball Worker。
// 瀏覽器視角為 same-origin（請求的 URL host 不會被改寫），未來 better-auth
// 的 Set-Cookie 會直接落在前端 origin，沒有跨域 cookie 問題。
//
// 注意：不能把 NextRequest 實例直接傳給 binding 的 fetch——Next.js 對 fetch
// 做了 instrumentation，非同 realm 的 Request 會被當成 URL 字串化而拋出
// 「Invalid URL: [object Request]」。先以 new Request() 重建再轉發。
const proxyToHono = async (request: Request): Promise<Response> => {
  const { env } = getCloudflareContext();
  return env.HONO_API.fetch(new Request(request.url, request));
};

export const GET = proxyToHono;
export const POST = proxyToHono;
export const PUT = proxyToHono;
export const PATCH = proxyToHono;
export const DELETE = proxyToHono;
export const OPTIONS = proxyToHono;
export const HEAD = proxyToHono;
