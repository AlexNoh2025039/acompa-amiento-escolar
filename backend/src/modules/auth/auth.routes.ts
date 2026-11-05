import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import type { RequestHandler } from 'express'
import { env } from '../../env'
import { asyncHandler } from '../../lib/asyncHandler'
import { clearAuthCookies, refreshCookieName, setAuthCookies } from '../../lib/cookies'
import { requireAuth } from '../../middleware/requireAuth'
import { validateBody } from '../../middleware/validate'
import { requestPasswordReset, resetPassword } from '../../controllers/authController'
import { loginSchema, registerSchema } from './auth.schema'
import { requestPasswordResetSchema, resetPasswordSchema } from './passwordReset.schema'
import { login, registerParent, revokeRefresh, rotateRefresh } from './auth.service'

const passthrough: RequestHandler = (_req, _res, next) => next()

export const authRateLimit: RequestHandler =
  env.NODE_ENV === 'test'
    ? passthrough
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: {
            code: 'RATE_LIMITED',
            message: 'Demasiados intentos. Espera un momento.',
          },
        },
      })

export const authRouter = Router()

authRouter.post(
  '/forgot-password',
  authRateLimit,
  validateBody(requestPasswordResetSchema),
  asyncHandler(requestPasswordReset),
)

authRouter.post(
  '/reset-password',
  authRateLimit,
  validateBody(resetPasswordSchema),
  asyncHandler(resetPassword),
)

authRouter.post(
  '/register',
  authRateLimit,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const session = await registerParent(req.body)
    setAuthCookies(res, session.accessToken, session.refreshToken)
    res.status(201).json({ user: session.user })
  }),
)

authRouter.post(
  '/login',
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const session = await login(req.body)
    setAuthCookies(res, session.accessToken, session.refreshToken)
    res.status(200).json({ user: session.user })
  }),
)

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[refreshCookieName]
    const session = await rotateRefresh(typeof raw === 'string' ? raw : undefined)
    setAuthCookies(res, session.accessToken, session.refreshToken)
    res.status(200).json({ user: session.user })
  }),
)

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[refreshCookieName]
    await revokeRefresh(typeof raw === 'string' ? raw : undefined)
    clearAuthCookies(res)
    res.status(204).send()
  }),
)

authRouter.get('/me', requireAuth, (req, res) => {
  const user = req.user!
  res.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      familyId: user.familyId,
    },
  })
})
