import { Router } from 'express'
import { Prisma } from '@prisma/client'
import argon2 from 'argon2'
import { AppError } from '../../lib/errors'
import { asyncHandler } from '../../lib/asyncHandler'
import { prisma } from '../../lib/prisma'
import { requireAuth, requireRole } from '../../middleware/requireAuth'
import { validateBody } from '../../middleware/validate'
import { clearAuthCookies } from '../../lib/cookies'
import {
  childSchema,
  childUpdateSchema,
  familySchema,
  notificationPreferenceSchema,
  scheduleSchema,
  studentAccountSchema,
  subjectSchema,
  taskSchema,
  taskUpdateSchema,
} from './families.schema'
import {
  readPrivateFile,
  removePrivateFile,
  safeOriginalName,
  savePrivateFile,
  taskFileUpload,
  validateTaskFile,
} from './uploads'
import { processStorageDeletionQueue } from '../../services/storageDeletionService'
import { practiceQuestions } from '../student/practiceQuestions'

export const familiesRouter = Router()
const parentAccess = [requireAuth, requireRole('parent')] as const

async function findChild(childId: string, familyId: string) {
  const child = await prisma.child.findFirst({ where: { id: childId, familyId } })
  if (!child) {
    throw new AppError(404, 'NOT_FOUND', 'No encontramos a este hijo en tu familia')
  }
  return child
}

async function assertSubjectAssigned(childId: string, subjectId: string | null | undefined) {
  if (!subjectId) {
    return
  }
  const assignment = await prisma.childSubject.findUnique({
    where: { childId_subjectId: { childId, subjectId } },
    select: { id: true },
  })
  if (!assignment) {
    throw new AppError(400, 'SUBJECT_NOT_ASSIGNED', 'Asigna la materia al hijo antes de usarla')
  }
}

async function removeAttachments(storageKeys: string[]) {
  await Promise.all(storageKeys.map((storageKey) => removePrivateFile(storageKey)))
}

familiesRouter.get(
  '/me',
  requireAuth,
  requireRole('parent', 'student'),
  asyncHandler(async (req, res) => {
    const family = await prisma.family.findFirst({
      where: { id: req.user!.familyId },
      select: { id: true, name: true },
    })

    if (!family) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos tu familia')
    }

    res.json({ family })
  }),
)

familiesRouter.put(
  '/me',
  ...parentAccess,
  validateBody(familySchema),
  asyncHandler(async (req, res) => {
    const family = await prisma.family.update({
      where: { id: req.user!.familyId },
      data: { name: req.body.name },
      select: { id: true, name: true },
    })
    res.json({ family })
  }),
)

familiesRouter.delete(
  '/me',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    const familyId = req.user!.familyId
    let storageKeys: string[] = []
    await prisma.$transaction(async (tx) => {
      const [attachments, artifacts, tutorAttachments] = await Promise.all([
        tx.taskAttachment.findMany({
          where: { task: { child: { familyId } } },
          select: { storageKey: true },
        }),
        tx.learningArtifact.findMany({
          where: { child: { familyId }, storageKey: { not: null } },
          select: { storageKey: true },
        }),
        tx.tutorMessage.findMany({
          where: {
            attachmentStorageKey: { not: null },
            conversation: { child: { familyId } },
          },
          select: { attachmentStorageKey: true },
        }),
      ])
      storageKeys = [...new Set([
        ...attachments.map(({ storageKey }) => storageKey),
        ...artifacts.flatMap(({ storageKey }) => storageKey ? [storageKey] : []),
        ...tutorAttachments.flatMap(({ attachmentStorageKey }) => attachmentStorageKey ? [attachmentStorageKey] : []),
      ])]
      if (storageKeys.length > 0) {
        await tx.storageDeletion.createMany({
          data: storageKeys.map((storageKey) => ({ storageKey })),
          skipDuplicates: true,
        })
      }
      await tx.task.deleteMany({ where: { child: { familyId } } })
      await tx.family.delete({ where: { id: familyId } })
    })
    clearAuthCookies(res)
    await processStorageDeletionQueue()
    const pendingFiles = await prisma.storageDeletion.count({
      where: { storageKey: { in: storageKeys } },
    })
    if (pendingFiles > 0) {
      res.status(202).json({
        message: 'La cuenta se eliminó. Algunos archivos privados siguen en cola de borrado y se volverán a intentar automáticamente.',
      })
      return
    }
    res.status(204).send()
  }),
)

