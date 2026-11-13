import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { asyncHandler } from '../../lib/asyncHandler'
import { prisma } from '../../lib/prisma'
import { validateBody } from '../../middleware/validate'
import {
  readPrivateFile,
  removePrivateFile,
  safeOriginalName,
  savePrivateFile,
  taskFileUpload,
  validateTaskFile,
} from '../families/uploads'
import { processStorageDeletionQueue } from '../../services/storageDeletionService'
import { generateTutorReply } from './geminiTutor'
import { getStudentChild } from './student.service'
import { deleteTutorConversation, purgeExpiredTutorConversations } from './tutor-retention'

const createConversationSchema = z.object({
  subjectId: z.string().min(1),
})

const sendMessageSchema = z.object({
  content: z.string().trim().max(4000, 'El mensaje no puede superar 4000 caracteres').optional(),
})

const conversationLifetimeMs = 30 * 24 * 60 * 60 * 1000
const conversationSelect = {
  id: true,
  title: true,
  subject: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
} as const

export const tutorRouter = Router()

function messageResponse(message: {
  id: string
  role: 'student' | 'assistant'
  content: string
  createdAt: Date
  attachmentStorageKey: string | null
  attachmentMimeType: string | null
  attachmentName: string | null
}, conversationId: string) {
  const { attachmentStorageKey, attachmentMimeType, attachmentName, ...publicMessage } = message
  return {
    ...publicMessage,
    attachment: attachmentStorageKey && attachmentMimeType && attachmentName
      ? {
          name: attachmentName,
          mimeType: attachmentMimeType,
          url: `/api/student/tutor/conversations/${conversationId}/messages/${message.id}/file`,
        }
      : null,
  }
}

tutorRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    await purgeExpiredTutorConversations()
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const conversations = await prisma.tutorConversation.findMany({
      where: { userId: req.user!.id, childId: child.id, expiresAt: { gt: new Date() } },
      select: {
        ...conversationSelect,
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
    res.json({ conversations })
  }),
)

tutorRouter.post(
  '/conversations',
  validateBody(createConversationSchema),
  asyncHandler(async (req, res) => {
    await purgeExpiredTutorConversations()
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const assignedSubject = child.subjects.find(({ subjectId }) => subjectId === req.body.subjectId)
    if (!assignedSubject) {
      throw new AppError(400, 'SUBJECT_NOT_ASSIGNED', 'Elige una materia asignada a tu perfil')
    }
    const conversation = await prisma.tutorConversation.create({
      data: {
        userId: req.user!.id,
        childId: child.id,
        subjectId: assignedSubject.subjectId,
        expiresAt: new Date(Date.now() + conversationLifetimeMs),
      },
      select: conversationSelect,
    })
    res.status(201).json({ conversation })
  }),
)

tutorRouter.get(
  '/conversations/:conversationId',
  asyncHandler(async (req, res) => {
    await purgeExpiredTutorConversations()
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const conversation = await prisma.tutorConversation.findFirst({
      where: {
        id: req.params.conversationId,
        userId: req.user!.id,
        childId: child.id,
        expiresAt: { gt: new Date() },
      },
      include: {
        subject: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!conversation) {
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'No encontramos esa conversación.')
    }
    res.json({
      conversation: {
        ...conversation,
        messages: conversation.messages.map((message) => messageResponse(message, conversation.id)),
      },
    })
  }),
)

tutorRouter.delete(
  '/conversations/:conversationId',
  asyncHandler(async (req, res) => {
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const deleted = await deleteTutorConversation({
      conversationId: req.params.conversationId,
      userId: req.user!.id,
      childId: child.id,
    })
    if (deleted !== 1) {
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'No encontramos esa conversación.')
    }
    await processStorageDeletionQueue()
    res.status(204).send()
  }),
)

