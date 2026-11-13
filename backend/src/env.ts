import dotenv from 'dotenv'
import path from 'path'
import { z } from 'zod'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CLIENT_ORIGIN: z.string().url(),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  UPLOADS_DIR: z.string().min(1).default('private-uploads'),
  S3_BUCKET: z.string().trim().optional().transform((value) => value || undefined),
  S3_REGION: z.string().trim().min(1).default('us-east-1'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().trim().optional().transform((value) => value || undefined),
  S3_SECRET_ACCESS_KEY: z.string().trim().optional().transform((value) => value || undefined),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GEMINI_API_KEY: z.string().trim().optional().transform((value) => value || undefined),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3-flash-preview'),
  GEMINI_TTS_MODEL: z.string().trim().min(1).default('gemini-3.8-flash-tts'),
  FFMPEG_PATH: z.string().trim().optional().transform((value) => value || undefined),
  VIDEO_FONT_PATH: z.string().trim().optional().transform((value) => value || undefined),
  SMTP_HOST: z.string().trim().optional().transform((value) => value || undefined),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().trim().optional().transform((value) => value || undefined),
  SMTP_PASS: z.string().optional().transform((value) => value || undefined),
  SMTP_FROM: z.string().trim().email().optional().or(z.literal('')).transform((value) => value || undefined),
})

const parsedEnv = envSchema.superRefine((value, context) => {
  if (value.STORAGE_PROVIDER === 's3' && !value.S3_BUCKET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['S3_BUCKET'],
      message: 'S3_BUCKET es obligatorio cuando STORAGE_PROVIDER=s3',
    })
  }
  if (Boolean(value.S3_ACCESS_KEY_ID) !== Boolean(value.S3_SECRET_ACCESS_KEY)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['S3_SECRET_ACCESS_KEY'],
      message: 'Configura juntos S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY',
    })
  }
  if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASS)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_PASS'],
      message: 'Configura juntos SMTP_USER y SMTP_PASS',
    })
  }
  if (value.SMTP_FROM && !value.SMTP_HOST) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_HOST'],
      message: 'SMTP_HOST es obligatorio cuando se configura SMTP_FROM',
    })
  }
})

export const env = parsedEnv.parse(process.env)