familiesRouter.get(
  '/me/overview',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    const [family, children] = await Promise.all([
      prisma.family.findUnique({
        where: { id: req.user!.familyId },
        select: { id: true, name: true },
      }),
      prisma.child.findMany({
        where: { familyId: req.user!.familyId },
        select: { id: true, fullName: true, grade: true, birthDate: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])
    if (!family) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos tu familia')
    }
    if (children.length === 0) {
      res.json({ family, children: [] })
      return
    }

    const childIds = children.map(({ id }) => id)
    const [taskGroups, upcomingTasks, evaluations, pointTotals, gradeHistory] = await Promise.all([
      prisma.task.groupBy({
        by: ['childId', 'status'],
        where: { childId: { in: childIds } },
        _count: { _all: true },
      }),
      prisma.task.findMany({
        where: {
          childId: { in: childIds },
          status: { not: 'completed' },
          dueAt: { gte: new Date() },
        },
        select: { childId: true, title: true, dueAt: true },
        orderBy: { dueAt: 'asc' },
      }),
      prisma.evaluation.findMany({
        where: { childId: { in: childIds }, practiceAttemptId: { not: null } },
        select: { childId: true, subjectId: true, score: true, maxScore: true, subject: { select: { name: true } } },
      }),
      prisma.pointTransaction.groupBy({
        by: ['childId'],
        where: { childId: { in: childIds } },
        _sum: { points: true },
      }),
      prisma.childGradeHistory.findMany({
        where: { childId: { in: childIds } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const summaries = children.map((child) => {
      const childTasks = taskGroups.filter((group) => group.childId === child.id)
      const childEvaluations = evaluations.filter((evaluation) => evaluation.childId === child.id)
      const scores = childEvaluations.map(
        ({ score, maxScore }) => (Number(score) / Number(maxScore)) * 100,
      )
      const subjectScores = new Map<string, { name: string; total: number; count: number }>()
      for (const evaluation of childEvaluations) {
        const current = subjectScores.get(evaluation.subjectId) ?? {
          name: evaluation.subject.name,
          total: 0,
          count: 0,
        }
        current.total += (Number(evaluation.score) / Number(evaluation.maxScore)) * 100
        current.count += 1
        subjectScores.set(evaluation.subjectId, current)
      }
      const nextTask = upcomingTasks.find((task) => task.childId === child.id)
      return {
        ...child,
        tasks: {
          pending: childTasks.find(({ status }) => status === 'pending')?._count._all ?? 0,
          inProgress: childTasks.find(({ status }) => status === 'in_progress')?._count._all ?? 0,
          completed: childTasks.find(({ status }) => status === 'completed')?._count._all ?? 0,
        },
        nextTask: nextTask ? { title: nextTask.title, dueAt: nextTask.dueAt } : null,
        averageScore:
          scores.length > 0
            ? Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 10) / 10
            : null,
        evaluationCount: scores.length,
        points: pointTotals.find((item) => item.childId === child.id)?._sum.points ?? 0,
        subjectAverages: [...subjectScores.values()].map(({ name, total, count }) => ({
          name,
          averageScore: Math.round((total / count) * 10) / 10,
          evaluationCount: count,
        })),
        gradeHistory: gradeHistory
          .filter((entry) => entry.childId === child.id)
          .slice(0, 5)
          .map(({ fromGrade, toGrade, createdAt }) => ({ fromGrade, toGrade, createdAt })),
      }
    })
    res.json({ family, children: summaries })
  }),
)

familiesRouter.get(
  '/me/children',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    const children = await prisma.child.findMany({
      where: { familyId: req.user!.familyId },
      orderBy: { createdAt: 'asc' },
      include: {
        subjects: { include: { subject: true } },
        user: { select: { id: true, email: true } },
      },
    })
    res.json({
      children: children.map(({ subjects, ...child }) => ({
        ...child,
        subjects: subjects.map(({ subject }) => subject),
      })),
    })
  }),
)

familiesRouter.post(
  '/me/children',
  ...parentAccess,
  validateBody(childSchema),
  asyncHandler(async (req, res) => {
    const child = await prisma.child.create({
      data: {
        familyId: req.user!.familyId,
        fullName: req.body.fullName,
        birthDate: new Date(`${req.body.birthDate}T00:00:00.000Z`),
        grade: req.body.grade,
      },
    })
    res.status(201).json({ child: { ...child, subjects: [], user: null } })
  }),
)

familiesRouter.post(
  '/me/children/:childId/account',
  ...parentAccess,
  validateBody(studentAccountSchema),
  asyncHandler(async (req, res) => {
    const child = await findChild(req.params.childId, req.user!.familyId)
    if (child.userId) {
      throw new AppError(409, 'STUDENT_ACCOUNT_EXISTS', 'Este perfil ya tiene una cuenta de alumno')
    }

    const emailTaken = await prisma.user.findUnique({
      where: { email: req.body.email },
      select: { id: true },
    })
    if (emailTaken) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Ese correo ya está registrado')
    }

    const passwordHash = await argon2.hash(req.body.password, { type: argon2.argon2id })
    try {
      const student = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            familyId: req.user!.familyId,
            role: 'student',
            fullName: child.fullName,
            email: req.body.email,
            passwordHash,
          },
          select: { id: true, fullName: true, email: true, role: true, familyId: true },
        })
        const linked = await tx.child.updateMany({
          where: { id: child.id, userId: null },
          data: { userId: user.id },
        })
        if (linked.count !== 1) {
          throw new AppError(409, 'STUDENT_ACCOUNT_EXISTS', 'Este perfil ya tiene una cuenta de alumno')
        }
        return user
      })
      res.status(201).json({ student })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'EMAIL_TAKEN', 'Ese correo ya está registrado')
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new AppError(409, 'STUDENT_ACCOUNT_EXISTS', 'Este perfil ya tiene una cuenta de alumno')
      }
      throw error
    }
  }),
)

