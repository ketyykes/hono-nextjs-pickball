import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

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

export default app
