import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testEnv = vi.hoisted(() => ({
  GMAIL_CLIENT_ID: 'client-id',
  GMAIL_CLIENT_SECRET: 'client-secret',
  GMAIL_REFRESH_TOKEN: 'refresh-token',
  GMAIL_FROM: 'sender@gmail.com',
}))

vi.mock('../src/env', () => ({ env: testEnv }))

import { assertEmailConfigured, sendPasswordResetEmail } from '../src/services/emailService'

const fetchMock = vi.fn()

beforeEach(() => {
  testEnv.GMAIL_CLIENT_ID = 'client-id'
  testEnv.GMAIL_CLIENT_SECRET = 'client-secret'
  testEnv.GMAIL_REFRESH_TOKEN = 'refresh-token'
  testEnv.GMAIL_FROM = 'sender@gmail.com'
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Gmail email service', () => {
  it('uses the refresh token and sends a MIME message through Gmail API', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))

    await sendPasswordResetEmail('recipient@example.com', 'https://school.example/reset-password?token=abc')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const tokenRequest = fetchMock.mock.calls[0]?.[1] as RequestInit
    const tokenForm = new URLSearchParams(String(tokenRequest.body))
    expect(tokenForm.get('client_id')).toBe('client-id')
    expect(tokenForm.get('client_secret')).toBe('client-secret')
    expect(tokenForm.get('refresh_token')).toBe('refresh-token')

    const gmailRequest = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(gmailRequest.headers).toMatchObject({ Authorization: 'Bearer access-token' })
    const gmailBody = JSON.parse(String(gmailRequest.body)) as { raw: string }
    const mimeMessage = Buffer.from(gmailBody.raw, 'base64url').toString('utf8')
    const decodedParts = mimeMessage
      .split('Content-Transfer-Encoding: base64\r\n\r\n')
      .slice(1)
      .map((part) => Buffer.from(part.split('\r\n--')[0]!.replace(/\r\n/g, ''), 'base64').toString('utf8'))
      .join('\n')
    expect(mimeMessage).toContain('From: sender@gmail.com')
    expect(mimeMessage).toContain('To: recipient@example.com')
    expect(decodedParts).toContain('https://school.example/reset-password?token=abc')
  })

  it('does not make a request when Gmail API is not configured', async () => {
    testEnv.GMAIL_REFRESH_TOKEN = ''

    expect(() => assertEmailConfigured()).toThrow('El servicio de correo aún no está configurado.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports Gmail API delivery failures', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendPasswordResetEmail('recipient@example.com', 'https://school.example/reset-password?token=abc'),
    ).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' })
  })
})
