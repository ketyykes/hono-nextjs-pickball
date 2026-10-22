import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { createAuth } from './auth/create-auth'
import { localAuth } from './auth/local-auth-middleware'
import { isLocalAuthEnabled } from './auth/local-auth'
import { toPublicUser } from './auth/public-user'
import { requireSession, type AuthAppEnv } from './auth/require-session'
import { matchmakerRoutes } from './routes/matchmaker'
import { scoreboardRoutes } from './routes/scoreboard'

const app = new Hono<AuthAppEnv>()

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

app.use('/api/auth/*', localAuth)

// better-auth 的 handler 自行處理 /api/auth/* 底下的所有路徑
app.on(['GET', 'POST'], '/api/auth/*', (c) => c.var.auth.handler(c.req.raw))

app.get('/api/me', localAuth, requireSession, (c) => {
  return c.json({ user: toPublicUser(c.var.user) })
})

app.route('/api/scoreboard', scoreboardRoutes)
app.route('/api/matchmaker', matchmakerRoutes)

// 狀態探針永遠回 200：前端每頁都會呼叫，4xx 會被瀏覽器記為 console 錯誤。
// 因此刻意不掛 localAuth（停用時要回 200 而非 404），停用分支也不建立 auth、不碰 D1。
// 本端點只回報狀態，不可作為授權依據；需要授權的路由一律用 requireSession。
app.get('/api/session', async (c) => {
  if (!isLocalAuthEnabled(c.env)) {
    return c.json({ authEnabled: false, user: null })
  }

  // 包住 auth 建立與 session 查詢：最常見的失敗是本機尚未 migration 卻帶著舊 cookie，
  // 此時訪客 UI 必須照常可用。降級只存在於探針，requireSession 遇到例外仍照常 500。
  try {
    const auth = createAuth(c.env)
    const result = await auth.api.getSession({ headers: c.req.raw.headers })
    return c.json({
      authEnabled: true,
      user: result ? toPublicUser(result.user) : null,
    })
  } catch (error) {
    console.error('查詢 session 失敗，降級為未登入', error)
    return c.json({ authEnabled: true, user: null })
  }
})

export default app
