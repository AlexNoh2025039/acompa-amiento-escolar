import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, apiRequest } from '../api'
import { AuthLayout } from '../components/AuthLayout'
import { TextField } from '../components/TextField'
import { validatePassword } from '../validation'
import type { FieldErrors } from '../validation'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const validation = validatePassword(password, confirmPassword)
    setErrors({ password: validation.password, confirmPassword: validation.confirmPassword })
    setFormError('')
    if (!token) {
      setFormError('El enlace no contiene un token válido. Solicita uno nuevo.')
      return
    }
    if (validation.password || validation.confirmPassword) return

    setSubmitting(true)
    try {
      await apiRequest<void>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password, confirmPassword }),
      })
      navigate('/login', { replace: true, state: { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' } })
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors({
          password: error.fields.password,
          confirmPassword: error.fields.confirmPassword,
        })
        if (Object.keys(error.fields).length === 0) setFormError(error.message)
      } else {
        setFormError('No pudimos conectar con el servidor. Inténtalo de nuevo.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Crear nueva contraseña" subtitle="El enlace es de un solo uso y vence en 30 minutos.">
      {!token ? (
        <p className="text-sm text-accent" role="alert">El enlace no es válido. Solicita uno nuevo.</p>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <TextField
            id="new-password"
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            error={errors.password}
            onChange={setPassword}
          />
          <TextField
            id="confirm-password"
            label="Confirmar contraseña"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            error={errors.confirmPassword}
            onChange={setConfirmPassword}
          />
          {formError ? <p className="text-sm text-accent" role="alert">{formError}</p> : null}
          <button
            className="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Actualizando…' : 'Guardar contraseña'}
          </button>
        </form>
      )}
      <Link className="inline-block font-semibold text-primary" to="/forgot-password">
        Solicitar otro enlace
      </Link>
    </AuthLayout>
  )
}
