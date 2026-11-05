import { env } from '../env'
import { prisma } from '../lib/prisma'
import {
  copyLocalPrivateFileToS3,
  removeLocalPrivateFile,
} from '../modules/families/uploads'

async function main() {
  if (env.STORAGE_PROVIDER !== 's3') {
    throw new Error('Configura STORAGE_PROVIDER=s3 antes de migrar archivos.')
  }
  const [attachments, artifacts] = await Promise.all([
    prisma.taskAttachment.findMany({
      select: { storageKey: true, mimeType: true },
      orderBy: { id: 'asc' },
    }),
    prisma.learningArtifact.findMany({
      where: { storageKey: { not: null }, mimeType: { not: null } },
      select: { storageKey: true, mimeType: true },
      orderBy: { id: 'asc' },
    }),
  ])
  const files = [...attachments, ...artifacts]
    .filter((file): file is { storageKey: string; mimeType: string } =>
      Boolean(file.storageKey && file.mimeType),
    )
  for (const file of files) {
    await copyLocalPrivateFileToS3(file.storageKey, file.mimeType)
    if (process.argv.includes('--delete-local')) {
      await removeLocalPrivateFile(file.storageKey)
    }
  }
  console.log(`Migración completada: ${files.length} archivos copiados${process.argv.includes('--delete-local') ? ' y eliminados del disco local' : ''}.`)
}

main()
  .catch((error: unknown) => {
    console.error('Falló la migración de adjuntos a S3', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