familiesRouter.patch(
  '/me/children/:childId',
  ...parentAccess,
  validateBody(childUpdateSchema),
  asyncHandler(async (req, res) => {
    const existing = await findChild(req.params.childId, req.user!.familyId)
    const child = await prisma.$transaction(async (tx) => {
      const updatedChild = await tx.child.update({
        where: { id: req.params.childId },
        data: {
          ...req.body,
          ...(req.body.birthDate ? { birthDate: new Date(`${req.body.birthDate}T00:00:00.000Z`) } : {}),
        },
      })
      if (req.body.grade && req.body.grade !== existing.grade) {
        await tx.childGradeHistory.create({
          data: {
            childId: existing.id,
            changedByUserId: req.user!.id,
            fromGrade: existing.grade,
            toGrade: req.body.grade,
          },
        })
      }
      if (req.body.fullName && updatedChild.userId) {
        await tx.user.update({
          where: { id: updatedChild.userId },
          data: { fullName: req.body.fullName },
        })
      }
      return updatedChild
    })
    res.json({ child })
  }),
)

familiesRouter.delete(
  '/me/children/:childId',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    const child = await findChild(req.params.childId, req.user!.familyId)
    let storageKeys: string[] = []
    await prisma.$transaction(async (tx) => {
      const [attachments, artifacts, tutorMessages] = await Promise.all([
        tx.taskAttachment.findMany({
          where: { task: { childId: req.params.childId } },
          select: { storageKey: true },
        }),
        tx.learningArtifact.findMany({
          where: { childId: req.params.childId, storageKey: { not: null } },
          select: { storageKey: true },
        }),
        tx.tutorMessage.findMany({
          where: { conversation: { childId: req.params.childId }, attachmentStorageKey: { not: null } },
          select: { attachmentStorageKey: true },
        }),
      ])
      storageKeys = [...new Set([
        ...attachments.map(({ storageKey }) => storageKey),
        ...artifacts.flatMap(({ storageKey }) => storageKey ? [storageKey] : []),
        ...tutorMessages.flatMap(({ attachmentStorageKey }) => attachmentStorageKey ? [attachmentStorageKey] : []),
      ])]
      if (storageKeys.length > 0) {
        await tx.storageDeletion.createMany({
          data: storageKeys.map((storageKey) => ({ storageKey })),
          skipDuplicates: true,
        })
      }
      await tx.child.delete({ where: { id: req.params.childId } })
      if (child.userId) {
        await tx.user.delete({ where: { id: child.userId } })
      }
    })
    await processStorageDeletionQueue()
    const pendingFiles = storageKeys.length > 0
      ? await prisma.storageDeletion.count({ where: { storageKey: { in: storageKeys } } })
      : 0
    if (pendingFiles > 0) {
      res.status(202).json({
        message: 'El perfil se eliminó. Algunos archivos privados siguen en cola de borrado y se volverán a intentar automáticamente.',
      })
      return
    }
    res.status(204).send()
  }),
)

