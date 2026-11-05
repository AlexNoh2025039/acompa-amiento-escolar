import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, apiRequest } from '../api'
import type { AuthUser } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/AuthLayout'
import { TextField } from '../components/TextField'
import { validateLogin } from '../validation'
import type { FieldErrors } from '../validation'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validateLogin({ email, password })
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      const data = await apiRequest<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      setUser(data.user)
      navigate('/', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors({
          email: error.fields.email,
          password: error.fields.password,
        })
        if (Object.keys(error.fields).length === 0) {
          setFormError(error.message)
        }
      } else {
        setFormError('No pudimos conectar con el servidor')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Iniciar sesión" subtitle="Entra con tu correo de padre, encargado o alumno.">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <TextField
          id="email"
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={setEmail}
        />
        <TextField
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={setPassword}
        />
        <div className="text-right">
          <Link className="text-sm font-semibold text-accent" to="/forgot-password">
            Olvidé mi contraseña
          </Link>
        </div>
        {formError ? (
          <p className="text-sm text-accent" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="text-sm text-tertiary">
        {typeof location.state?.message === 'string' ? (
          <span className="mb-3 block text-success" role="status">{location.state.message}</span>
        ) : null}
        ¿Aún no tienes cuenta?{' '}
        <Link className="font-semibold text-primary" to="/register">
          Regístrate
        </Link>
      </p>
    </AuthLayout>
  )
}
