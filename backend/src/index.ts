import { createApp } from './app'
import { env } from './env'
import { purgeExpiredTutorConversations } from './modules/student/tutor-retention'
import { processStorageDeletionQueue } from './services/storageDeletionService'

const app = createApp()

app.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}`)
})

const tutorRetentionTimer = setInterval(() => {
  void purgeExpiredTutorConversations().catch((error: unknown) => {
    console.error('No se pudieron eliminar las conversaciones vencidas del tutor', error)
  })
}, 60 * 60 * 1000)
tutorRetentionTimer.unref()

const storageDeletionTimer = setInterval(() => {
  void processStorageDeletionQueue().catch((error: unknown) => {
    console.error('No se pudo procesar la cola de borrado de archivos', error)
  })
}, 60 * 1000)
storageDeletionTimer.unref()

void purgeExpiredTutorConversations().catch((error: unknown) => {
  console.error('No se pudieron eliminar las conversaciones vencidas del tutor', error)
})
void processStorageDeletionQueue().catch((error: unknown) => {
  console.error('No se pudo procesar la cola de borrado de archivos', error)
})