familiesRouter.get(
  '/me/subjects',
  ...parentAccess,
  asyncHandler(async (_req, res) => {
    const subjects = await prisma.subject.findMany({ orderBy: { name: 'asc' } })
    res.json({ subjects })
  }),
)

familiesRouter.post(
  '/me/subjects',
  ...parentAccess,
  validateBody(subjectSchema),
  asyncHandler(async (req, res) => {
    try {
      const subject = await prisma.subject.create({ data: { name: req.body.name } })
      res.status(201).json({ subject })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'SUBJECT_EXISTS', 'Esa materia ya está en el catálogo')
      }
      throw error
    }
  }),
)

familiesRouter.get(
  '/me/children/:childId/subjects',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const assignments = await prisma.childSubject.findMany({
      where: { childId: req.params.childId },
      include: { subject: true },
      orderBy: { subject: { name: 'asc' } },
    })
    res.json({ subjects: assignments.map(({ subject }) => subject) })
  }),
)

familiesRouter.post(
  '/me/children/:childId/subjects',
  ...parentAccess,
  validateBody(subjectSchema),
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const subject = await prisma.subject.upsert({
      where: { name: req.body.name },
      create: { name: req.body.name },
      update: {},
    })
    await prisma.childSubject.upsert({
      where: { childId_subjectId: { childId: req.params.childId, subjectId: subject.id } },
      create: { childId: req.params.childId, subjectId: subject.id },
      update: {},
    })
    res.status(201).json({ subject })
  }),
)

familiesRouter.delete(
  '/me/children/:childId/subjects/:subjectId',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    await prisma.childSubject.deleteMany({
      where: { childId: req.params.childId, subjectId: req.params.subjectId },
    })
    res.status(204).send()
  }),
)

familiesRouter.get(
  '/me/children/:childId/learning-artifacts',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const artifacts = await prisma.learningArtifact.findMany({
      where: { childId: req.params.childId },
      include: { subject: true, task: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json({
      artifacts: artifacts.map(({ storageKey, content, ...artifact }) => ({
        ...artifact,
        content: artifact.type === 'practice' ? '' : content,
        fileUrl: storageKey
          ? `/api/families/me/children/${req.params.childId}/learning-artifacts/${artifact.id}/file`
          : null,
      })),
    })
  }),
)

familiesRouter.get(
  '/me/children/:childId/learning-artifacts/:artifactId/file',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const artifact = await prisma.learningArtifact.findFirst({
      where: {
        id: req.params.artifactId,
        childId: req.params.childId,
        storageKey: { not: null },
      },
    })
    if (!artifact?.storageKey || !artifact.mimeType) {
      throw new AppError(404, 'ARTIFACT_NOT_FOUND', 'No encontramos el archivo de este material.')
    }
    const file = await readPrivateFile(artifact.storageKey)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.type(artifact.mimeType).send(file)
  }),
)

familiesRouter.get(
  '/me/children/:childId/schedules',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const schedules = await prisma.scheduleBlock.findMany({
      where: { childId: req.params.childId },
      include: { subject: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    })
    res.json({ schedules })
  }),
)

familiesRouter.post(
  '/me/children/:childId/schedules',
  ...parentAccess,
  validateBody(scheduleSchema),
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    await assertSubjectAssigned(req.params.childId, req.body.subjectId)
    const schedule = await prisma.scheduleBlock.create({
      data: { ...req.body, childId: req.params.childId, subjectId: req.body.subjectId || null },
      include: { subject: true },
    })
    res.status(201).json({ schedule })
  }),
)

familiesRouter.patch(
  '/me/children/:childId/schedules/:scheduleId',
  ...parentAccess,
  validateBody(scheduleSchema),
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const existing = await prisma.scheduleBlock.findFirst({
      where: { id: req.params.scheduleId, childId: req.params.childId },
      select: { id: true },
    })
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos este horario')
    }
    await assertSubjectAssigned(req.params.childId, req.body.subjectId)
    const schedule = await prisma.scheduleBlock.update({
      where: { id: existing.id },
      data: { ...req.body, subjectId: req.body.subjectId || null },
      include: { subject: true },
    })
    res.json({ schedule })
  }),
)

familiesRouter.delete(
  '/me/children/:childId/schedules/:scheduleId',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    await prisma.scheduleBlock.deleteMany({
      where: { id: req.params.scheduleId, childId: req.params.childId },
    })
    res.status(204).send()
  }),
)

