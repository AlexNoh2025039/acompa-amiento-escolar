import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { env } from '../../env'
import { AppError } from '../../lib/errors'
import { asyncHandler } from '../../lib/asyncHandler'
import { prisma } from '../../lib/prisma'
import { readPrivateFile } from '../families/uploads'
import { requireAuth, requireRole } from '../../middleware/requireAuth'
import { validateBody } from '../../middleware/validate'
import { getStudentChild } from './student.service'
import { getTaskReadingContent, parseTaskQuiz, practiceQuestionSchema } from './taskQuiz'
import { tutorRouter } from './tutor.routes'
import { createLearningArtifact, generateAcademicPractice } from '../../services/learningContentService'
import { practiceQuestions } from './practiceQuestions'

export const studentRouter = Router()
studentRouter.use(requireAuth, requireRole('student'))

const learningArtifactSchema = z.object({
  type: z.enum(['summary', 'practice', 'podcast', 'video']),
  attachmentId: z.string().min(1).optional(),
})

const taskStatusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed']),
})

const practiceAnswersSchema = z.object({
  token: z.string().min(1),
  answers: z.array(z.number().int().min(0).max(3)).min(1).max(5),
})

studentRouter.use('/tutor', tutorRouter)

studentRouter.get(
  '/ai/usage',
  asyncHandler(async (_req, res) => {
    res.json({ usage: { unlimited: true } })
  }),
)

