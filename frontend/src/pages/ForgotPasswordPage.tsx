import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, apiRequest } from '../api'
import { AuthLayout } from '../components/AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Ingresa un correo válido.')
      return
    }
    setSubmitting(true)
    try {
      await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      setSent(true)
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : 'No pudimos conectar con el servidor. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      subtitle="Solicita un enlace temporal para cambiar tu contraseña."
    >
      {sent ? (
        <p className="rounded-md border border-line bg-page px-4 py-3 text-sm text-tertiary" role="status">
          Si el correo está registrado y el servicio de correo está disponible, recibirás instrucciones para restablecer tu contraseña.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-tertiary">Correo electrónico</span>
            <input
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-tertiary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-accent" role="alert">{error}</p> : null}
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Enviando…' : 'Enviar instrucciones'}
          </button>
        </form>
      )}
      <Link className="inline-block font-semibold text-primary" to="/login">
        Volver al inicio de sesión
      </Link>
    </AuthLayout>
  )
}
