import { z } from 'zod'

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:mm')
const date = z.string().datetime({ offset: true })

export const childSchema = z.object({
  fullName: z.string().trim().min(2, 'Ingresa el nombre').max(120),
  birthDate: z
    .string()
    .date()
    .refine((value) => value <= new Date().toISOString().slice(0, 10), 'La fecha no puede estar en el futuro'),
  grade: z.string().trim().min(1, 'Ingresa el grado').max(80),
})

export const childUpdateSchema = childSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Indica al menos un campo para actualizar',
)

export const studentAccountSchema = z
  .object({
    email: z.string().trim().email('Ingresa un correo válido').max(254).transform((value) => value.toLowerCase()),
    password: z
      .string()
      .min(8, 'La contraseña debe tener al menos 8 caracteres')
      .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra')
      .regex(/[0-9]/, 'La contraseña debe incluir al menos un número'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  })

export const familySchema = z.object({
  name: z.string().trim().min(2, 'El nombre de la familia debe tener al menos 2 caracteres').max(120),
})

export const subjectSchema = z.object({
  name: z.string().trim().min(1, 'Ingresa el nombre de la materia').max(80),
})

export const scheduleSchema = z
  .object({
    subjectId: z.string().optional().nullable(),
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    startTime: time,
    endTime: time,
  })
  .refine((value) => value.startTime < value.endTime, {
    path: ['endTime'],
    message: 'La hora de fin debe ser posterior a la hora de inicio',
  })

export const taskSchema = z.object({
  subjectId: z.string().optional().nullable(),
  title: z.string().trim().min(1, 'Ingresa el título').max(180),
  description: z.string().trim().max(10000).optional().nullable(),
  type: z.enum(['homework', 'exam', 'reading']),
  createQuiz: z.boolean().optional(),
  dueAt: date.optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
})

export const taskUpdateSchema = taskSchema.omit({ createQuiz: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'Indica al menos un campo para actualizar',
)

export const notificationPreferenceSchema = z.object({
  emailSummary: z.boolean(),
  reminderTime: time.nullable(),
})