familiesRouter.get(
  '/me/children/:childId/tasks',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const tasks = await prisma.task.findMany({
      where: { childId: req.params.childId },
      include: { subject: true, attachments: { select: { id: true, originalName: true, mimeType: true } } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    })
    res.json({
      tasks: tasks.map(({ quizQuestions, ...task }) => ({ ...task, isQuiz: Boolean(quizQuestions) })),
    })
  }),
)

familiesRouter.post(
  '/me/children/:childId/tasks',
  ...parentAccess,
  validateBody(taskSchema),
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    await assertSubjectAssigned(req.params.childId, req.body.subjectId)
    const { createQuiz = false, ...taskInput } = req.body
    let quizQuestions = null
    if (createQuiz) {
      if (taskInput.type !== 'exam' || !taskInput.subjectId) {
        throw new AppError(400, 'QUIZ_REQUIRES_EXAM_SUBJECT', 'Un cuestionario necesita tipo Examen y una materia.')
      }
      const child = await prisma.child.findUniqueOrThrow({
        where: { id: req.params.childId },
        select: { grade: true },
      })
      quizQuestions = practiceQuestions(
        (await prisma.subject.findUniqueOrThrow({ where: { id: taskInput.subjectId }, select: { name: true } })).name,
        child.grade,
      )
      if (!quizQuestions) {
        throw new AppError(400, 'QUIZ_UNAVAILABLE', 'Aún no hay cuestionarios para esta materia y grado. Prueba Matemáticas, Ciencias o Español.')
      }
    }
    const task = await prisma.task.create({
      data: {
        ...taskInput,
        ...(createQuiz ? { quizQuestions } : {}),
        childId: req.params.childId,
        createdByUserId: req.user!.id,
        subjectId: taskInput.subjectId || null,
        dueAt: taskInput.dueAt ? new Date(taskInput.dueAt) : null,
        description: taskInput.description || null,
      },
      include: { subject: true, attachments: true },
    })
    const { quizQuestions: _questions, ...publicTask } = task
    res.status(201).json({ task: { ...publicTask, isQuiz: Boolean(quizQuestions) } })
  }),
)

familiesRouter.patch(
  '/me/children/:childId/tasks/:taskId',
  ...parentAccess,
  validateBody(taskUpdateSchema),
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const existing = await prisma.task.findFirst({
      where: { id: req.params.taskId, childId: req.params.childId },
      select: { id: true, quizQuestions: true, subjectId: true, type: true },
    })
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos esta tarea')
    }
    if ('subjectId' in req.body) {
      await assertSubjectAssigned(req.params.childId, req.body.subjectId)
    }
    if (
      existing.quizQuestions &&
      ((req.body.subjectId !== undefined && req.body.subjectId !== existing.subjectId) ||
        (req.body.type !== undefined && req.body.type !== existing.type))
    ) {
      throw new AppError(
        400,
        'QUIZ_CONFIGURATION_LOCKED',
        'No se puede cambiar la materia o el tipo de un cuestionario asignado. Elimínalo y crea uno nuevo.',
      )
    }
    const task = await prisma.task.update({
      where: { id: req.params.taskId },
      data: {
        ...req.body,
        ...(req.body.subjectId !== undefined ? { subjectId: req.body.subjectId || null } : {}),
        ...(req.body.dueAt !== undefined ? { dueAt: req.body.dueAt ? new Date(req.body.dueAt) : null } : {}),
        ...(req.body.description !== undefined ? { description: req.body.description || null } : {}),
      },
      include: { subject: true, attachments: { select: { id: true, originalName: true, mimeType: true } } },
    })
    const { quizQuestions, ...publicTask } = task
    res.json({ task: { ...publicTask, isQuiz: Boolean(quizQuestions) } })
  }),
)

