import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../src/env'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { readPrivateFile } from '../src/modules/families/uploads'

const app = createApp()
const originalGeminiKey = env.GEMINI_API_KEY

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
      tutor_messages,
      tutor_conversations,
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
  env.GEMINI_API_KEY = undefined
})

afterEach(() => {
  env.GEMINI_API_KEY = originalGeminiKey
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('student tutor API', () => {
  it('lets the student attach a private image to the tutor and reuses it as chat context', async () => {
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
    const conversation = await student
      .post('/api/student/tutor/conversations')
      .send({ subjectId: subject.body.subject.id })
      .expect(201)

    env.GEMINI_API_KEY = 'test-server-key'
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () => new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Veo una suma. ¿Qué operación intentaste?' }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    const sent = await student
      .post(`/api/student/tutor/conversations/${conversation.body.conversation.id}/messages`)
      .field('content', '¿Me ayudas con este ejercicio?')
      .attach('file', image, { filename: 'ejercicio.png', contentType: 'image/png' })
      .expect(201)
    expect(sent.body.studentMessage.attachment).toMatchObject({
      name: 'ejercicio.png',
      mimeType: 'image/png',
    })
    expect(sent.body.studentMessage.attachmentStorageKey).toBeUndefined()
    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(firstRequest.contents[0].parts).toContainEqual({
      inlineData: { mimeType: 'image/png', data: image.toString('base64') },
    })

    const messageFile = await student
      .get(sent.body.studentMessage.attachment.url)
      .expect(200)
    expect(messageFile.headers['content-type']).toContain('image/png')
    expect(messageFile.body).toEqual(image)
    await parentAgent.get(sent.body.studentMessage.attachment.url).expect(403)

    const stored = await student
      .get(`/api/student/tutor/conversations/${conversation.body.conversation.id}`)
      .expect(200)
    expect(stored.body.conversation.messages[0].attachment.name).toBe('ejercicio.png')

    await student
      .post(`/api/student/tutor/conversations/${conversation.body.conversation.id}/messages`)
      .send({ content: '¿Y ahora qué hago?' })
      .expect(201)
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(secondRequest.contents[0].parts).toContainEqual({
      inlineData: { mimeType: 'image/png', data: image.toString('base64') },
    })

    await student
      .delete(`/api/student/tutor/conversations/${conversation.body.conversation.id}`)
      .expect(204)
    await student.get(sent.body.studentMessage.attachment.url).expect(404)

    const secondConversation = await student
      .post('/api/student/tutor/conversations')
      .send({ subjectId: subject.body.subject.id })
      .expect(201)
    const pdf = Buffer.from('%PDF-1.4\ncontenido escolar de prueba')
    const secondAttachment = await student
      .post(`/api/student/tutor/conversations/${secondConversation.body.conversation.id}/messages`)
      .field('content', '¿Qué aparece aquí?')
      .attach('file', pdf, { filename: 'ejercicio.pdf', contentType: 'application/pdf' })
      .expect(201)
    expect(secondAttachment.body.studentMessage.attachment.mimeType).toBe('application/pdf')
    const pdfRequest = JSON.parse(String(fetchMock.mock.calls[2][1]?.body))
    expect(pdfRequest.contents[0].parts).toContainEqual({
      inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') },
    })
    const servedPdf = await student.get(secondAttachment.body.studentMessage.attachment.url).expect(200)
    expect(servedPdf.headers['content-type']).toContain('application/pdf')
    expect(servedPdf.body).toEqual(pdf)
    const storedAttachment = await prisma.tutorMessage.findFirstOrThrow({
      where: { conversationId: secondConversation.body.conversation.id, role: 'student' },
      select: { attachmentStorageKey: true },
    })
    if (!storedAttachment.attachmentStorageKey) throw new Error('Expected the uploaded file to be stored')
    await parentAgent
      .delete(`/api/families/me/children/${child.body.child.id}`)
      .expect(204)
    await expect(readPrivateFile(storedAttachment.attachmentStorageKey)).rejects.toMatchObject({ status: 404 })
    await student.get(secondAttachment.body.studentMessage.attachment.url).expect(401)
  })

  it('stores private student conversations, applies retention and uses Gemini only on the server', async () => {
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

    await request(app).get('/api/student/tutor/conversations').expect(401)
    await parentAgent.get('/api/student/tutor/conversations').expect(403)

    const student = request.agent(app)
    await student
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'alumno1234' })
      .expect(200)
    const created = await student
      .post('/api/student/tutor/conversations')
      .send({ subjectId: subject.body.subject.id })
      .expect(201)
    expect(new Date(created.body.conversation.expiresAt).getTime()).toBeGreaterThan(Date.now())

    await student
      .post(`/api/student/tutor/conversations/${created.body.conversation.id}/messages`)
      .send({ content: 'No entiendo cómo empezar 7 × 8' })
      .expect(503)
    expect(await prisma.tutorMessage.count()).toBe(0)

    env.GEMINI_API_KEY = 'test-server-key'
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '¿Qué has intentado hasta ahora?' }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const messageResult = await student
      .post(`/api/student/tutor/conversations/${created.body.conversation.id}/messages`)
      .send({ content: 'No entiendo cómo empezar 7 × 8' })
      .expect(201)
    expect(messageResult.body.assistantMessage.content).toBe('¿Qué has intentado hasta ahora?')

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({
        candidates: [{
          finishReason: 'MAX_TOKENS',
          content: { parts: [{ text: 'La explicación se quedó a la mitad' }] },
        }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const truncatedResponse = await student
      .post(`/api/student/tutor/conversations/${created.body.conversation.id}/messages`)
      .send({ content: 'Explícame el tema paso a paso con detalle' })
      .expect(502)
    expect(truncatedResponse.body.error).toMatchObject({
      code: 'AI_RESPONSE_TRUNCATED',
      message: 'La respuesta quedó incompleta. Inténtalo de nuevo pidiendo la explicación por partes.',
    })
    expect(await prisma.tutorMessage.count()).toBe(2)

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }))
    const providerError = await student
      .post(`/api/student/tutor/conversations/${created.body.conversation.id}/messages`)
      .send({ content: 'Otra pregunta escolar' })
      .expect(503)
    expect(providerError.body.error).toMatchObject({
      code: 'AI_CREDENTIALS_INVALID',
      message: 'Gemini rechazó la clave configurada. Revísala en el servidor.',
    })
    expect(await prisma.tutorMessage.count()).toBe(2)

    const [, options] = fetchMock.mock.calls[0]
    expect(new Headers(options?.headers).get('x-goog-api-key')).toBe('test-server-key')
    const geminiRequest = JSON.parse(String(options?.body))
    expect(geminiRequest.generationConfig.maxOutputTokens).toBe(2000)
    expect(geminiRequest.systemInstruction.parts[0].text).toContain('Materia: Matemática')
    expect(geminiRequest.systemInstruction.parts[0].text).toContain('Grado: 5° primaria')
    expect(geminiRequest.contents.at(-1)).toMatchObject({
      role: 'user',
      parts: [{ text: 'Alumno: No entiendo cómo empezar 7 × 8' }],
    })

    const history = await student
      .get(`/api/student/tutor/conversations/${created.body.conversation.id}`)
      .expect(200)
    expect(history.body.conversation.messages.map((message: { role: string }) => message.role))
      .toEqual(['student', 'assistant'])
    const list = await student.get('/api/student/tutor/conversations').expect(200)
    expect(list.body.conversations[0]).toMatchObject({
      title: 'No entiendo cómo empezar 7 × 8',
      _count: { messages: 2 },
    })

    await parentAgent
      .get(`/api/student/tutor/conversations/${created.body.conversation.id}`)
      .expect(403)
    const secondParent = request.agent(app)
    await secondParent
      .post('/api/auth/register')
      .send(parent('other-parent@example.com', 'Otro Padre'))
      .expect(201)
    const otherChild = await secondParent
      .post('/api/families/me/children')
      .send({ fullName: 'Sam Ejemplo', birthDate: '2014-06-12', grade: '6° primaria' })
      .expect(201)
    await secondParent
      .post(`/api/families/me/children/${otherChild.body.child.id}/account`)
      .send({ email: 'sam@example.com', password: 'alumno1234', confirmPassword: 'alumno1234' })
      .expect(201)
    const otherStudent = request.agent(app)
    await otherStudent
      .post('/api/auth/login')
      .send({ email: 'sam@example.com', password: 'alumno1234' })
      .expect(200)
    await otherStudent
      .get(`/api/student/tutor/conversations/${created.body.conversation.id}`)
      .expect(404)
    await otherStudent
      .delete(`/api/student/tutor/conversations/${created.body.conversation.id}`)
      .expect(404)

    await student
      .delete(`/api/student/tutor/conversations/${created.body.conversation.id}`)
      .expect(204)
    expect(await prisma.tutorMessage.count()).toBe(0)

    await prisma.tutorConversation.create({
      data: {
        userId: (await prisma.user.findUniqueOrThrow({ where: { email: 'alex@example.com' } })).id,
        childId: child.body.child.id,
        subjectId: subject.body.subject.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    await student.get('/api/student/tutor/conversations').expect(200)
    expect(await prisma.tutorConversation.count()).toBe(0)
  })

  it('rejects invalid messages and subjects', async () => {
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
    await student
      .post('/api/student/tutor/conversations')
      .send({ subjectId: 'not-assigned' })
      .expect(400)
    await student
      .post('/api/student/tutor/conversations')
      .send({ subjectId: '' })
      .expect(400)
  })
})
