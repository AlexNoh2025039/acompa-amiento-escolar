export type AuthUser = {
  id: string
  fullName: string
  email: string
  role: 'parent' | 'student'
  familyId: string
}

export type Family = {
  id: string
  name: string | null
}

type ErrorBody = {
  error?: {
    code?: string
    message?: string
    fields?: Record<string, string[] | undefined>
  }
}

export class ApiError extends Error {
  status: number
  code: string
  fields: Partial<Record<string, string>>

  constructor(status: number, code: string, message: string, fields: Partial<Record<string, string>>) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

async function parseError(response: Response) {
  let body: ErrorBody = {}
  try {
    body = (await response.json()) as ErrorBody
  } catch {
    body = {}
  }

  const fields: Partial<Record<string, string>> = {}
  for (const [key, messages] of Object.entries(body.error?.fields ?? {})) {
    if (messages && messages.length > 0) {
      fields[key] = messages[0]
    }
  }

  return new ApiError(
    response.status,
    body.error?.code ?? 'REQUEST_FAILED',
    body.error?.message ?? 'No pudimos completar la solicitud',
    fields,
  )
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  const headers = new Headers(init.headers)
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (response.status === 401 && allowRefresh && path !== '/api/auth/refresh' && path !== '/api/auth/login') {
    const refresh = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    if (refresh.ok) {
      return apiRequest<T>(path, init, false)
    }
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
