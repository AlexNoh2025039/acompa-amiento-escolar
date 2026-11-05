import argon2 from 'argon2'
import { Prisma } from '@prisma/client'
import { AppError } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { createRefreshToken, hashToken, signAccessToken } from '../../lib/tokens'
import type { LoginInput, RegisterInput } from './auth.schema'

export type PublicUser = {
  id: string
  fullName: string
  email: string
  role: 'parent' | 'student'
  familyId: string
}

type SessionUser = PublicUser & { passwordHash?: string }

export type AuthSession = {
  user: PublicUser
  accessToken: string
  refreshToken: string
}

const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar')

let dummyHash: string | null = null

async function dummyPasswordHash() {
  if (!dummyHash) {
    dummyHash = await argon2.hash('not-a-real-password', { type: argon2.argon2id })
  }
  return dummyHash
}

function toPublicUser(user: SessionUser): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    familyId: user.familyId,
  }
}

async function issueSession(user: SessionUser): Promise<AuthSession> {
  const refresh = createRefreshToken()
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    },
  })

  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(user),
    refreshToken: refresh.raw,
  }
}

export async function registerParent(input: RegisterInput): Promise<AuthSession> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  })
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'Ese correo ya está registrado')
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id })

  try {
    const user = await prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: { name: `Familia de ${input.fullName}` },
      })
      const created = await tx.user.create({
        data: {
          familyId: family.id,
          role: 'parent',
          fullName: input.fullName,
          email: input.email,
          passwordHash,
        },
      })
      await tx.notificationPreference.create({
        data: { userId: created.id, emailSummary: false },
      })
      return created
    })

    return issueSession(user)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'EMAIL_TAKEN', 'Ese correo ya está registrado')
    }
    throw error
  }
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  const hash = user?.passwordHash ?? (await dummyPasswordHash())
  const matches = await argon2.verify(hash, input.password)
  if (!user || !matches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos')
  }
  return issueSession(user)
}

export async function rotateRefresh(raw: string | undefined): Promise<AuthSession> {
  if (!raw) {
    throw unauthorized()
  }

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  })
  if (!existing) {
    throw unauthorized()
  }

  if (existing.revokedAt || existing.expiresAt.getTime() <= Date.now()) {
    if (existing.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    throw unauthorized()
  }

  const consumed = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (consumed.count !== 1) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    throw unauthorized()
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } })
  if (!user) {
    throw unauthorized()
  }

  return issueSession(user)
}

export async function revokeRefresh(raw: string | undefined) {
  if (!raw) {
    return
  }
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
