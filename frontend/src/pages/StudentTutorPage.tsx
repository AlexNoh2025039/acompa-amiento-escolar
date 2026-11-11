import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError, apiRequest } from '../api'
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout, DashboardModule } from '../components/DashboardLayout'
import type { DashboardNavItem } from '../components/DashboardLayout'

type Subject = { id: string; name: string }
type AiQuota = { limit: number; used: number; remaining: number; resetsAt: string | null }
type TutorMessage = {
  id: string
  role: 'student' | 'assistant'
  content: string
  createdAt: string
  attachment: { name: string; mimeType: string; url: string } | null
}
type Conversation = {
  id: string
  title: string
  subject: Subject
  createdAt: string
  updatedAt: string
  expiresAt: string
  _count?: { messages: number }
}
type ConversationDetail = Conversation & { messages: TutorMessage[] }

const tutorNavigation: DashboardNavItem[] = [
  { id: 'tutor', label: 'Tutor de estudio' },
  { id: 'inicio', label: 'Mi espacio', href: '/' },
  { id: 'cursos', label: 'Mis cursos', href: '/#cursos' },
]

const cardClass = 'student-card rounded-3xl border border-line bg-card p-5 shadow-sm'
const inputClass =
  'student-input w-full rounded-xl border border-line bg-card px-3 py-2.5 text-tertiary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30'
const buttonClass =
  'student-button rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60'

function getErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : 'No pudimos conectar con el servidor. Intenta de nuevo.'
}