tutorRouter.get(
  '/conversations/:conversationId/messages/:messageId/file',
  asyncHandler(async (req, res) => {
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const message = await prisma.tutorMessage.findFirst({
      where: {
        id: req.params.messageId,
        role: 'student',
        attachmentStorageKey: { not: null },
        conversation: {
          id: req.params.conversationId,
          userId: req.user!.id,
          childId: child.id,
          expiresAt: { gt: new Date() },
        },
      },
      select: { attachmentStorageKey: true, attachmentMimeType: true },
    })
    if (!message?.attachmentStorageKey || !message.attachmentMimeType) {
      throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'No encontramos el archivo de este mensaje.')
    }
    const file = await readPrivateFile(message.attachmentStorageKey)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.type(message.attachmentMimeType).send(file)
  }),
)

tutorRouter.post(
  '/conversations/:conversationId/messages',
  taskFileUpload,
  asyncHandler(async (req, res) => {
    await purgeExpiredTutorConversations()
    const parsed = sendMessageSchema.safeParse(req.body)
    if (!parsed.success) throw parsed.error
    if (!parsed.data.content && !req.file) {
      throw new AppError(400, 'MESSAGE_REQUIRED', 'Escribe una pregunta o adjunta una foto o PDF.')
    }
    if (req.file) validateTaskFile(req.file)
    const content = parsed.data.content || 'Ayúdame a entender el ejercicio del archivo adjunto.'
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const conversation = await prisma.tutorConversation.findFirst({
      where: {
        id: req.params.conversationId,
        userId: req.user!.id,
        childId: child.id,
        expiresAt: { gt: new Date() },
      },
      include: { subject: true },
    })
    if (!conversation) {
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'No encontramos esa conversación.')
    }

    const recentMessages = await prisma.tutorMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    const history = await Promise.all(recentMessages.reverse().map(async (message) => ({
      role: message.role,
      content: message.content,
      ...(message.attachmentStorageKey && message.attachmentMimeType
        ? {
            attachment: {
              mimeType: message.attachmentMimeType,
              data: (await readPrivateFile(message.attachmentStorageKey)).toString('base64'),
            },
          }
        : {}),
    })))
    const reply = await generateTutorReply({
      userId: req.user!.id,
      grade: child.grade,
      subject: conversation.subject.name,
      history,
      message: content,
      ...(req.file
        ? { attachment: { mimeType: req.file.mimetype, data: req.file.buffer.toString('base64') } }
        : {}),
    })
    const attachmentStorageKey = req.file ? await savePrivateFile(req.file) : null
    const title = conversation.title === 'Nueva conversación'
      ? content.replace(/\s+/g, ' ').slice(0, 80)
      : conversation.title
    const expiresAt = new Date(Date.now() + conversationLifetimeMs)
    const messageCreatedAt = new Date()
    try {
      const [studentMessage, assistantMessage] = await prisma.$transaction(async (tx) => {
        const savedStudentMessage = await tx.tutorMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'student',
            content,
            attachmentStorageKey,
            attachmentMimeType: req.file?.mimetype,
            attachmentName: req.file ? safeOriginalName(req.file.originalname) : null,
            createdAt: messageCreatedAt,
          },
        })
        const savedAssistantMessage = await tx.tutorMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: reply,
            createdAt: new Date(messageCreatedAt.getTime() + 1),
          },
        })
        await tx.tutorConversation.update({
          where: { id: conversation.id },
          data: { title, expiresAt },
        })
        return [savedStudentMessage, savedAssistantMessage]
      })
      res.status(201).json({
        studentMessage: messageResponse(studentMessage, conversation.id),
        assistantMessage: messageResponse(assistantMessage, conversation.id),
        expiresAt,
      })
    } catch (error) {
      if (attachmentStorageKey) {
        try {
          await removePrivateFile(attachmentStorageKey)
        } catch (cleanupError) {
          console.error('No se pudo borrar un adjunto de tutor después de guardar el mensaje', cleanupError)
          await prisma.storageDeletion.createMany({
            data: [{ storageKey: attachmentStorageKey }],
            skipDuplicates: true,
          })
        }
      }
      throw error
    }
  }),
)
