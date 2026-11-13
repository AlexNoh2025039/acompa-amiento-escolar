import argon2 from 'argon2'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import { env } from '../src/env'
import { prisma } from '../src/lib/prisma'
import { recordAiUsage } from '../src/services/aiUsageService'
import { practiceQuestions } from '../src/modules/student/practiceQuestions'

const app = createApp()

function parent(email: string, fullName: string) {
  return {
    fullName,
    email,
    password: 'clave1234',
    confirmPassword: 'clave1234',
  }
}

function mockAcademicPractice(
  correctIndexes = [0, 0, 0, 0, 0],
  response?: { reading: string; questions: ReturnType<typeof mockQuestion>[] },
) {
  const originalGeminiKey = env.GEMINI_API_KEY
  const questions = response?.questions ?? correctIndexes.map((correctIndex, index) => mockQuestion(correctIndex, index))
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(
    new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(response ? { reading: response.reading, questions } : { questions }) }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  ))
  env.GEMINI_API_KEY = 'test-server-key'

  return {
    fetchMock,
    restore() {
      env.GEMINI_API_KEY = originalGeminiKey
      fetchMock.mockRestore()
    },
  }
}

function mockQuestion(correctIndex: number, index: number) {
  return {
    prompt: index === 0
      ? 'En la oración «Juan salió corriendo», ¿quién es el sujeto?'
      : `Pregunta ${index + 1} sobre sujeto y predicado`,
    options: ['Juan', 'Salió', 'Corriendo', 'La oración'],
    correctIndex,
    explanation: 'Juan es quien realiza la acción; por eso es el sujeto.',
  }
}

