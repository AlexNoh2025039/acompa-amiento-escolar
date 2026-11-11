import type { AiUsagePurpose } from '@prisma/client'
import { env } from '../env'
import { AppError } from '../lib/errors'
import { prisma } from '../lib/prisma'

const quotaWindowMs = 24 * 60 * 60 * 1000

export async function getAiQuota(userId: string) {
  const resetAt = new Date(Date.now() - quotaWindowMs)
  const [used, oldest] = await Promise.all([
    prisma.aiUsage.count({ where: { userId, purpose: { not: 'practice' }, createdAt: { gt: resetAt } } }),
    prisma.aiUsage.findFirst({
      where: { userId, purpose: { not: 'practice' }, createdAt: { gt: resetAt } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])
  return {
    limit: env.AI_DAILY_LIMIT,
    used,
    remaining: Math.max(0, env.AI_DAILY_LIMIT - used),
    resetsAt: oldest ? new Date(oldest.createdAt.getTime() + quotaWindowMs) : null,
  }
}

export async function reserveAiUsage(userId: string, purpose: AiUsagePurpose) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})) IS NULL`
    const resetAt = new Date(Date.now() - quotaWindowMs)
    const used = await tx.aiUsage.count({
      where: { userId, purpose: { not: 'practice' }, createdAt: { gt: resetAt } },
    })
    if (used >= env.AI_DAILY_LIMIT) {
      throw new AppError(429, 'AI_DAILY_LIMIT', 'Ya usaste tus solicitudes de IA disponibles por hoy. Inténtalo de nuevo cuando se renueve tu límite.')
    }
    return tx.aiUsage.create({ data: { userId, purpose } })
  })
}

export async function releaseAiUsage(reservationId: string) {
  await prisma.aiUsage.deleteMany({ where: { id: reservationId } })
}

export async function withAiUsage<T>(
  userId: string,
  purpose: AiUsagePurpose,
  generate: () => Promise<T>,
) {
  const reservation = await reserveAiUsage(userId, purpose)
  try {
    return await generate()
  } catch (error) {
    await releaseAiUsage(reservation.id)
    throw error
  }
}
