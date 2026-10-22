import { createMiddleware } from 'hono/factory'
import { createAuth } from './create-auth'
import { isLocalAuthEnabled } from './local-auth'
import type { AuthAppEnv } from './require-session'

// gate 必須在 createAuth 之前：停用時不建立 auth 實例、不觸碰 D1（正式部署沒有 DB binding），
// 回應與未定義路由相同的 404。通過後每個請求只建立一次 auth 並存於 context，
// 後續的 handler 與 requireSession 一律讀 c.var.auth。
export const localAuth = createMiddleware<AuthAppEnv>(async (c, next) => {
  if (!isLocalAuthEnabled(c.env)) {
    return c.notFound()
  }
  c.set('auth', createAuth(c.env))
  await next()
})
