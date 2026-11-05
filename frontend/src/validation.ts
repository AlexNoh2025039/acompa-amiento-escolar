export type FieldErrors = Partial<Record<'fullName' | 'email' | 'password' | 'confirmPassword', string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validatePassword(password: string, confirmPassword: string): Pick<FieldErrors, 'password' | 'confirmPassword'> {
  const errors: Pick<FieldErrors, 'password' | 'confirmPassword'> = {}
  if (password.length < 8) {
    errors.password = 'La contraseña debe tener al menos 8 caracteres'
  } else if (!/[A-Za-z]/.test(password)) {
    errors.password = 'La contraseña debe incluir al menos una letra'
  } else if (!/[0-9]/.test(password)) {
    errors.password = 'La contraseña debe incluir al menos un número'
  }
  if (password !== confirmPassword) {
    errors.confirmPassword = 'Las contraseñas no coinciden'
  }
  return errors
}

export function validateRegister(input: {
  fullName: string
  email: string
  password: string
  confirmPassword: string
}): FieldErrors {
  const errors: FieldErrors = {}
  const fullName = input.fullName.trim()
  const email = input.email.trim()

  if (fullName.length < 2) {
    errors.fullName = 'Ingresa tu nombre completo'
  } else if (fullName.length > 120) {
    errors.fullName = 'El nombre es demasiado largo'
  }

  if (!emailPattern.test(email) || email.length > 254) {
    errors.email = 'Ingresa un correo válido'
  }

  Object.assign(errors, validatePassword(input.password, input.confirmPassword))

  return errors
}

export function validateLogin(input: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {}
  const email = input.email.trim()

  if (!emailPattern.test(email)) {
    errors.email = 'Ingresa un correo válido'
  }
  if (input.password.length === 0) {
    errors.password = 'Ingresa tu contraseña'
  }

  return errors
}
