import type { Response } from 'express'
import { env } from '../env'

export const accessCookieName = 'access_token'
export const refreshCookieName = 'refresh_token'

const accessMaxAgeMs = 15 * 60 * 1000
const refreshMaxAgeMs = 7 * 24 * 60 * 60 * 1000

function baseOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(accessCookieName, accessToken, baseOptions(accessMaxAgeMs))
  res.cookie(refreshCookieName, refreshToken, baseOptions(refreshMaxAgeMs))
}

export function clearAuthCookies(res: Response) {
  const clearOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
  }
  res.clearCookie(accessCookieName, clearOptions)
  res.clearCookie(refreshCookieName, clearOptions)
}
