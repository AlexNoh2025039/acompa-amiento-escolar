import nodemailer from 'nodemailer'
import { env } from '../env'
import { AppError } from '../lib/errors'

export function assertEmailConfigured() {
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'El servicio de correo aún no está configurado.')
  }
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  assertEmailConfigured()
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && env.SMTP_PASS
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
  })

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM!,
      to: email,
      subject: 'Restablece tu contraseña de Acompañamiento escolar',
      text: [
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta.',
        `Usa este enlace dentro de 30 minutos: ${resetUrl}`,
        'Si no solicitaste este cambio, puedes ignorar este mensaje.',
      ].join('\n\n'),
      html: `<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p><p><a href="${resetUrl}">Restablecer contraseña</a></p><p>El enlace vence en 30 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>`,
    })
  } catch (error) {
    console.error('No se pudo entregar el correo de restablecimiento', error)
    throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'No se pudo enviar el correo. Inténtalo de nuevo más tarde.')
  }
}
