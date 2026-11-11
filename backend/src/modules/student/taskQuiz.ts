import { z } from 'zod'

export const practiceQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
})

const readingQuizSchema = z.object({
  reading: z.string().min(1),
  questions: z.array(practiceQuestionSchema).min(1).max(5),
})

const taskQuizSchema = z.union([
  z.array(practiceQuestionSchema).min(1).max(5),
  readingQuizSchema,
])

export function parseTaskQuiz(value: unknown) {
  const parsed = taskQuizSchema.parse(value)
  return Array.isArray(parsed)
    ? { questions: parsed, reading: null }
    : parsed
}

export function getTaskReadingContent(value: unknown) {
  const parsed = readingQuizSchema.safeParse(value)
  return parsed.success ? parsed.data.reading : null
}
