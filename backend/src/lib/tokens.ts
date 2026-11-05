import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../env'

const accessTtl = '15m'
const refreshTtlMs = 7 * 24 * 60 * 60 * 1000

export function hashToken(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function signAccessToken(user: { id: string; familyId: string; role: Role }) {
  return jwt.sign(
    { sub: user.id, familyId: user.familyId, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: accessTtl },
  )
}

export function readAccessSubject(token: string) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET)
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    return null
  }
  return payload.sub
}

export function createRefreshToken() {
  const raw = crypto.randomBytes(32).toString('base64url')
  return {
    raw,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + refreshTtlMs),
  }
}
