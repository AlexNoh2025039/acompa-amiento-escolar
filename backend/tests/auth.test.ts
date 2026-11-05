import argon2 from 'argon2'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { hashToken } from '../src/lib/tokens'

const app = createApp()

function parent(email: string, fullName = 'María López') {
  return {
    fullName,
    email,
    password: 'clave1234',
    confirmPassword: 'clave1234',
  }
}

function cookieValue(setCookie: string | string[] | undefined, name: string) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  const row = list.find((entry) => entry.startsWith(`${name}=`))
  return row?.split(';')[0]?.slice(name.length + 1)
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

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('auth', () => {
  it('registers a parent and hides the password hash', async () => {
    const response = await request(app).post('/api/auth/register').send(parent('maria@example.com'))

    expect(response.status).toBe(201)
    expect(response.body.user).toMatchObject({
      fullName: 'María López',
      email: 'maria@example.com',
      role: 'parent',
    })
    expect(response.body.user.familyId).toEqual(expect.any(String))
    expect(response.body.user.passwordHash).toBeUndefined()
    expect(cookieValue(response.headers['set-cookie'], 'access_token')).toBeTruthy()
    expect(cookieValue(response.headers['set-cookie'], 'refresh_token')).toBeTruthy()

    const stored = await prisma.user.findUnique({ where: { email: 'maria@example.com' } })
    expect(stored?.passwordHash).toBeTruthy()
    expect(stored?.passwordHash).not.toBe('clave1234')
  })

  it('rejects mismatched passwords without creating a user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...parent('maria@example.com'), confirmPassword: 'otra1234' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION')
    expect(await prisma.user.count()).toBe(0)
  })

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register').send(parent('maria@example.com'))
    const response = await request(app).post('/api/auth/register').send(parent('Maria@example.com', 'Otra Persona'))

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('EMAIL_TAKEN')
    expect(await prisma.user.count()).toBe(1)
  })

  it('uses the same message for unknown users and bad passwords', async () => {
    await request(app).post('/api/auth/register').send(parent('maria@example.com'))

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'maria@example.com', password: 'incorrecta1' })
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@example.com', password: 'incorrecta1' })

    expect(wrongPassword.status).toBe(401)
    expect(unknownUser.status).toBe(401)
    expect(wrongPassword.body).toEqual(unknownUser.body)
  })

  it('requires a session for /me', async () => {
    const response = await request(app).get('/api/auth/me')
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('UNAUTHORIZED')
  })

  it('refreshes the session, rejects a reused refresh token, and logs out', async () => {
    const agent = request.agent(app)
    const registered = await agent.post('/api/auth/register').send(parent('maria@example.com'))
    const firstRefresh = cookieValue(registered.headers['set-cookie'], 'refresh_token')

    const refreshed = await agent.post('/api/auth/refresh')
    expect(refreshed.status).toBe(200)
    expect(refreshed.body.user.email).toBe('maria@example.com')

    const reused = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refresh_token=${firstRefresh}`])
    expect(reused.status).toBe(401)

    const afterReuse = await agent.post('/api/auth/refresh')
    expect(afterReuse.status).toBe(401)

    await agent.post('/api/auth/logout').expect(204)
    await agent.get('/api/auth/me').expect(401)
  })

  it('logs in an existing parent', async () => {
    await request(app).post('/api/auth/register').send(parent('maria@example.com'))
    const agent = request.agent(app)
    const loggedIn = await agent
      .post('/api/auth/login')
      .send({ email: 'maria@example.com', password: 'clave1234' })

    expect(loggedIn.status).toBe(200)
    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user.familyId).toBe(loggedIn.body.user.familyId)
  })

  it('does not imply an email was sent when SMTP is unavailable', async () => {
    await request(app).post('/api/auth/register').send(parent('maria@example.com'))
    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'maria@example.com' })
      .expect(503)
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nadie@example.com' })
      .expect(503)
    expect(known.body).toEqual(unknown.body)
    expect(known.body.error.code).toBe('EMAIL_NOT_CONFIGURED')
    expect(await prisma.passwordResetToken.count()).toBe(0)
  })

  it('resets the password once and revokes existing refresh sessions', async () => {
    await request(app).post('/api/auth/register').send(parent('maria@example.com'))
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'maria@example.com' } })
    const rawToken = 'single-use-reset-token'
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken('existing-refresh-token'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'nueva1234', confirmPassword: 'nueva1234' })
      .expect(204)

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(await argon2.verify(updated.passwordHash, 'nueva1234')).toBe(true)
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0)
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'otra1234', confirmPassword: 'otra1234' })
      .expect(400)
  })
})

describe('family isolation', () => {
  it('returns only the family stored on the authenticated user', async () => {
    const ana = request.agent(app)
    const luis = request.agent(app)

    const anaRegister = await ana
      .post('/api/auth/register')
      .send(parent('ana@example.com', 'Ana Pérez'))
    const luisRegister = await luis
      .post('/api/auth/register')
      .send(parent('luis@example.com', 'Luis Gómez'))

    const anaFamily = await ana.get('/api/families/me')
    const luisFamily = await luis.get('/api/families/me')

    expect(anaFamily.status).toBe(200)
    expect(luisFamily.status).toBe(200)
    expect(anaFamily.body.family.id).toBe(anaRegister.body.user.familyId)
    expect(luisFamily.body.family.id).toBe(luisRegister.body.user.familyId)
    expect(anaFamily.body.family.id).not.toBe(luisFamily.body.family.id)
    expect(anaFamily.body.family.name).toBe('Familia de Ana Pérez')
    expect(JSON.stringify(anaFamily.body)).not.toContain(luisRegister.body.user.email)
    expect(JSON.stringify(luisFamily.body)).not.toContain(anaRegister.body.user.email)
  })
})
