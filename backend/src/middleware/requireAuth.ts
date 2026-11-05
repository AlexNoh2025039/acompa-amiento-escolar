import type { RequestHandler } from 'express'
import type { Role } from '@prisma/client'
import { JsonWebTokenError } from 'jsonwebtoken'
import { AppError } from '../lib/errors'
import { accessCookieName } from '../lib/cookies'
import { prisma } from '../lib/prisma'
import { readAccessSubject } from '../lib/tokens'

const unauthorized = new AppError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar')

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[accessCookieName]
    if (typeof token !== 'string' || token.length === 0) {
      next(unauthorized)
      return
    }

    const userId = readAccessSubject(token)
    if (!userId) {
      next(unauthorized)
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, familyId: true, role: true, email: true, fullName: true },
    })

    if (!user) {
      next(unauthorized)
      return
    }

    req.user = user
    next()
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      next(unauthorized)
      return
    }
    next(error)
  }
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'No tienes permiso para esta acción'))
      return
    }
    next()
  }
}
