import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'

const app = createApp()

function parent(email: string, fullName: string) {
  return {
    fullName,
    email,
    password: 'clave1234',
    confirmPassword: 'clave1234',
  }
}

async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      task_attachments,
      tasks,
      evaluations,
      schedule_blocks,
      child_subjects,
      notification_preferences,
      refresh_tokens,
      children,
      users,
      families,
      subjects
    RESTART IDENTITY CASCADE
  `)
}

async function register(agent: ReturnType<typeof request.agent>, email: string, name: string) {
  await agent.post('/api/auth/register').send(parent(email, name)).expect(201)
}

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('parent family management', () => {
  it('lets a parent view their child study materials without exposing practice answers', async () => {
    const ana = request.agent(app)
    const luis = request.agent(app)
    await register(ana, 'ana@example.com', 'Ana Pérez')
    await register(luis, 'luis@example.com', 'Luis Gómez')
    const child = await ana
      .post('/api/families/me/children')
      .send({ fullName: 'Sofía Pérez', birthDate: '2016-05-12', grade: '4° primaria' })
      .expect(201)
    const childId = child.body.child.id as string
    await ana
      .post(`/api/families/me/children/${childId}/account`)
      .send({ email: 'sofia@example.com', password: 'alumna1234', confirmPassword: 'alumna1234' })
      .expect(201)
    const subject = await ana
      .post(`/api/families/me/children/${childId}/subjects`)
      .send({ name: 'Matemática' })
      .expect(201)
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'sofia@example.com' } })
    await prisma.learningArtifact.create({
      data: {
        userId: user.id,
        childId,
        subjectId: subject.body.subject.id,
        type: 'summary',
        title: 'Repaso de fracciones',
        content: 'Una fracción representa partes iguales de un todo.',
      },
    })
    await prisma.learningArtifact.create({
      data: {
        userId: user.id,
        childId,
        subjectId: subject.body.subject.id,
        type: 'practice',
        title: 'Práctica de fracciones',
        content: JSON.stringify({ questions: [{ correctIndex: 2 }] }),
      },
    })

    const materials = await ana
      .get(`/api/families/me/children/${childId}/learning-artifacts`)
      .expect(200)
    expect(materials.body.artifacts).toHaveLength(2)
    expect(materials.body.artifacts.find((artifact: { type: string }) => artifact.type === 'summary').content)
      .toContain('Una fracción')
    expect(materials.body.artifacts.find((artifact: { type: string }) => artifact.type === 'practice').content)
      .toBe('')
    await luis
      .get(`/api/families/me/children/${childId}/learning-artifacts`)
      .expect(404)
  })

  it('updates the family name and prevents access to another family child', async () => {
    const ana = request.agent(app)
    const luis = request.agent(app)
    await register(ana, 'ana@example.com', 'Ana Pérez')
    await register(luis, 'luis@example.com', 'Luis Gómez')

    await ana
      .put('/api/families/me')
      .send({ name: 'Familia Pérez' })
      .expect(200)
      .expect(({ body }) => expect(body.family.name).toBe('Familia Pérez'))

    const childResponse = await ana
      .post('/api/families/me/children')
      .send({ fullName: 'Sofía Pérez', birthDate: '2016-05-12', grade: '4° primaria' })
      .expect(201)
    const childId = childResponse.body.child.id

    const anaOverview = await ana.get('/api/families/me/overview').expect(200)
    const luisOverview = await luis.get('/api/families/me/overview').expect(200)
    expect(anaOverview.body.family.name).toBe('Familia Pérez')
    expect(anaOverview.body.children.map((child: { id: string }) => child.id)).toEqual([childId])
    expect(luisOverview.body.children).toEqual([])

    await luis
      .patch(`/api/families/me/children/${childId}`)
      .send({ grade: '5° primaria' })
      .expect(404)

    await ana
      .patch(`/api/families/me/children/${childId}`)
      .send({ grade: '5° primaria' })
      .expect(200)
    const promotedOverview = await ana.get('/api/families/me/overview').expect(200)
    expect(promotedOverview.body.children[0].gradeHistory).toHaveLength(1)
    expect(promotedOverview.body.children[0].gradeHistory[0]).toMatchObject({
      fromGrade: '4° primaria',
      toGrade: '5° primaria',
    })
  })

  it('validates child details and schedule times', async () => {
    const ana = request.agent(app)
    await register(ana, 'ana@example.com', 'Ana Pérez')

    await ana
      .post('/api/families/me/children')
      .send({ fullName: 'Sofía Pérez', birthDate: '2030-01-01', grade: '4° primaria' })
      .expect(400)

    const child = await ana
      .post('/api/families/me/children')
      .send({ fullName: 'Sofía Pérez', birthDate: '2016-05-12', grade: '4° primaria' })
      .expect(201)

    await ana
      .post(`/api/families/me/children/${child.body.child.id}/schedules`)
      .send({ dayOfWeek: 'monday', startTime: '11:00', endTime: '10:00' })
      .expect(400)
  })

  it('assigns subjects, manages schedules and reports task and evaluation summaries', async () => {
    const ana = request.agent(app)
    await register(ana, 'ana@example.com', 'Ana Pérez')
    const childResponse = await ana
      .post('/api/families/me/children')
      .send({ fullName: 'Sofía Pérez', birthDate: '2016-05-12', grade: '4° primaria' })
      .expect(201)
    const childId = childResponse.body.child.id

    const unassignedSubject = await prisma.subject.create({ data: { name: 'Ciencias' } })
    await ana
      .post(`/api/families/me/children/${childId}/tasks`)
      .send({
        title: 'Lectura',
        type: 'reading',
        subjectId: unassignedSubject.id,
      })
      .expect(400)

    const assignedSubject = await ana
      .post(`/api/families/me/children/${childId}/subjects`)
      .send({ name: 'Matemática' })
      .expect(201)
    const subjectId = assignedSubject.body.subject.id

    const schedule = await ana
      .post(`/api/families/me/children/${childId}/schedules`)
      .send({
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '10:00',
        subjectId,
      })
      .expect(201)
    await ana
      .patch(`/api/families/me/children/${childId}/schedules/${schedule.body.schedule.id}`)
      .send({
        dayOfWeek: 'tuesday',
        startTime: '10:00',
        endTime: '11:00',
        subjectId,
      })
      .expect(200)

    const task = await ana
      .post(`/api/families/me/children/${childId}/tasks`)
      .send({
        title: 'Práctica de fracciones',
        type: 'homework',
        subjectId,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201)
    await ana
      .patch(`/api/families/me/children/${childId}/tasks/${task.body.task.id}`)
      .send({ title: 'Fracciones: ejercicios 1-5' })
      .expect(200)
    await ana
      .patch(`/api/families/me/children/${childId}/tasks/${task.body.task.id}`)
      .send({ status: 'completed' })
      .expect(200)

    await ana
      .post(`/api/families/me/children/${childId}/evaluations`)
      .send({
        subjectId,
        title: 'Prueba inventada',
        score: 8,
        maxScore: 10,
        evaluatedAt: new Date().toISOString(),
      })
      .expect(404)
    await prisma.evaluation.create({
      data: {
        childId,
        subjectId,
        title: 'Resultado antiguo no verificado',
        score: 8,
        maxScore: 10,
        evaluatedAt: new Date(),
      },
    })

    const overview = await ana.get('/api/families/me/overview').expect(200)
    expect(overview.body.children[0]).toMatchObject({
      tasks: { pending: 0, inProgress: 0, completed: 1 },
      averageScore: null,
      evaluationCount: 0,
      points: 0,
      subjectAverages: [],
    })
    expect((await ana.get(`/api/families/me/children/${childId}/evaluations`).expect(200)).body.evaluations).toHaveLength(0)
  })

  it('stores, serves and isolates private task attachments', async () => {
    const ana = request.agent(app)
    const luis = request.agent(app)
    await register(ana, 'ana@example.com', 'Ana Pérez')
    await register(luis, 'luis@example.com', 'Luis Gómez')

    const child = await ana
      .post('/api/families/me/children')
      .send({ fullName: 'Sofía Pérez', birthDate: '2016-05-12', grade: '4° primaria' })
      .expect(201)
    const task = await ana
      .post(`/api/families/me/children/${child.body.child.id}/tasks`)
      .send({ title: 'Adjuntar guía', type: 'homework' })
      .expect(201)

    await ana
      .post(`/api/families/me/children/${child.body.child.id}/tasks/${task.body.task.id}/attachments`)
      .attach('file', Buffer.from('not a pdf'), {
        filename: 'invalid.pdf',
        contentType: 'application/pdf',
      })
      .expect(400)

    const upload = await ana
      .post(`/api/families/me/children/${child.body.child.id}/tasks/${task.body.task.id}/attachments`)
      .attach('file', Buffer.from('%PDF-1.4\ncontenido de prueba'), {
        filename: 'guía.pdf',
        contentType: 'application/pdf',
      })
      .expect(201)

    const filePath = `/api/families/me/children/${child.body.child.id}/tasks/${task.body.task.id}/attachments/${upload.body.attachment.id}`
    await ana.get(filePath).expect(200).expect('Content-Type', /application\/pdf/)
    await luis.get(filePath).expect(404)
    await ana.delete(filePath).expect(204)
    await ana.get(filePath).expect(404)
  })

  it('saves notification preferences per parent', async () => {
    const ana = request.agent(app)
    await register(ana, 'ana@example.com', 'Ana Pérez')

    const saved = await ana
      .put('/api/families/me/notification-preferences')
      .send({ emailSummary: true, reminderTime: '18:30' })
      .expect(200)

    expect(saved.body.preference).toMatchObject({ emailSummary: true, reminderTime: '18:30' })
    await ana
      .get('/api/families/me/notification-preferences')
      .expect(200)
      .expect(({ body }) => expect(body.preference.emailSummary).toBe(true))
  })

  it('deletes the family data and queues its private files for removal', async () => {
    const ana = request.agent(app)
    const registered = await ana
      .post('/api/auth/register')
      .send(parent('ana@example.com', 'Ana Pérez'))
      .expect(201)
    const child = await ana
      .post('/api/families/me/children')
      .send({ fullName: 'Sofía Pérez', birthDate: '2016-05-12', grade: '4° primaria' })
      .expect(201)
    const task = await ana
      .post(`/api/families/me/children/${child.body.child.id}/tasks`)
      .send({ title: 'Guía', type: 'homework' })
      .expect(201)
    await prisma.taskAttachment.create({
      data: {
        taskId: task.body.task.id,
        originalName: 'guia.pdf',
        mimeType: 'application/pdf',
        storageKey: '9dcde55b-a21e-4e98-8274-79c62490271a.pdf',
      },
    })

    await ana.delete('/api/families/me').expect(204)
    await ana.get('/api/auth/me').expect(401)
    expect(await prisma.family.count({ where: { id: registered.body.user.familyId } })).toBe(0)
    expect(await prisma.user.count({ where: { familyId: registered.body.user.familyId } })).toBe(0)
    expect(await prisma.child.count({ where: { familyId: registered.body.user.familyId } })).toBe(0)
    expect(await prisma.storageDeletion.count()).toBe(0)
  })
})