familiesRouter.post(
  '/me/children/:childId/tasks/:taskId/review',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const task = await prisma.$transaction(async (tx) => {
      const currentTask = await tx.task.findFirst({
        where: { id: req.params.taskId, childId: req.params.childId },
        select: { status: true, reviewedAt: true },
      })
      if (!currentTask) {
        throw new AppError(404, 'NOT_FOUND', 'No encontramos esta tarea')
      }
      if (currentTask.reviewedAt) {
        throw new AppError(409, 'TASK_ALREADY_REVIEWED', 'Esta tarea ya fue revisada.')
      }
      if (currentTask.status !== 'completed') {
        throw new AppError(409, 'TASK_NOT_COMPLETED', 'El alumno debe completar la tarea antes de revisarla.')
      }
      const updated = await tx.task.updateMany({
        where: {
          id: req.params.taskId,
          childId: req.params.childId,
          reviewedAt: null,
          status: 'completed',
        },
        data: { reviewedAt: new Date() },
      })
      if (updated.count !== 1) {
        throw new AppError(409, 'TASK_ALREADY_REVIEWED', 'Esta tarea ya fue revisada.')
      }
      await tx.pointTransaction.create({
        data: {
          childId: req.params.childId,
          taskId: req.params.taskId,
          points: 5,
          reason: 'Tarea revisada por la familia',
          sourceType: 'reviewed_task',
          sourceId: req.params.taskId,
        },
      })
      return tx.task.findUniqueOrThrow({
        where: { id: req.params.taskId },
        select: { id: true, reviewedAt: true },
      })
    })
    res.json({ task, pointsAwarded: 5 })
  }),
)

familiesRouter.delete(
  '/me/children/:childId/tasks/:taskId',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const task = await prisma.task.findFirst({
      where: { id: req.params.taskId, childId: req.params.childId },
      include: { attachments: { select: { storageKey: true } } },
    })
    if (!task) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos esta tarea')
    }
    await prisma.task.delete({ where: { id: task.id } })
    await removeAttachments(task.attachments.map(({ storageKey }) => storageKey))
    res.status(204).send()
  }),
)

familiesRouter.post(
  '/me/children/:childId/tasks/:taskId/attachments',
  ...parentAccess,
  taskFileUpload,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const task = await prisma.task.findFirst({
      where: { id: req.params.taskId, childId: req.params.childId },
      select: { id: true },
    })
    if (!task) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos esta tarea')
    }
    const file = req.file
    if (!file) {
      throw new AppError(400, 'FILE_REQUIRED', 'Selecciona un archivo para adjuntar')
    }
    validateTaskFile(file)
    const storageKey = await savePrivateFile(file)
    try {
      const attachment = await prisma.taskAttachment.create({
        data: {
          taskId: task.id,
          originalName: safeOriginalName(file.originalname),
          mimeType: file.mimetype,
          storageKey,
        },
        select: { id: true, originalName: true, mimeType: true, createdAt: true },
      })
      res.status(201).json({ attachment })
    } catch (error) {
      await removePrivateFile(storageKey)
      throw error
    }
  }),
)

familiesRouter.get(
  '/me/children/:childId/tasks/:taskId/attachments/:attachmentId',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const attachment = await prisma.taskAttachment.findFirst({
      where: {
        id: req.params.attachmentId,
        taskId: req.params.taskId,
        task: { childId: req.params.childId },
      },
    })
    if (!attachment) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos el archivo')
    }
    const file = await readPrivateFile(attachment.storageKey)
    res.setHeader('Cache-Control', 'private, no-store')
    res.attachment(attachment.originalName).type(attachment.mimeType).send(file)
  }),
)

familiesRouter.delete(
  '/me/children/:childId/tasks/:taskId/attachments/:attachmentId',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const attachment = await prisma.taskAttachment.findFirst({
      where: {
        id: req.params.attachmentId,
        taskId: req.params.taskId,
        task: { childId: req.params.childId },
      },
    })
    if (!attachment) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos el archivo')
    }
    await prisma.taskAttachment.delete({ where: { id: attachment.id } })
    await removePrivateFile(attachment.storageKey)
    res.status(204).send()
  }),
)

familiesRouter.get(
  '/me/children/:childId/evaluations',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    await findChild(req.params.childId, req.user!.familyId)
    const evaluations = await prisma.evaluation.findMany({
      where: { childId: req.params.childId, practiceAttemptId: { not: null } },
      include: { subject: true },
      orderBy: { evaluatedAt: 'desc' },
    })
    res.json({ evaluations })
  }),
)

familiesRouter.get(
  '/me/notification-preferences',
  ...parentAccess,
  asyncHandler(async (req, res) => {
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: req.user!.id },
    })
    res.json({
      preference: preference ?? { emailSummary: false, reminderTime: null },
    })
  }),
)

familiesRouter.put(
  '/me/notification-preferences',
  ...parentAccess,
  validateBody(notificationPreferenceSchema),
  asyncHandler(async (req, res) => {
    const preference = await prisma.notificationPreference.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...req.body },
      update: req.body,
    })
    res.json({ preference })
  }),
)
