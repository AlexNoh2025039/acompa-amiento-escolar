import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, apiRequest } from '../api'
import type { AuthUser } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/AuthLayout'
import { TextField } from '../components/TextField'
import { validateRegister } from '../validation'
import type { FieldErrors } from '../validation'

const emptyErrors: FieldErrors = {}

export function RegisterPage() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>(emptyErrors)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validateRegister({ fullName, email, password, confirmPassword })
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      const data = await apiRequest<{ user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          confirmPassword,
        }),
      })
      setUser(data.user)
      navigate('/', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors({
          fullName: error.fields.fullName,
          email: error.fields.email,
          password: error.fields.password,
          confirmPassword: error.fields.confirmPassword,
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
    <AuthLayout title="Crear cuenta" subtitle="Registra al padre o encargado de la familia.">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <TextField
          id="fullName"
          label="Nombre completo"
          type="text"
          autoComplete="name"
          value={fullName}
          error={errors.fullName}
          onChange={setFullName}
        />
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
          autoComplete="new-password"
          value={password}
          error={errors.password}
          onChange={setPassword}
        />
        <TextField
          id="confirmPassword"
          label="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          error={errors.confirmPassword}
          onChange={setConfirmPassword}
        />
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
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <p className="text-sm text-tertiary">
        ¿Ya tienes cuenta?{' '}
        <Link className="font-semibold text-primary" to="/login">
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
