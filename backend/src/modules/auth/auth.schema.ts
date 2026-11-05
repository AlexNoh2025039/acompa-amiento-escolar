import { z } from 'zod'

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra')
  .regex(/[0-9]/, 'La contraseña debe incluir al menos un número')

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Ingresa tu nombre completo')
      .max(120, 'El nombre es demasiado largo'),
    email: z
      .string()
      .trim()
      .email('Ingresa un correo válido')
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  })

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Ingresa un correo válido')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
