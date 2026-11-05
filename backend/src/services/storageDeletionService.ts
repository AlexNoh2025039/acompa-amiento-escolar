import { prisma } from '../lib/prisma'
import { removeStoredObject } from '../modules/families/uploads'

export async function processStorageDeletionQueue() {
  const pending = await prisma.storageDeletion.findMany({
    orderBy: { createdAt: 'asc' },
    take: 25,
    select: { id: true, storageKey: true },
  })
  for (const item of pending) {
    try {
      await removeStoredObject(item.storageKey)
      await prisma.storageDeletion.deleteMany({ where: { id: item.id } })
    } catch (error) {
      console.error(`No se pudo borrar el archivo privado ${item.storageKey}`, error)
    }
  }
  return prisma.storageDeletion.count()
}
