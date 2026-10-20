import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { createAuth } from './auth/create-auth'
import { isLocalAuthEnabled } from './auth/local-auth'

const app = new Hono<{
  Bindings: CloudflareBindings
  Variables: { auth: ReturnType<typeof createAuth> }
}>()

// 刻意不定義 root path：對外 API 一律掛在 /api/* 之下（前端 catch-all proxy 只轉發 /api/*），
// 因此 GET / 回 404 是預期行為，不代表部署失敗。

// 部署冒煙測試端點：驗證 Next.js（OpenNext）→ service binding → Hono 的通路正常
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'hono-pickball',
    timestamp: new Date().toISOString(),
    // 回報實際處理請求的 URL，可確認 service binding 轉發時 host 未被改寫
    requestUrl: c.req.url,
  })
})

// Cookie 穿透測試端點：未來 better-auth 依賴 Set-Cookie 能經 service binding
// 原樣回到瀏覽器（落在前端 origin），呼叫兩次即可驗證來回都通
app.get('/api/cookie-check', (c) => {
  const previousValue = getCookie(c, 'pickball-cookie-check')

  setCookie(c, 'pickball-cookie-check', new Date().toISOString(), {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  })

  return c.json({
    cookieSet: true,
    // 第一次呼叫為 null；第二次呼叫若帶回上次的值，代表 cookie 來回穿透成功
    receivedPreviousValue: previousValue ?? null,
  })
})

// gate 必須在 createAuth 之前：停用時不建立 auth 實例、不觸碰 D1（正式部署沒有 DB binding），
// 回應與未定義路由相同的 404
app.use('/api/auth/*', async (c, next) => {
  if (!isLocalAuthEnabled(c.env)) {
    return c.notFound()
  }
  await next()
})

// better-auth 的 handler 自行處理 /api/auth/* 底下的所有路徑；
// 每個請求依 env 建立 auth 實例並存於 context，同請求的後續 middleware 與 handler 共用
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const auth = createAuth(c.env)
  c.set('auth', auth)
  return auth.handler(c.req.raw)
})

export default app
