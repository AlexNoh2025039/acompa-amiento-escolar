import { prisma } from '../../lib/prisma'

export async function purgeExpiredTutorConversations() {
  const now = new Date()
  return prisma.$transaction(async (tx) => {
    const expired = await tx.tutorConversation.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true },
    })
    if (expired.length === 0) return { count: 0 }

    const messages = await tx.tutorMessage.findMany({
      where: {
        conversationId: { in: expired.map(({ id }) => id) },
        attachmentStorageKey: { not: null },
      },
      select: { attachmentStorageKey: true },
    })
    const storageKeys = messages.flatMap(({ attachmentStorageKey }) =>
      attachmentStorageKey ? [attachmentStorageKey] : [],
    )
    if (storageKeys.length > 0) {
      await tx.storageDeletion.createMany({
        data: storageKeys.map((storageKey) => ({ storageKey })),
        skipDuplicates: true,
      })
    }
    return tx.tutorConversation.deleteMany({
      where: { id: { in: expired.map(({ id }) => id) }, expiresAt: { lte: now } },
    })
  })
}

export async function deleteTutorConversation(input: {
  conversationId: string
  userId: string
  childId: string
}) {
  const { conversationId, userId, childId } = input
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.tutorConversation.findFirst({
      where: { id: conversationId, userId, childId },
      select: { id: true, messages: { select: { attachmentStorageKey: true } } },
    })
    if (!conversation) return 0

    const storageKeys = conversation.messages.flatMap(({ attachmentStorageKey }) =>
      attachmentStorageKey ? [attachmentStorageKey] : [],
    )
    if (storageKeys.length > 0) {
      await tx.storageDeletion.createMany({
        data: storageKeys.map((storageKey) => ({ storageKey })),
        skipDuplicates: true,
      })
    }
    const deleted = await tx.tutorConversation.deleteMany({
      where: { id: conversation.id, userId, childId },
    })
    return deleted.count
  })
}
