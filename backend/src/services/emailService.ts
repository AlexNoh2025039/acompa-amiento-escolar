import { randomBytes } from 'node:crypto'
import { env } from '../env'
import { AppError } from '../lib/errors'

const requestTimeoutMs = 15_000

type GmailConfig = {
  clientId: string
  clientSecret: string
  refreshToken: string
  from: string
}

function getGmailConfig(): GmailConfig {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM } = env
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_FROM) {
    throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'El servicio de correo aún no está configurado.')
  }
  return {
    clientId: GMAIL_CLIENT_ID,
    clientSecret: GMAIL_CLIENT_SECRET,
    refreshToken: GMAIL_REFRESH_TOKEN,
    from: GMAIL_FROM,
  }
}

export function assertEmailConfigured() {
  getGmailConfig()
}

function encodeMimePart(value: string) {
  return Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? ''
}

function createRawMessage(from: string, to: string, resetUrl: string) {
  const boundary = `aischool-${randomBytes(12).toString('hex')}`
  const subject = Buffer.from('Restablece tu contraseña de Acompañamiento escolar', 'utf8').toString('base64')
  const text = [
    'Recibimos una solicitud para cambiar la contraseña de tu cuenta.',
    `Usa este enlace dentro de 30 minutos: ${resetUrl}`,
    'Si no solicitaste este cambio, puedes ignorar este mensaje.',
  ].join('\n\n')
  const htmlResetUrl = resetUrl.replace(/&/g, '&amp;')
  const html = `<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p><p><a href="${htmlResetUrl}">Restablecer contraseña</a></p><p>El enlace vence en 30 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>`

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${subject}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimePart(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimePart(html),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

async function getAccessToken(config: GmailConfig) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  if (!response.ok) {
    throw new Error(`Google OAuth token request failed with status ${response.status}`)
  }

  const payload: unknown = await response.json()
  if (typeof payload !== 'object' || payload === null || !('access_token' in payload)) {
    throw new Error('Google OAuth token response did not contain an access token')
  }
  const accessToken = (payload as Record<string, unknown>).access_token
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Google OAuth token response did not contain an access token')
  }
  return accessToken
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const config = getGmailConfig()

  try {
    const accessToken = await getAccessToken(config)
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: Buffer.from(createRawMessage(config.from, email, resetUrl), 'utf8').toString('base64url'),
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) {
      throw new Error(`Gmail API request failed with status ${response.status}`)
    }
  } catch (error) {
    console.error('No se pudo entregar el correo de restablecimiento', error)
    throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'No se pudo enviar el correo. Inténtalo de nuevo más tarde.')
  }
}
