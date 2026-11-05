import { randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import argon2 from 'argon2'
import { env } from '../env'
import { AppError } from '../lib/errors'
import { hashToken } from '../lib/tokens'
import { prisma } from '../lib/prisma'
import { assertEmailConfigured, sendPasswordResetEmail } from '../services/emailService'
import type { ResetPasswordInput, RequestPasswordResetInput } from '../modules/auth/passwordReset.schema'

const resetTokenLifetimeMs = 30 * 60 * 1000

export async function requestPasswordReset(
  req: Request<unknown, unknown, RequestPasswordResetInput>,
  res: Response,
) {
  assertEmailConfigured()
  const user = await prisma.user.findUnique({
    where: { email: req.body.email },
    select: { id: true, email: true },
  })

  if (user) {
    const rawToken = randomBytes(32).toString('base64url')
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + resetTokenLifetimeMs)
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      })
    })

    const resetUrl = new URL('/reset-password', env.CLIENT_ORIGIN)
    resetUrl.searchParams.set('token', rawToken)
    try {
      await sendPasswordResetEmail(user.email, resetUrl.toString())
    } catch (error) {
      await prisma.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: new Date() },
      })
      console.error('No se pudo enviar el correo de restablecimiento de contraseña', error)
    }
  }

  res.status(202).json({
    message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
  })
}

export async function resetPassword(
  req: Request<unknown, unknown, ResetPasswordInput>,
  res: Response,
) {
  const tokenHash = hashToken(req.body.token)
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  })
  if (!token || token.usedAt || token.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'El enlace venció o ya se utilizó. Solicita uno nuevo.')
  }

  const passwordHash = await argon2.hash(req.body.password, { type: argon2.argon2id })
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    })
    if (consumed.count !== 1) {
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'El enlace venció o ya se utilizó. Solicita uno nuevo.')
    }
    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash },
    })
    await tx.refreshToken.updateMany({
      where: { userId: token.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  })

  res.status(204).send()
}