async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      practice_attempts,
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

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('student dashboard API', () => {
  it('adapts math, science and Spanish practice questions to the grade band', () => {
    for (const subject of ['Matemática', 'Ciencias', 'Español']) {
      expect(practiceQuestions(subject, '1° primaria')).not.toEqual(
        practiceQuestions(subject, '5° primaria'),
      )
    }
    expect(practiceQuestions('Matemática', '2° secundaria')).toBeNull()
  })

  it('uses generated academic content rather than generic study-skills questions for unknown subjects', () => {
    expect(practiceQuestions('Literatura', '2° secundaria')).toBeNull()
  })

  it('lets a parent create a linked student account and the student log in', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2015-03-15', grade: '5° primaria' })
      .expect(201)

    await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)

    const student = request.agent(app)
    await student
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'alumno1234' })
      .expect(200)
    const profile = await student.get('/api/student/me').expect(200)
    expect(profile.body.student).toMatchObject({
      fullName: 'Alex Ejemplo',
      email: 'alex@example.com',
      grade: '5° primaria',
    })
    expect(profile.body.student.familyName).toBe('Familia de Padre Ejemplo')
    await parentAgent
      .get('/api/families/me/children')
      .expect(200)
      .expect(({ body }) => expect(body.children[0].user.email).toBe('alex@example.com'))
  })

  it('scopes student APIs to a linked profile and assigned subjects', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2015-03-15', grade: '5° primaria' })
      .expect(201)
    await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const subject = await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/subjects`)
      .send({ name: 'Matemática' })
      .expect(201)
    const student = request.agent(app)
    await student
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'alumno1234' })
      .expect(200)
    await student.get('/api/families/me/children').expect(403)
    await student
      .post('/api/student/tasks')
      .send({ title: 'Tarea fuera de mi perfil', type: 'homework', subjectId: 'not-assigned' })
      .expect(403)
    await student
      .post('/api/student/tasks')
      .send({ title: 'Repasar las tablas', type: 'homework', subjectId: subject.body.subject.id })
      .expect(403)

    const fifthGradePractice = await student
      .post('/api/student/practice/start')
      .send({ subjectId: subject.body.subject.id })
      .expect(201)
    expect(fifthGradePractice.body.questions[0].prompt).toContain('1/2 + 1/4')

    const firstGradeChild = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Sam Ejemplo', birthDate: '2019-03-15', grade: '1° primaria' })
      .expect(201)
    await parentAgent
      .post(`/api/families/me/children/${firstGradeChild.body.child.id}/account`)
      .send({ email: 'sam@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const firstGradeSubject = await parentAgent
      .post(`/api/families/me/children/${firstGradeChild.body.child.id}/subjects`)
      .send({ name: 'Matemática' })
      .expect(201)
    const firstGradeStudent = request.agent(app)
    await firstGradeStudent
      .post('/api/auth/login')
      .send({ email: 'sam@example.com', password: 'alumno1234' })
      .expect(200)
    const firstGradePractice = await firstGradeStudent
      .post('/api/student/practice/start')
      .send({ subjectId: firstGradeSubject.body.subject.id })
      .expect(201)
    expect(firstGradePractice.body.questions[0].prompt).toContain('1 + 1')
  })

  it('grades a practice on the server, stores its result and prevents token reuse', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2015-03-15', grade: '5° primaria' })
      .expect(201)
    await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const subject = await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/subjects`)
      .send({ name: 'Matemática' })
      .expect(201)

    const student = request.agent(app)
    await student
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'alumno1234' })
      .expect(200)
    const practice = await student
      .post('/api/student/practice/start')
      .send({ subjectId: subject.body.subject.id })
      .expect(201)
    expect(practice.body.questions).toHaveLength(5)
    expect(practice.body.questions[0].correctIndex).toBeUndefined()

    const submitted = await student
      .post('/api/student/practice/submit')
      .send({ token: practice.body.token, answers: [2, 2, 1, 2, 2] })
      .expect(200)
    expect(submitted.body.result).toMatchObject({ score: 5, total: 5, percentage: 100 })

    await student
      .post('/api/student/practice/submit')
      .send({ token: practice.body.token, answers: [2, 2, 1, 2, 2] })
      .expect(409)
    const history = await student.get('/api/student/results').expect(200)
    expect(history.body.attempts).toHaveLength(1)
    expect(Number(history.body.evaluations[0].score)).toBe(100)
    expect(Number(history.body.evaluations[0].maxScore)).toBe(100)
  })

  it('lets a student retry a parent-assigned quiz and awards review points once', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2015-03-15', grade: '5° primaria' })
      .expect(201)
    const childId = child.body.child.id as string
    await parentAgent
      .post(`/api/families/me/children/${childId}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const subject = await parentAgent
      .post(`/api/families/me/children/${childId}/subjects`)
      .send({ name: 'Matemática' })
      .expect(201)
    const generation = mockAcademicPractice([0, 1, 2, 3, 1])
    const assigned = await parentAgent
      .post(`/api/families/me/children/${childId}/tasks`)
      .send({
        title: 'Cuestionario de fracciones',
        type: 'exam',
        subjectId: subject.body.subject.id,
        createQuiz: true,
      })
      .expect(201)
    generation.restore()
    const taskId = assigned.body.task.id as string
    expect(assigned.body.task.isQuiz).toBe(true)
    expect(assigned.body.task.quizQuestions).toBeUndefined()
    await parentAgent
      .patch(`/api/families/me/children/${childId}/tasks/${taskId}`)
      .send({ type: 'homework' })
      .expect(400)
    await parentAgent
      .post(`/api/families/me/children/${childId}/tasks/${taskId}/review`)
      .expect(409)

    const student = request.agent(app)
    await student
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'alumno1234' })
      .expect(200)
    const profile = await student.get('/api/student/me').expect(200)
    expect(profile.body.student.points).toBe(0)
    expect(profile.body.tasks[0].isQuiz).toBe(true)
    expect(profile.body.tasks[0].quizQuestions).toBeUndefined()
    await student
      .patch(`/api/student/tasks/${taskId}`)
      .send({ status: 'completed' })
      .expect(400)

    const quiz = await student
      .post('/api/student/practice/start')
      .send({ taskId })
      .expect(201)
    expect(quiz.body.questions).toHaveLength(5)
    expect(quiz.body.questions[0].correctIndex).toBeUndefined()
    const submission = await student
      .post('/api/student/practice/submit')
      .send({ token: quiz.body.token, answers: [0, 0, 1, 0, 0] })
      .expect(200)
    expect(submission.body.pointsAwarded).toBe(10)

    const retry = await student
      .post('/api/student/practice/start')
      .send({ taskId })
      .expect(201)
    expect(retry.body.token).not.toBe(quiz.body.token)
    const retrySubmission = await student
      .post('/api/student/practice/submit')
      .send({ token: retry.body.token, answers: [0, 1, 2, 3, 1] })
      .expect(200)
    expect(retrySubmission.body.result.percentage).toBe(100)
    expect(retrySubmission.body.pointsAwarded).toBe(10)

    const resultHistory = await student.get('/api/student/results').expect(200)
    expect(resultHistory.body.evaluations).toHaveLength(2)
    expect(Number(resultHistory.body.evaluations[0].score)).toBe(100)
    expect(Number(resultHistory.body.evaluations[0].maxScore)).toBe(100)
    expect((await student.get('/api/student/me').expect(200)).body.student.points).toBe(20)
    expect((await student.get('/api/student/me').expect(200)).body.tasks[0].status).toBe('completed')

    await parentAgent
      .post(`/api/families/me/children/${childId}/tasks/${taskId}/review`)
      .expect(200)
      .expect(({ body }) => expect(body.pointsAwarded).toBe(5))
    await parentAgent
      .post(`/api/families/me/children/${childId}/tasks/${taskId}/review`)
      .expect(409)
    const overview = await parentAgent.get('/api/families/me/overview').expect(200)
    expect(overview.body.children[0].points).toBe(25)
    expect(overview.body.children[0].averageScore).toBe(60)
  })

  it('creates an interactive quiz for any task type', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2015-03-15', grade: '5° primaria' })
      .expect(201)
    const subject = await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/subjects`)
      .send({ name: 'Matemática' })
      .expect(201)

    const generation = mockAcademicPractice()
    const assigned = await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/tasks`)
      .send({
        title: 'Fases de la Luna',
        type: 'homework',
        subjectId: subject.body.subject.id,
        createQuiz: true,
      })
      .expect(201)
    generation.restore()

    expect(assigned.body.task.isQuiz).toBe(true)
    expect(assigned.body.task.quizQuestions).toBeUndefined()

    await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const student = request.agent(app)
    await student
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'alumno1234' })
      .expect(200)
    const quiz = await student
      .post('/api/student/practice/start')
      .send({ taskId: assigned.body.task.id })
      .expect(201)

    expect(quiz.body.questions).toHaveLength(5)
    expect(quiz.body.questions).toHaveLength(5)
  })

  it('generates grade-appropriate subject-specific questions for assignments and free practice', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2019-03-15', grade: '1° primaria' })
      .expect(201)
    const childId = child.body.child.id as string
    await parentAgent
      .post(`/api/families/me/children/${childId}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const studentUser = await prisma.user.findUniqueOrThrow({ where: { email: 'alex@example.com' } })
    await prisma.aiUsage.createMany({
      data: [
        ...Array.from({ length: 5 }, () => ({ userId: studentUser.id, purpose: 'tutor' as const })),
        ...Array.from({ length: 3 }, () => ({ userId: studentUser.id, purpose: 'practice' as const })),
      ],
    })
    const subject = await parentAgent
      .post(`/api/families/me/children/${childId}/subjects`)
      .send({ name: 'Literatura' })
      .expect(201)
    const generation = mockAcademicPractice()
    const { fetchMock } = generation

    try {
      const assigned = await parentAgent
        .post(`/api/families/me/children/${childId}/tasks`)
        .send({
          title: 'Sujeto y predicado',
          description: 'Identifica el sujeto en oraciones como Juan salió corriendo.',
          type: 'homework',
          subjectId: subject.body.subject.id,
          createQuiz: true,
        })
        .expect(201)
      const generationRequest = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
      expect(generationRequest.contents[0].parts[0].text).toContain('Materia: Literatura')
      expect(generationRequest.contents[0].parts[0].text).toContain('Sujeto y predicado')
      expect(generationRequest.systemInstruction.parts[0].text).toContain('preguntas meta')
      expect(generationRequest.systemInstruction.parts[0].text).toContain('primeros grados de primaria')
      expect(generationRequest.systemInstruction.parts[0].text).toContain('TODAS las materias')
      expect(generationRequest.systemInstruction.parts[0].text).toContain('historia, geografía, ciencias, tecnología, arte')
      expect(generationRequest.systemInstruction.parts[0].text).toContain('No uses álgebra, variables, ecuaciones, definiciones abstractas ni fórmulas avanzadas de ninguna materia')

      const student = request.agent(app)
      await student
        .post('/api/auth/login')
        .send({ email: 'alex@example.com', password: 'alumno1234' })
        .expect(200)
      expect((await student.get('/api/student/ai/usage').expect(200)).body.usage).toMatchObject({
        unlimited: true,
      })
      const assignedQuiz = await student
        .post('/api/student/practice/start')
        .send({ taskId: assigned.body.task.id })
        .expect(201)
      expect(assignedQuiz.body.questions[0].prompt).toContain('¿quién es el sujeto?')

      const freePractice = await student
        .post('/api/student/practice/start')
        .send({ subjectId: subject.body.subject.id })
        .expect(201)
      expect(freePractice.body.questions[0].prompt).toContain('¿quién es el sujeto?')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(await prisma.aiUsage.count({ where: { userId: studentUser.id } })).toBe(8)
      expect((await student.get('/api/student/ai/usage').expect(200)).body.usage).toMatchObject({
        unlimited: true,
      })
    } finally {
      generation.restore()
    }
  })

  it('creates a short reading and reading-comprehension quiz when a reading task is assigned', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2019-03-15', grade: '1° primaria' })
      .expect(201)
    const childId = child.body.child.id as string
    await parentAgent
      .post(`/api/families/me/children/${childId}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const studentUser = await prisma.user.findUniqueOrThrow({ where: { email: 'alex@example.com' } })
    await prisma.aiUsage.createMany({
      data: [
        ...Array.from({ length: 5 }, () => ({ userId: studentUser.id, purpose: 'tutor' as const })),
        ...Array.from({ length: 3 }, () => ({ userId: studentUser.id, purpose: 'practice' as const })),
      ],
    })
    const subject = await parentAgent
      .post(`/api/families/me/children/${childId}/subjects`)
      .send({ name: 'Ciencias Naturales' })
      .expect(201)
    const reading = 'La mariposa visita las flores del jardín. Al tocar una flor, recoge un poco de polen. Luego vuela a otra flor y deja allí parte del polen. Así ayuda a las plantas a formar semillas. La mariposa también busca néctar, que es un alimento dulce. En el jardín viven muchos seres vivos que se ayudan entre sí.'
    const questions = Array.from({ length: 5 }, (_, index) => ({
      prompt: index === 0 ? 'Según la lectura, ¿qué recoge la mariposa al tocar una flor?' : `Pregunta ${index + 1} sobre la lectura`,
      options: ['Polen', 'Agua', 'Arena', 'Hojas'],
      correctIndex: 0,
      explanation: 'La lectura dice que recoge polen al tocar una flor.',
    }))
    const generation = mockAcademicPractice([0, 0, 0, 0, 0], { reading, questions })
    const { fetchMock } = generation

    try {
      const task = await parentAgent
        .post(`/api/families/me/children/${childId}/tasks`)
        .send({
          title: 'La mariposa y las flores',
          type: 'reading',
          subjectId: subject.body.subject.id,
        })
        .expect(201)
      expect(await prisma.aiUsage.count({ where: { userId: studentUser.id } })).toBe(8)
      expect(task.body.task.isQuiz).toBe(true)
      expect(task.body.task.readingContent).toBe(reading)

      const generationRequest = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
      expect(generationRequest.systemInstruction.parts[0].text).toContain('preguntas de comprensión basadas exclusivamente')
      expect(generationRequest.systemInstruction.parts[0].text).toContain('80 a 130 palabras')

      const student = request.agent(app)
      await student
        .post('/api/auth/login')
        .send({ email: 'alex@example.com', password: 'alumno1234' })
        .expect(200)
      const profile = await student.get('/api/student/me').expect(200)
      expect(profile.body.tasks[0].readingContent).toBe(reading)
      const practice = await student
        .post('/api/student/practice/start')
        .send({ taskId: task.body.task.id })
        .expect(201)
      expect(practice.body.reading).toBe(reading)
      expect(practice.body.questions[0].prompt).toContain('¿qué recoge la mariposa')
    } finally {
      generation.restore()
    }
  })

  it('rejects duplicate student logins and refuses student API access without a linked child', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2015-03-15', grade: '5° primaria' })
      .expect(201)
    const account = {
      email: 'alex@example.com',
      password: 'alumno1234',
      confirmPassword: 'alumno1234',
    }
    await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/account`)
      .send(account)
      .expect(201)
    await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/account`)
      .send({ ...account, email: 'otro@example.com' })
      .expect(409)

    const orphan = await prisma.user.create({
      data: {
        familyId: child.body.child.familyId,
        fullName: 'Perfil sin hijo',
        email: 'orphan@example.com',
        passwordHash: await argon2.hash('orphan1234', { type: argon2.argon2id }),
        role: 'student',
      },
    })
    const orphanAgent = request.agent(app)
    await orphanAgent
      .post('/api/auth/login')
      .send({ email: orphan.email, password: 'orphan1234' })
      .expect(200)
    await orphanAgent.get('/api/student/me').expect(403)
  })

  it('allows students to use AI without a daily quota', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2015-03-15', grade: '5° primaria' })
      .expect(201)
    await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const studentUser = await prisma.user.findUniqueOrThrow({ where: { email: 'alex@example.com' } })
    const student = request.agent(app)
    await student
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'alumno1234' })
      .expect(200)
    expect((await student.get('/api/student/ai/usage').expect(200)).body.usage).toMatchObject({
      unlimited: true,
    })

    await prisma.aiUsage.createMany({
      data: Array.from({ length: 5 }, () => ({ userId: studentUser.id, purpose: 'summary' as const })),
    })
    const records = await Promise.all(
      Array.from({ length: 8 }, () => recordAiUsage(studentUser.id, 'summary')),
    )
    expect(records).toHaveLength(8)
    expect(await prisma.aiUsage.count({ where: { userId: studentUser.id } })).toBe(13)
    expect((await student.get('/api/student/ai/usage').expect(200)).body.usage).toMatchObject({
      unlimited: true,
    })
  })

  it('keeps generated practice answers private until submitted and grades them server-side', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2015-03-15', grade: '5° primaria' })
      .expect(201)
    await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const assigned = await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/subjects`)
      .send({ name: 'Ciencias' })
      .expect(201)
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'alex@example.com' } })
    const questions = Array.from({ length: 5 }, (_, index) => ({
      prompt: `Pregunta ${index + 1}`,
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 2,
      explanation: 'La opción C es correcta.',
    }))
    const artifact = await prisma.learningArtifact.create({
      data: {
        userId: user.id,
        childId: child.body.child.id,
        subjectId: assigned.body.subject.id,
        type: 'practice',
        title: 'Práctica generada',
        content: JSON.stringify({ questions }),
      },
    })
    const student = request.agent(app)
    await student
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'alumno1234' })
      .expect(200)
    const materials = await student.get('/api/student/learning-artifacts').expect(200)
    expect(materials.body.artifacts[0].content).toBe('')
    expect(materials.body.artifacts[0].storageKey).toBeUndefined()

    const practice = await student
      .post('/api/student/practice/start')
      .send({ artifactId: artifact.id })
      .expect(201)
    expect(practice.body.questions).toHaveLength(5)
    expect(practice.body.questions[0].correctIndex).toBeUndefined()
    const result = await student
      .post('/api/student/practice/submit')
      .send({ token: practice.body.token, answers: [2, 2, 2, 2, 2] })
      .expect(200)
    expect(result.body.result).toMatchObject({ score: 5, total: 5, percentage: 100 })
    expect(result.body.result.answers[0].explanation).toBe('La opción C es correcta.')
  })

  it('creates a practice from an assigned task title even when it has no notes or attachment', async () => {
    const parentAgent = request.agent(app)
    await parentAgent
      .post('/api/auth/register')
      .send(parent('parent@example.com', 'Padre Ejemplo'))
      .expect(201)
    const child = await parentAgent
      .post('/api/families/me/children')
      .send({ fullName: 'Alex Ejemplo', birthDate: '2015-03-15', grade: '5° primaria' })
      .expect(201)
    await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/account`)
      .send({ email: 'alex@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const subject = await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/subjects`)
      .send({ name: 'Matemática' })
      .expect(201)
    const task = await parentAgent
      .post(`/api/families/me/children/${child.body.child.id}/tasks`)
      .send({ title: 'Fracciones equivalentes', type: 'homework', subjectId: subject.body.subject.id })
      .expect(201)

    const student = request.agent(app)
    await student
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'alumno1234' })
      .expect(200)

    const originalGeminiKey = env.GEMINI_API_KEY
    const questions = Array.from({ length: 5 }, (_, index) => ({
      prompt: `Pregunta ${index + 1} sobre fracciones equivalentes`,
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 1,
      explanation: 'Compara las fracciones.',
    }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ questions }) }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    env.GEMINI_API_KEY = 'test-server-key'

    try {
      const generated = await student
        .post(`/api/student/tasks/${task.body.task.id}/learning-artifacts`)
        .send({ type: 'practice' })
        .expect(201)
      expect(generated.body.artifact.title).toBe('Práctica: Matemática')
      expect(fetchMock).toHaveBeenCalledOnce()
      const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
      expect(JSON.stringify(requestBody.contents)).toContain('Fracciones equivalentes')

      const taskPractice = await student
        .post('/api/student/practice/start')
        .send({ taskId: task.body.task.id })
        .expect(201)
      expect(taskPractice.body.questions[0].prompt).toContain('fracciones equivalentes')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const taskPracticeRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
      expect(JSON.stringify(taskPracticeRequest.contents)).toContain('Fracciones equivalentes')
      const taskPracticeResult = await student
        .post('/api/student/practice/submit')
        .send({ token: taskPractice.body.token, answers: [1, 1, 1, 1, 1] })
        .expect(200)
      expect(taskPracticeResult.body.result.evaluation.title).toBe('Práctica: Fracciones equivalentes')
      expect((await prisma.task.findUniqueOrThrow({
        where: { id: task.body.task.id },
        select: { status: true },
      })).status).toBe('pending')

      const practice = await student
        .post('/api/student/practice/start')
        .send({ artifactId: generated.body.artifact.id })
        .expect(201)
      expect(practice.body.questions).toHaveLength(5)
      expect(practice.body.questions[0].prompt).toContain('fracciones equivalentes')
      expect(practice.body.questions[0].correctIndex).toBeUndefined()
    } finally {
      env.GEMINI_API_KEY = originalGeminiKey
      fetchMock.mockRestore()
    }
  })
})