export function StudentTutorPage() {
  const { user } = useAuth()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [quota, setQuota] = useState<AiQuota | null>(null)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [studentData, history, usage] = await Promise.all([
          apiRequest<{ subjects: Subject[] }>('/api/student/me'),
          apiRequest<{ conversations: Conversation[] }>('/api/student/tutor/conversations'),
          apiRequest<{ usage: AiQuota }>('/api/student/ai/usage'),
        ])
        if (cancelled) return
        setSubjects(studentData.subjects)
        setSubjectId(studentData.subjects[0]?.id ?? '')
        setConversations(history.conversations)
        setQuota(usage.usage)
        if (history.conversations[0]) {
          setSelectedId(history.conversations[0].id)
        }
      } catch (loadError) {
        if (!cancelled) setError(getErrorMessage(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    let cancelled = false
    async function loadConversation() {
      setError('')
      try {
        const result = await apiRequest<{ conversation: ConversationDetail }>(
          `/api/student/tutor/conversations/${selectedId}`,
        )
        if (!cancelled) setMessages(result.conversation.messages)
      } catch (loadError) {
        if (!cancelled) setError(getErrorMessage(loadError))
      }
    }
    void loadConversation()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    if (!attachment?.type.startsWith('image/')) {
      setAttachmentPreviewUrl('')
      return
    }
    const previewUrl = URL.createObjectURL(attachment)
    setAttachmentPreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [attachment])

  if (user?.role !== 'student') return <Navigate to="/" replace />

  async function handleNewConversation() {
    if (!subjectId) return
    setCreating(true)
    setError('')
    try {
      const result = await apiRequest<{ conversation: Conversation }>('/api/student/tutor/conversations', {
        method: 'POST',
        body: JSON.stringify({ subjectId }),
      })
      setConversations((current) => [result.conversation, ...current])
      setSelectedId(result.conversation.id)
      setMessages([])
      setDraft('')
      setAttachment(null)
    } catch (createError) {
      setError(getErrorMessage(createError))
    } finally {
      setCreating(false)
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault()
    if (!selectedId || (!draft.trim() && !attachment)) return
    setSending(true)
    setError('')
    try {
      const body = new FormData()
      if (draft.trim()) body.set('content', draft.trim())
      if (attachment) body.set('file', attachment)
      const result = await apiRequest<{ studentMessage: TutorMessage; assistantMessage: TutorMessage; expiresAt: string }>(
        `/api/student/tutor/conversations/${selectedId}/messages`,
        { method: 'POST', body },
      )
      setMessages((current) => [...current, result.studentMessage, result.assistantMessage])
      setConversations((current) => {
        const updated = current.map((conversation) =>
          conversation.id === selectedId
            ? {
                ...conversation,
                title: conversation.title === 'Nueva conversación'
                  ? result.studentMessage.content.replace(/\s+/g, ' ').slice(0, 80)
                  : conversation.title,
                updatedAt: result.assistantMessage.createdAt,
                expiresAt: result.expiresAt,
                _count: { messages: (conversation._count?.messages ?? 0) + 2 },
              }
            : conversation,
        )
        return updated.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
      })
      const usage = await apiRequest<{ usage: AiQuota }>('/api/student/ai/usage')
      setQuota(usage.usage)
      setDraft('')
      setAttachment(null)
    } catch (sendError) {
      setError(getErrorMessage(sendError))
    } finally {
      setSending(false)
    }
  }

  async function handleDeleteConversation() {
    if (!selectedId || !window.confirm('¿Eliminar esta conversación y todos sus mensajes?')) return
    setDeleting(true)
    setError('')
    try {
      await apiRequest<void>(`/api/student/tutor/conversations/${selectedId}`, { method: 'DELETE' })
      const remaining = conversations.filter((conversation) => conversation.id !== selectedId)
      setConversations(remaining)
      setSelectedId(remaining[0]?.id ?? '')
      setMessages([])
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-page text-tertiary">Preparando el tutor…</main>
  }

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId)

  return (
    <DashboardLayout brand="Tutor de estudio" description="Aprende con pistas y explicaciones paso a paso." items={tutorNavigation}>
        <DashboardModule id="tutor">
        <header id="inicio" className={`student-hero flex scroll-mt-32 flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/80 p-6 shadow-lg sm:p-8`}>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-primary">🤖 Tu compañero de estudio</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-tertiary sm:text-4xl">¡Vamos a descubrirlo!</h1>
          </div>
          <Link className="rounded-xl border border-white bg-white/80 px-4 py-2.5 text-sm font-bold hover:bg-white" to="/">
            🏠 Volver a mi espacio
          </Link>
        </header>

        <p className="student-tutor-notice rounded-lg border border-secondary/50 bg-card p-3 text-sm text-tertiary/80" role="note">
          💡 Puedes escribir una pregunta o subir una foto de tu ejercicio. Para darte pistas, tu pregunta, el archivo y tu grado se envían a Google Gemini. No escribas tu dirección, teléfono ni contraseña. Solo tú puedes leer tus conversaciones; se borran después de 30 días sin actividad.
        </p>
        {quota ? (
          <p className="rounded-lg border border-line bg-card p-3 text-sm text-tertiary/80">
            Te quedan {quota.remaining} de {quota.limit} ayudas con IA para hoy. Se comparten entre el tutor, la práctica y tus materiales de estudio.
          </p>
        ) : null}

        {error ? <p className="rounded-md bg-card p-3 text-sm text-accent" role="alert">{error}</p> : null}

        <div id="tutor" className="student-tutor-grid grid scroll-mt-32 gap-5 lg:grid-cols-[280px_1fr]">
          <aside className={`${cardClass} h-fit`}>
            <h2 className="text-lg font-extrabold">💬 Mis conversaciones</h2>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm font-medium">Materia</span>
              <select className={inputClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={subjects.length === 0}>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
            <button type="button" className={`${buttonClass} mt-3 w-full`} onClick={() => void handleNewConversation()} disabled={creating || !subjectId}>
              {creating ? 'Preparando…' : '✨ Nueva conversación'}
            </button>
            {subjects.length === 0 ? <p className="mt-2 text-sm text-tertiary/70">Pide a tu encargado que agregue una materia a tu perfil.</p> : null}
            <ul className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border p-3 text-left ${selectedId === conversation.id ? 'border-primary bg-primary/10' : 'border-line hover:bg-page'}`}
                    onClick={() => setSelectedId(conversation.id)}
                  >
                    <span className="block truncate text-sm font-semibold">{conversation.title}</span>
                    <span className="mt-1 block text-xs text-tertiary/70">{conversation.subject.name}</span>
                    <span className="mt-1 block text-xs text-tertiary/70">
                      {new Date(conversation.updatedAt).toLocaleDateString('es')}
                      {conversation._count ? ` · ${Math.floor(conversation._count.messages / 2)} intercambios` : ''}
                    </span>
                  </button>
                </li>
              ))}
              {conversations.length === 0 ? <li className="py-3 text-sm text-tertiary/70">Todavía no tienes conversaciones.</li> : null}
            </ul>
          </aside>

          <section className={`${cardClass} flex min-h-[65vh] flex-col`}>
            {selectedConversation ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                  <div>
                    <p className="text-sm font-semibold text-primary">{selectedConversation.subject.name}</p>
                    <h2 className="mt-1 text-lg font-semibold">{selectedConversation.title}</h2>
                    <p className="mt-1 text-xs text-tertiary/70">Te daré pistas para que tú encuentres la respuesta. 🌟</p>
                  </div>
                  <button type="button" className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-accent hover:bg-page" onClick={() => void handleDeleteConversation()} disabled={deleting || sending}>
                    {deleting ? 'Eliminando…' : 'Eliminar conversación'}
                  </button>
                </div>

                <div className="student-chat-thread flex-1 space-y-4 overflow-y-auto py-5" aria-live="polite">
                  {messages.map((message) => (
                    <article key={message.id} className={`student-chat-message max-w-[90%] rounded-3xl p-4 shadow-sm ${message.role === 'student' ? 'ml-auto bg-primary text-white' : 'mr-auto border border-violet-100 bg-violet-50'}`}>
                      <p className="mb-1 text-xs font-bold">{message.role === 'student' ? '😊 Tú' : '🤖 Tu tutor'}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                      {message.attachment ? (
                        message.attachment.mimeType.startsWith('image/') ? (
                          <a href={message.attachment.url} target="_blank" rel="noreferrer" className="mt-3 block">
                            <img
                              className="max-h-64 rounded-xl object-contain"
                              src={message.attachment.url}
                              alt={`Archivo adjunto: ${message.attachment.name}`}
                            />
                            <span className="mt-1 block text-xs underline">{message.attachment.name}</span>
                          </a>
                        ) : (
                          <a
                            className="mt-3 inline-block rounded-lg bg-white/20 px-3 py-2 text-sm underline"
                            href={message.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            📄 Abrir {message.attachment.name}
                          </a>
                        )
                      ) : null}
                    </article>
                  ))}
                  {sending ? (
                    <p className="mr-auto rounded-3xl bg-violet-50 p-4 text-sm" role="status">🤔 Estoy pensando en una pista…</p>
                  ) : null}
                  {messages.length === 0 ? (
                    <div className="mx-auto max-w-lg py-12 text-center">
                      <p className="text-2xl font-extrabold">¿Qué te gustaría aprender?</p>
                      <p className="mt-2 text-sm text-tertiary/75">Cuéntame qué parte te cuesta. ¡Lo descubrimos juntos!</p>
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>

                <form className="border-t border-line pt-4" onSubmit={(event) => void handleSend(event)}>
                  <label htmlFor="tutor-message" className="mb-2 block text-sm font-bold">✏️ Escribe tu pregunta o adjunta tu ejercicio</label>
                  <textarea
                    id="tutor-message"
                    className={inputClass}
                    rows={3}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={4000}
                    placeholder="Ej. ¿Cómo puedo sumar fracciones?"
                    disabled={sending}
                  />
                  <label className="mt-3 block text-sm font-semibold">
                    <span className="mb-1 block">Foto o PDF (opcional)</span>
                    <input
                      className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-semibold file:text-primary"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      disabled={sending}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file && file.size > 10 * 1024 * 1024) {
                          setError('El archivo no puede superar 10 MB.')
                          setAttachment(null)
                        } else {
                          setError('')
                          setAttachment(file ?? null)
                        }
                        event.target.value = ''
                      }}
                    />
                    <span className="mt-1 block text-xs font-normal text-tertiary/70">PDF, JPG, PNG o WebP · máximo 10 MB. No incluyas datos personales.</span>
                  </label>
                  {attachment ? (
                    <div className="mt-2 flex items-center gap-3 rounded-lg bg-page px-3 py-2 text-sm">
                      {attachmentPreviewUrl ? (
                        <img className="h-16 w-16 rounded-lg object-cover" src={attachmentPreviewUrl} alt="Vista previa del archivo seleccionado" />
                      ) : <span aria-hidden="true">📄</span>}
                      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                      <button type="button" className="text-accent underline" onClick={() => setAttachment(null)} disabled={sending}>Quitar</button>
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-tertiary/70">{draft.length}/4000 caracteres</span>
                    <button className={buttonClass} disabled={sending || (!draft.trim() && !attachment)}>
                      {sending ? 'Pensando…' : '💡 Pedir una pista'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-center">
                <div>
                  <h2 className="text-lg font-semibold">Tu espacio para aprender</h2>
                  <p className="mt-2 max-w-md text-sm text-tertiary/75">Crea una conversación nueva o elige una de tu historial para continuar.</p>
                </div>
              </div>
            )}
          </section>
        </div>
        </DashboardModule>
    </DashboardLayout>
  )
}
