import { z } from 'zod'
import { env } from '../env'
import { AppError } from '../lib/errors'

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

const contentResponseSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        parts: z.array(z.object({ text: z.string().optional() })),
      }).optional(),
    }),
  ).optional(),
})

export async function generateGeminiText(input: {
  systemInstruction: string
  parts: GeminiPart[]
  responseMimeType?: 'text/plain' | 'application/json'
  maxOutputTokens?: number
}) {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(503, 'AI_NOT_CONFIGURED', 'La generación con IA aún no está configurada en el servidor.')
  }
  let response: Response
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemInstruction }] },
          contents: [{ role: 'user', parts: input.parts }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: input.maxOutputTokens ?? 2500,
            ...(input.responseMimeType ? { responseMimeType: input.responseMimeType } : {}),
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new AppError(504, 'AI_TIMEOUT', 'La generación tardó demasiado. Inténtalo de nuevo.')
    }
    if (error instanceof TypeError) {
      throw new AppError(503, 'AI_UNAVAILABLE', 'No pudimos conectar con el servicio de IA. Inténtalo de nuevo.')
    }
    throw error
  }
  if (!response.ok) {
    console.error('Gemini text generation failed', {
      status: response.status,
      model: env.GEMINI_MODEL,
    })
    if (response.status === 401 || response.status === 403) {
      throw new AppError(503, 'AI_CREDENTIALS_INVALID', 'Gemini rechazó la clave configurada. Revísala en el servidor.')
    }
    if (response.status === 404) {
      throw new AppError(503, 'AI_MODEL_NOT_FOUND', 'El modelo de Gemini configurado no está disponible. Revisa GEMINI_MODEL.')
    }
    if (response.status === 429) {
      throw new AppError(503, 'AI_QUOTA_EXCEEDED', 'Gemini alcanzó su cuota o límite de solicitudes. Inténtalo más tarde.')
    }
    if (response.status >= 500) {
      throw new AppError(503, 'AI_PROVIDER_UNAVAILABLE', 'Gemini no está disponible temporalmente. Inténtalo más tarde.')
    }
    throw new AppError(502, 'AI_PROVIDER_ERROR', 'Gemini rechazó la solicitud. Revisa la configuración del servicio.')
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError(502, 'AI_INVALID_RESPONSE', 'El servicio de IA devolvió una respuesta que no pudimos leer.')
    }
    throw error
  }
  const parsed = contentResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'El servicio de IA devolvió una respuesta que no pudimos leer.')
  }
  const text = parsed.data.candidates?.[0]?.content?.parts
    .map((part) => part.text ?? '')
    .filter(Boolean)
    .join('\n')
    .trim()
  if (!text) {
    throw new AppError(422, 'AI_RESPONSE_BLOCKED', 'No pude generar material seguro. Prueba a reformular la solicitud.')
  }
  return text
}

const speechResponseSchema = z.object({
  steps: z.array(z.object({
    type: z.string().optional(),
    content: z.array(z.object({
      type: z.string().optional(),
      data: z.string().optional(),
      mime_type: z.string().optional(),
    })).optional(),
  })).optional(),
})

export async function generateGeminiSpeech(text: string) {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(503, 'AI_NOT_CONFIGURED', 'La generación con IA aún no está configurada en el servidor.')
  }
  let response: Response
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model: env.GEMINI_TTS_MODEL,
        input: [{
          type: 'user_input',
          content: [{
            type: 'text',
            text,
            annotations: [{ type: 'speech_metadata', style: 'Voz clara y cálida en español latinoamericano, ritmo pausado para estudiantes.' }],
          }],
        }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: 'Kore' }] },
      }),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new AppError(504, 'TTS_TIMEOUT', 'La narración tardó demasiado en generarse. Inténtalo de nuevo.')
    }
    if (error instanceof TypeError) {
      throw new AppError(503, 'AI_UNAVAILABLE', 'No pudimos conectar con el servicio de voz. Inténtalo de nuevo.')
    }
    throw error
  }
  if (!response.ok) {
    throw new AppError(
      response.status === 429 || response.status >= 500 ? 503 : 502,
      'TTS_PROVIDER_ERROR',
      'No se pudo generar la narración ahora. Inténtalo de nuevo más tarde.',
    )
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError(502, 'TTS_INVALID_RESPONSE', 'El servicio de voz devolvió una respuesta que no pudimos leer.')
    }
    throw error
  }
  const parsed = speechResponseSchema.safeParse(payload)
  const audio = parsed.success
    ? parsed.data.steps
      ?.flatMap((step) => step.content ?? [])
      .filter((part) => part.type === 'audio' && part.data)
      .at(-1)
    : undefined
  if (!audio?.data) {
    throw new AppError(502, 'TTS_INVALID_RESPONSE', 'El servicio de voz no devolvió audio.')
  }
  return { data: Buffer.from(audio.data, 'base64'), mimeType: audio.mime_type ?? 'audio/L16;rate=24000' }
}