studentRouter.get(
  '/learning-artifacts',
  asyncHandler(async (req, res) => {
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const artifacts = await prisma.learningArtifact.findMany({
      where: { userId: req.user!.id, childId: child.id },
      include: { subject: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    res.json({
      artifacts: artifacts.map(({ storageKey, content, ...artifact }) => ({
        ...artifact,
        content: artifact.type === 'practice' ? '' : content,
        fileUrl: storageKey ? `/api/student/learning-artifacts/${artifact.id}/file` : null,
      })),
    })
  }),
)

studentRouter.post(
  '/tasks/:taskId/learning-artifacts',
  validateBody(learningArtifactSchema),
  asyncHandler(async (req, res) => {
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const artifact = await createLearningArtifact({
      userId: req.user!.id,
      childId: child.id,
      grade: child.grade,
      taskId: req.params.taskId,
      attachmentId: req.body.attachmentId,
      type: req.body.type,
    })
    const { storageKey, content, ...publicArtifact } = artifact
    res.status(201).json({
      artifact: {
        ...publicArtifact,
        content: artifact.type === 'practice' ? '' : content,
        fileUrl: storageKey ? `/api/student/learning-artifacts/${artifact.id}/file` : null,
      },
    })
  }),
)

studentRouter.get(
  '/learning-artifacts/:artifactId/file',
  asyncHandler(async (req, res) => {
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const artifact = await prisma.learningArtifact.findFirst({
      where: {
        id: req.params.artifactId,
        userId: req.user!.id,
        childId: child.id,
        storageKey: { not: null },
      },
    })
    if (!artifact?.storageKey || !artifact.mimeType) {
      throw new AppError(404, 'ARTIFACT_NOT_FOUND', 'No encontramos el archivo generado.')
    }
    const file = await readPrivateFile(artifact.storageKey)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.type(artifact.mimeType).send(file)
  }),
)

studentRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const [family, tasks, points] = await Promise.all([
      prisma.family.findUnique({
        where: { id: req.user!.familyId },
        select: { id: true, name: true },
      }),
      prisma.task.findMany({
        where: { childId: child.id },
        include: {
          subject: true,
          attachments: { select: { id: true, originalName: true, mimeType: true } },
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.pointTransaction.aggregate({
        where: { childId: child.id },
        _sum: { points: true },
      }),
    ])
    res.json({
      student: {
        id: req.user!.id,
        fullName: child.fullName,
        email: req.user!.email,
        grade: child.grade,
        birthDate: child.birthDate,
        familyName: family?.name ?? '',
        points: points._sum.points ?? 0,
      },
      subjects: child.subjects.map(({ subject }) => subject),
      schedules: child.schedule,
      tasks: tasks.map(({ quizQuestions, ...task }) => ({
        ...task,
        isQuiz: Boolean(quizQuestions),
        readingContent: getTaskReadingContent(quizQuestions),
      })),
    })
  }),
)

studentRouter.post(
  '/tasks',
  asyncHandler(async () => {
    throw new AppError(403, 'PARENT_ASSIGNMENT_REQUIRED', 'Solo tu padre o encargado puede asignarte actividades.')
  }),
)

studentRouter.patch(
  '/tasks/:taskId',
  validateBody(taskStatusSchema),
  asyncHandler(async (req, res) => {
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const existing = await prisma.task.findFirst({
      where: { id: req.params.taskId, childId: child.id },
      select: {
        id: true,
        quizQuestions: true,
        practiceAttempts: {
          where: { completedAt: { not: null } },
          take: 1,
          select: { id: true },
        },
      },
    })
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos esta actividad')
    }
    if (
      req.body.status === 'completed' &&
      existing.quizQuestions &&
      existing.practiceAttempts.length === 0
    ) {
      throw new AppError(400, 'QUIZ_NOT_COMPLETED', 'Responde el cuestionario antes de marcarlo como completado.')
    }
    const updated = await prisma.task.updateMany({
      where: { id: req.params.taskId, childId: child.id },
      data: { status: req.body.status },
    })
    if (updated.count !== 1) {
      throw new AppError(404, 'NOT_FOUND', 'No encontramos esta actividad')
    }
    const task = await prisma.task.findUniqueOrThrow({
      where: { id: req.params.taskId },
      include: { subject: true, attachments: { select: { id: true, originalName: true, mimeType: true } } },
    })
    const { quizQuestions, ...publicTask } = task
    res.json({
      task: {
        ...publicTask,
        isQuiz: Boolean(quizQuestions),
        readingContent: getTaskReadingContent(quizQuestions),
      },
    })
  }),
)

studentRouter.get(
  '/tasks/:taskId/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const attachment = await prisma.taskAttachment.findFirst({
      where: {
        id: req.params.attachmentId,
        taskId: req.params.taskId,
        task: { childId: child.id },
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

studentRouter.post(
  '/practice/start',
  asyncHandler(async (req, res) => {
    const parsed = z.union([
      z.object({ subjectId: z.string().min(1) }).strict(),
      z.object({ artifactId: z.string().min(1) }).strict(),
      z.object({ taskId: z.string().min(1) }).strict(),
    ]).safeParse(req.body)
    if (!parsed.success) {
      throw parsed.error
    }
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    let subject: { id: string; name: string } | undefined
    let questions: z.infer<typeof practiceQuestionSchema>[]
    let taskId: string | undefined
    let reading: string | null = null
    let existingAttempt: { id: string; completedAt: Date | null; questions: unknown } | null = null
    if ('artifactId' in parsed.data) {
      const artifact = await prisma.learningArtifact.findFirst({
        where: {
          id: parsed.data.artifactId,
          userId: req.user!.id,
          childId: child.id,
          type: 'practice',
        },
        include: { subject: true },
      })
      if (!artifact) {
        throw new AppError(404, 'PRACTICE_NOT_FOUND', 'No encontramos esta práctica.')
      }
      let generated: unknown
      try {
        generated = JSON.parse(artifact.content)
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new AppError(422, 'INVALID_PRACTICE', 'Esta práctica no tiene un formato válido.')
        }
        throw error
      }
      const generatedQuestions = z.object({
        questions: z.array(practiceQuestionSchema.omit({ id: true })).length(5),
      }).parse(generated)
      subject = artifact.subject
      questions = generatedQuestions.questions.map((question, index) => ({
        ...question,
        id: `${artifact.id}-${index + 1}`,
      }))
    } else if ('taskId' in parsed.data) {
      const task = await prisma.task.findFirst({
        where: { id: parsed.data.taskId, childId: child.id },
        select: {
          id: true,
          title: true,
          description: true,
          subject: { select: { id: true, name: true } },
          quizQuestions: true,
          practiceAttempts: {
            where: { completedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, completedAt: true, questions: true },
          },
        },
      })
      if (!task?.subject) {
        throw new AppError(404, 'TASK_NOT_FOUND', 'No encontramos esta actividad con una materia asignada.')
      }
      if (!child.subjects.some(({ subjectId }) => subjectId === task.subject!.id)) {
        throw new AppError(403, 'SUBJECT_NOT_ASSIGNED', 'Esta actividad ya no pertenece a una materia asignada.')
      }
      subject = task.subject
      taskId = task.id
      existingAttempt = task.practiceAttempts[0] ?? null
      if (task.quizQuestions) {
        const taskQuiz = parseTaskQuiz(task.quizQuestions)
        reading = taskQuiz.reading
        questions = existingAttempt
          ? z.array(practiceQuestionSchema).parse(existingAttempt.questions)
          : taskQuiz.questions
      } else {
        questions = existingAttempt
          ? z.array(practiceQuestionSchema).parse(existingAttempt.questions)
          : await generateAcademicPractice({
              userId: req.user!.id,
              subject: task.subject.name,
              grade: child.grade,
              title: task.title,
              description: task.description,
            }).then((generated) => generated.map((question, index) => ({
              ...question,
              id: `${task.id}-generated-${index + 1}`,
            })))
      }
    } else {
      const subjectId = 'subjectId' in parsed.data ? parsed.data.subjectId : undefined
      if (!subjectId) {
        throw new AppError(400, 'INVALID_PRACTICE', 'Elige una materia para empezar.')
      }
      const assignedSubject = child.subjects.find(({ subjectId: assignedId }) => assignedId === subjectId)
      if (!assignedSubject) {
        throw new AppError(400, 'SUBJECT_NOT_ASSIGNED', 'Elige una materia de tu perfil')
      }
      subject = assignedSubject.subject
      questions = practiceQuestions(subject.name, child.grade) ?? await generateAcademicPractice({
        userId: req.user!.id,
        subject: subject.name,
        grade: child.grade,
      }).then((generated) => generated.map((question, index) => ({
        ...question,
        id: `generated-${index + 1}`,
      })))
    }
    const attempt = existingAttempt
      ? existingAttempt
      : await prisma.practiceAttempt.create({
          data: {
            childId: child.id,
            userId: req.user!.id,
            subjectId: subject.id,
            ...(taskId ? { taskId } : {}),
            total: questions.length,
            questions,
          },
          select: { id: true, completedAt: true },
        })
    const token = jwt.sign(
      { purpose: 'student-practice', attemptId: attempt.id },
      env.JWT_ACCESS_SECRET,
      { subject: req.user!.id, expiresIn: '30m' },
    )
    res.status(201).json({
      token,
      subject,
      ...(reading ? { reading } : {}),
      questions: questions.map(({ correctIndex: _answer, ...question }) => question),
    })
  }),
)

studentRouter.post(
  '/practice/submit',
  validateBody(practiceAnswersSchema),
  asyncHandler(async (req, res) => {
    let payload: string | jwt.JwtPayload
    try {
      payload = jwt.verify(req.body.token, env.JWT_ACCESS_SECRET)
    } catch {
      throw new AppError(400, 'INVALID_PRACTICE', 'Esta práctica venció o no es válida. Inicia otra.')
    }
    if (
      typeof payload === 'string' ||
      payload.purpose !== 'student-practice' ||
      payload.sub !== req.user!.id ||
      typeof payload.attemptId !== 'string'
    ) {
      throw new AppError(400, 'INVALID_PRACTICE', 'Esta práctica no pertenece a tu cuenta')
    }

    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const attempt = await prisma.practiceAttempt.findFirst({
      where: {
        id: payload.attemptId,
        userId: req.user!.id,
        childId: child.id,
        completedAt: null,
      },
    })
    if (!attempt) {
      throw new AppError(409, 'PRACTICE_ALREADY_SUBMITTED', 'Esta práctica ya se respondió o venció')
    }
    const questions = z.array(practiceQuestionSchema).parse(attempt.questions)
    if (req.body.answers.length !== questions.length) {
      throw new AppError(400, 'INVALID_ANSWERS', 'Responde todas las preguntas')
    }
    const score = questions.reduce(
      (correct, question, index) => correct + Number(req.body.answers[index] === question.correctIndex),
      0,
    )
    const completedAt = new Date()
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.practiceAttempt.updateMany({
        where: { id: attempt.id, userId: req.user!.id, completedAt: null },
        data: { score, completedAt },
      })
      if (updated.count !== 1) {
        throw new AppError(409, 'PRACTICE_ALREADY_SUBMITTED', 'Esta práctica ya se respondió')
      }
      const task = attempt.taskId
        ? await tx.task.findFirst({
            where: { id: attempt.taskId, childId: child.id },
            select: { id: true, title: true, quizQuestions: true },
          })
        : null
      const isAssignedQuiz = Boolean(task?.quizQuestions)
      const evaluation = await tx.evaluation.create({
        data: {
          childId: child.id,
          subjectId: attempt.subjectId,
          practiceAttemptId: attempt.id,
          title: isAssignedQuiz
            ? 'Cuestionario asignado'
            : task
              ? `Práctica: ${task.title}`
              : 'Práctica: repaso',
          score: Math.round((score / questions.length) * 10_000) / 100,
          maxScore: 100,
          evaluatedAt: completedAt,
        },
        include: { subject: true },
      })
      await tx.pointTransaction.create({
        data: {
          childId: child.id,
          points: 10,
          reason: isAssignedQuiz
            ? 'Cuestionario asignado completado'
            : task
              ? 'Práctica de actividad completada'
              : 'Práctica completada',
          sourceType: 'completed_practice',
          sourceId: attempt.id,
          practiceAttemptId: attempt.id,
          taskId: attempt.taskId,
        },
      })
      if (isAssignedQuiz && task) {
        await tx.task.update({
          where: { id: task.id },
          data: { status: 'completed' },
        })
      }
      return evaluation
    })
    res.json({
      result: {
        score,
        total: questions.length,
        percentage: Math.round((score / questions.length) * 100),
        evaluation: result,
        answers: questions.map((question, index) => ({
          questionId: question.id,
          correct: req.body.answers[index] === question.correctIndex,
          correctAnswer: question.options[question.correctIndex],
          explanation: question.explanation,
        })),
      },
      pointsAwarded: 10,
    })
  }),
)

studentRouter.get(
  '/results',
  asyncHandler(async (req, res) => {
    const child = await getStudentChild(req.user!.id, req.user!.familyId)
    const [evaluations, attempts] = await Promise.all([
      prisma.evaluation.findMany({
        where: { childId: child.id, practiceAttemptId: { not: null } },
        include: { subject: true },
        orderBy: { evaluatedAt: 'desc' },
      }),
      prisma.practiceAttempt.findMany({
        where: { childId: child.id, userId: req.user!.id, completedAt: { not: null } },
        include: { subject: true },
        orderBy: { completedAt: 'desc' },
        take: 20,
      }),
    ])
    res.json({ evaluations, attempts })
  }),
)
