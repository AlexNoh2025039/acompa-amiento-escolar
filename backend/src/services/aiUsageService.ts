import type { AiUsagePurpose } from '@prisma/client'
import { prisma } from '../lib/prisma'

export async function recordAiUsage(userId: string, purpose: AiUsagePurpose) {
  return prisma.aiUsage.create({ data: { userId, purpose } })
}

export async function releaseAiUsage(reservationId: string) {
  await prisma.aiUsage.deleteMany({ where: { id: reservationId } })
}

export async function withAiUsage<T>(
  userId: string,
  purpose: AiUsagePurpose,
  generate: () => Promise<T>,
) {
  const usageRecord = await recordAiUsage(userId, purpose)
  try {
    return await generate()
  } catch (error) {
    await releaseAiUsage(usageRecord.id)
    throw error
  }
}
