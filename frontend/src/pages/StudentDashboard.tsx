import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, apiRequest } from '../api'
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout, DashboardModule, DashboardModuleAction } from '../components/DashboardLayout'
import type { DashboardNavItem } from '../components/DashboardLayout'

type Subject = { id: string; name: string }
type Attachment = { id: string; originalName: string; mimeType: string }
type Task = {
  id: string
  title: string
  description: string | null
  type: 'homework' | 'exam' | 'reading'
  dueAt: string | null
  status: 'pending' | 'in_progress' | 'completed'
  subject: Subject | null
  attachments: Attachment[]
  isQuiz: boolean
}
type Schedule = {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  subject: Subject | null
}
type StudentData = {
  student: {
    id: string
    fullName: string
    email: string
    grade: string
    birthDate: string
    familyName: string
    points: number
  }
  subjects: Subject[]
  schedules: Schedule[]
  tasks: Task[]
}
type PracticeQuestion = { id: string; prompt: string; options: string[] }
type PracticeSession = {
  token: string
  subject: Subject
  questions: PracticeQuestion[]
}
type PracticeResult = {
  score: number
  total: number
  percentage: number
  answers: { questionId: string; correct: boolean; correctAnswer: string; explanation: string }[]
}
type Evaluation = {
  id: string
  title: string
  score: string | number
  maxScore: string | number
  evaluatedAt: string
  subject: Subject
}
type PracticeAttempt = {
  id: string
  score: number
  total: number
  completedAt: string | null
  createdAt: string
  subject: Subject
}
type ArtifactType = 'summary' | 'practice' | 'podcast' | 'video'
type LearningArtifact = {
  id: string
  type: ArtifactType
  title: string
  content: string
  mimeType: string | null
  durationSeconds: number | null
  createdAt: string
  fileUrl: string | null
  subject: Subject
}
type AiQuota = {
  limit: number
  used: number
  remaining: number
  resetsAt: string | null
}

const studentNavigation: DashboardNavItem[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'cursos', label: 'Mis cursos' },
  { id: 'actividades', label: 'Tareas y actividades' },
  { id: 'horario', label: 'Mi horario' },
  { id: 'practica', label: 'Practicar' },
  { id: 'tutor', label: 'Tutor de estudio', href: '/tutor' },
  { id: 'resultados', label: 'Mis resultados' },
  { id: 'materiales', label: 'Materiales' },
]

const taskTypeNames: Record<Task['type'], string> = {
  homework: 'Tarea',
  exam: 'Examen',
  reading: 'Lectura',
}
const taskStatusNames: Record<Task['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
}
const artifactNames: Record<ArtifactType, string> = {
  summary: 'Resumen',
  practice: 'Preguntas de práctica',
  podcast: 'Audio narrado',
  video: 'Video con diapositivas',
}
const inputClass =
  'student-input w-full rounded-xl border border-line bg-card px-3 py-2.5 text-tertiary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30'
const labelClass = 'mb-1 block text-sm font-semibold text-tertiary'
const primaryButton =
  'student-button rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60'
const secondaryButton =
  'rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-tertiary hover:bg-page disabled:opacity-60'
const cardClass = 'student-card rounded-2xl border border-line bg-card p-5 sm:p-6'

function getErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : 'No pudimos conectar con el servidor. Intenta de nuevo.'
}

function calculateAge(birthDate: string) {
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) {
    age -= 1
  }
  return age
}

function localDay() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format().toLowerCase()
}

function dueToday(dueAt: string | null) {
  return Boolean(dueAt && new Date(dueAt).toDateString() === new Date().toDateString())
}

export function StudentDashboard() {
  const { setUser } = useAuth()
  const [data, setData] = useState<StudentData | null>(null)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([])
  const [artifacts, setArtifacts] = useState<LearningArtifact[]>([])
  const [quota, setQuota] = useState<AiQuota | null>(null)
  const [artifactTypes, setArtifactTypes] = useState<Record<string, ArtifactType>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [quizSubjectId, setQuizSubjectId] = useState('')
  const [quiz, setQuiz] = useState<PracticeSession | null>(null)
  const [quizTaskId, setQuizTaskId] = useState<string | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null)
  const [speechMessage, setSpeechMessage] = useState('')
  const [speaking, setSpeaking] = useState(false)

  const age = useMemo(() => (data ? calculateAge(data.student.birthDate) : null), [data])
  const todaysSchedule = useMemo(
    () => data?.schedules.filter((block) => block.dayOfWeek === localDay()) ?? [],
    [data],
  )
  const openTasks = useMemo(
    () => data?.tasks.filter((task) => task.status !== 'completed') ?? [],
    [data],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [studentResult, resultHistory, artifactResult, usageResult] = await Promise.all([
          apiRequest<StudentData>('/api/student/me'),
          apiRequest<{ evaluations: Evaluation[]; attempts: PracticeAttempt[] }>('/api/student/results'),
          apiRequest<{ artifacts: LearningArtifact[] }>('/api/student/learning-artifacts'),
          apiRequest<{ usage: AiQuota }>('/api/student/ai/usage'),
        ])
        if (!cancelled) {
          setData(studentResult)
          setEvaluations(resultHistory.evaluations)
          setAttempts(resultHistory.attempts)
          setArtifacts(artifactResult.artifacts)
          setQuota(usageResult.usage)
          setQuizSubjectId(studentResult.subjects[0]?.id ?? '')
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

  useEffect(
    () => () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [],
  )

  async function perform(action: () => Promise<void>, success?: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
      if (success) setMessage(success)
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await apiRequest<void>('/api/auth/logout', { method: 'POST' })
      setUser(null)
    } catch (logoutError) {
      setError(getErrorMessage(logoutError))
      setLoggingOut(false)
    }
  }

  async function handleTaskStatus(task: Task, status: Task['status']) {
    await perform(async () => {
      const result = await apiRequest<{ task: Task }>(`/api/student/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setData((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((item) => (item.id === task.id ? result.task : item)),
            }
          : current,
      )
    }, 'Estado actualizado. ¡Buen trabajo!')
  }

  async function handleStartPractice(event: FormEvent) {
    event.preventDefault()
    await perform(async () => {
      const result = await apiRequest<PracticeSession>('/api/student/practice/start', {
        method: 'POST',
        body: JSON.stringify({ subjectId: quizSubjectId }),
      })
      setQuiz(result)
      setQuizTaskId(null)
      setAnswers(Array(result.questions.length).fill(-1))
      setQuestionIndex(0)
      setPracticeResult(null)
      setMessage('')
    })
  }

  async function handleGenerateArtifact(task: Task) {
    if (!task.subject) return
    const type = artifactTypes[task.id] ?? 'summary'
    await perform(async () => {
      const result = await apiRequest<{ artifact: LearningArtifact }>(
        `/api/student/tasks/${task.id}/learning-artifacts`,
        {
          method: 'POST',
          body: JSON.stringify({
            type,
            ...(task.attachments[0] ? { attachmentId: task.attachments[0].id } : {}),
          }),
        },
      )
      setArtifacts((current) => [result.artifact, ...current])
      const usage = await apiRequest<{ usage: AiQuota }>('/api/student/ai/usage')
      setQuota(usage.usage)
    }, 'Material listo. ¡Úsalo para estudiar!')
  }

  async function handleStartGeneratedPractice(artifactId: string) {
    await perform(async () => {
      const result = await apiRequest<PracticeSession>('/api/student/practice/start', {
        method: 'POST',
        body: JSON.stringify({ artifactId }),
      })
      setQuiz(result)
      setQuizTaskId(null)
      setAnswers(Array(result.questions.length).fill(-1))
      setQuestionIndex(0)
      setPracticeResult(null)
    })
  }

  async function handleStartAssignedQuiz(task: Task) {
    await perform(async () => {
      const result = await apiRequest<PracticeSession>('/api/student/practice/start', {
        method: 'POST',
        body: JSON.stringify({ taskId: task.id }),
      })
      setQuiz(result)
      setQuizTaskId(task.id)
      setAnswers(Array(result.questions.length).fill(-1))
      setQuestionIndex(0)
      setPracticeResult(null)
    })
  }

  async function handleSubmitPractice() {
    if (!quiz) return
    await perform(async () => {
      const result = await apiRequest<{ result: PracticeResult; pointsAwarded: number }>('/api/student/practice/submit', {
        method: 'POST',
        body: JSON.stringify({ token: quiz.token, answers }),
      })
      setPracticeResult(result.result)
      setQuiz(null)
      setData((current) => current ? {
        ...current,
        student: { ...current.student, points: current.student.points + result.pointsAwarded },
        tasks: current.tasks.map((task) =>
          task.id === quizTaskId ? { ...task, status: 'completed' } : task,
        ),
      } : current)
      setQuizTaskId(null)
      const history = await apiRequest<{ evaluations: Evaluation[]; attempts: PracticeAttempt[] }>(
        '/api/student/results',
      )
      setEvaluations(history.evaluations)
      setAttempts(history.attempts)
    }, 'Resultado guardado en tu progreso.')
  }

  function handleSpeak() {
    if (!data || !('speechSynthesis' in window)) {
      setSpeechMessage('La lectura en voz alta no está disponible en este navegador.')
      return
    }
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      setSpeechMessage('')
      return
    }
    const agenda = [
      `Hola ${data.student.fullName}.`,
      openTasks.length === 0
        ? '¡Ya completaste todas tus actividades pendientes!'
        : `Tienes ${openTasks.length} actividades por revisar.`,
      ...openTasks.slice(0, 4).map((task, index) => `${index + 1}. ${task.title}${task.subject ? ` de ${task.subject.name}` : ''}.`),
      todaysSchedule.length > 0
        ? `Hoy tienes ${todaysSchedule.length} bloques de estudio.`
        : 'No hay bloques de estudio programados para hoy.',
      'Elige una actividad y avanza paso a paso. ¡Tú puedes!',
    ].join(' ')
    const utterance = new SpeechSynthesisUtterance(agenda)
    utterance.lang = 'es'
    utterance.rate = 0.9
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => {
      setSpeaking(false)
      setSpeechMessage('No se pudo reproducir la lectura en voz alta.')
    }
    setSpeaking(true)
    setSpeechMessage('Reproduciendo tu resumen de estudio en este dispositivo.')
    window.speechSynthesis.speak(utterance)
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-page text-tertiary">Preparando tu día…</main>
  }

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-page px-4">
        <section className={`${cardClass} max-w-lg text-center`}>
          <h1 className="text-xl font-semibold">No encontramos tu perfil de alumno</h1>
          <p className="mt-2 text-sm">Pide a tu padre o encargado que revise la cuenta vinculada a tu perfil.</p>
          {error ? <p className="mt-3 text-sm text-accent" role="alert">{error}</p> : null}
          <button type="button" className={`${primaryButton} mt-4`} onClick={() => void handleLogout()}>Cerrar sesión</button>
        </section>
      </main>
    )
  }

  const todayName = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const currentQuestion = quiz?.questions[questionIndex]
  const quizCompletedCount = answers.filter((answer) => answer >= 0).length
  return (
    <DashboardLayout brand="Espacio del alumno" description="Encuentra tus cursos, actividades y herramientas de estudio." items={studentNavigation}>
        <DashboardModule id="inicio">
        <header id="inicio" className="student-hero flex scroll-mt-32 flex-wrap items-center justify-between gap-4 rounded-2xl border p-6 shadow-sm sm:p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Mi espacio de aprendizaje</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-tertiary sm:text-4xl">¡Hola, {data.student.fullName}!</h1>
            <p className="mt-2 font-medium text-tertiary/75">{data.student.grade} · {data.student.familyName}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary">{data.student.points} puntos</p>
            <p className="hidden rounded-full bg-white/80 px-4 py-2 text-sm font-semibold capitalize sm:block">{todayName}</p>
            <button type="button" className="rounded-xl border border-white bg-white/80 px-4 py-2.5 text-sm font-bold text-tertiary hover:bg-white" onClick={() => void handleLogout()} disabled={loggingOut}>
              {loggingOut ? 'Saliendo…' : 'Salir'}
            </button>
          </div>
        </header>
        </DashboardModule>

        {error ? <p className="rounded-md bg-card p-3 text-sm text-accent" role="alert">{error}</p> : null}
        {message ? <p className="rounded-md bg-card p-3 text-sm text-success" role="status">{message}</p> : null}

        {quota ? (
          <DashboardModule id="inicio">
          <section className={`${cardClass} flex flex-wrap items-center justify-between gap-3`} aria-live="polite">
            <div>
              <p className="font-bold">Ayuda para estudiar</p>
              <p className="text-sm text-tertiary/75">
                Te quedan {quota.remaining} de {quota.limit} ayudas con IA para hoy. Se comparten entre el tutor, la práctica y tus materiales de estudio.
              </p>
            </div>
            <span className="rounded-full bg-page px-3 py-1 text-sm font-semibold">{quota.remaining} restantes</span>
          </section>
          </DashboardModule>
        ) : null}

        <DashboardModule id="inicio">
        <section className={`${cardClass} scroll-mt-32 border-l-4 border-l-secondary`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-primary">Mi día</p>
              <h2 className="mt-1 text-2xl font-extrabold capitalize">{todayName}</h2>
              <p className="mt-1 text-sm text-tertiary/75">
                {openTasks.length === 0 ? '¡Todo al día! ¿Practicamos algo nuevo?' : `Tienes ${openTasks.length} ${openTasks.length === 1 ? 'actividad' : 'actividades'} por completar. ¡Tú puedes!`}
              </p>
            </div>
            <button type="button" className={primaryButton} onClick={handleSpeak} disabled={!('speechSynthesis' in window)}>
              {speaking ? '⏸️ Pausar resumen' : '🔊 Escuchar mi resumen'}
            </button>
          </div>
          {speechMessage ? <p className="mt-3 text-sm text-tertiary/75" role="status">{speechMessage}</p> : null}
        </section>
        </DashboardModule>

        <DashboardModule id="cursos">
        <section id="cursos" className={`${cardClass} scroll-mt-32`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Aprendizaje</p>
              <h2 className="mt-1 text-lg font-semibold">Mis cursos</h2>
            </div>
            <p className="text-sm text-tertiary/70">{data.subjects.length} {data.subjects.length === 1 ? 'materia asignada' : 'materias asignadas'}</p>
          </div>
          {data.subjects.length > 0 ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.subjects.map((subject) => {
                const pendingForSubject = openTasks.filter((task) => task.subject?.id === subject.id).length
                return (
                  <li key={subject.id} className="flex flex-col rounded-xl border border-line bg-page/60 p-4">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 font-semibold text-primary">
                      {subject.name.slice(0, 1).toUpperCase()}
                    </span>
                    <h3 className="mt-3 font-semibold">{subject.name}</h3>
                    <p className="mt-1 text-sm text-tertiary/70">
                      {pendingForSubject} {pendingForSubject === 1 ? 'actividad pendiente' : 'actividades pendientes'}
                    </p>
                    <DashboardModuleAction
                      id="practica"
                      className="mt-4 text-left text-sm font-semibold text-primary hover:underline"
                      onClick={() => setQuizSubjectId(subject.id)}
                    >
                      Practicar esta materia
                    </DashboardModuleAction>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg bg-page p-4 text-sm text-tertiary/75">
              Pide a tu padre o encargado que asigne materias a tu perfil para que aparezcan aquí.
            </p>
          )}
        </section>
        </DashboardModule>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <DashboardModule id="actividades">
          <section id="actividades" className={`${cardClass} scroll-mt-32`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Mis actividades</h2>
                <p className="text-sm text-tertiary/75">Avanza una cosa a la vez. Puedes cambiar el estado cuando quieras.</p>
              </div>
              <span className="rounded-full bg-page px-3 py-1 text-sm">{openTasks.length} pendientes</span>
            </div>
            <ul className="mt-4 space-y-3">
              {data.tasks.map((task) => {
                const subjectId = task.subject?.id
                return (
                <li key={task.id} className={`rounded-lg border border-line p-4 ${task.status === 'completed' ? 'bg-page/70' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        {taskTypeNames[task.type]}{task.subject ? ` · ${task.subject.name}` : ''}
                      </p>
                      <h3 className={`mt-1 font-semibold ${task.status === 'completed' ? 'line-through opacity-70' : ''}`}>{task.title}</h3>
                      {task.isQuiz ? <p className="mt-1 text-sm font-medium text-primary">Cuestionario · completa para ganar 10 puntos</p> : null}
                      {task.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-tertiary/80">{task.description}</p> : null}
                      {task.dueAt ? <p className={`mt-2 text-sm ${dueToday(task.dueAt) ? 'font-semibold text-accent' : ''}`}>
                        {dueToday(task.dueAt) ? 'Vence hoy · ' : 'Vence · '}{new Date(task.dueAt).toLocaleString('es')}
                      </p> : null}
                    </div>
                    <label className="w-40">
                      <span className="sr-only">Estado de {task.title}</span>
                      <select className={inputClass} value={task.status} onChange={(event) => void handleTaskStatus(task, event.target.value as Task['status'])} disabled={busy}>
                        {Object.entries(taskStatusNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                      </select>
                    </label>
                  </div>
                  {task.isQuiz && task.status !== 'completed' ? (
                    <button
                      type="button"
                      className={`${primaryButton} mt-4`}
                      disabled={busy}
                      onClick={() => void handleStartAssignedQuiz(task)}
                    >
                      Responder cuestionario
                    </button>
                  ) : null}
                  {task.attachments.length > 0 ? (
                    <ul className="mt-3 space-y-1">
                      {task.attachments.map((file) => (
                        <li key={file.id}>
                          <a
                            className="text-sm font-medium text-primary underline"
                            href={`/api/student/tasks/${task.id}/attachments/${file.id}`}
                          >
                            Abrir {file.originalName}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {subjectId ? (
                    <DashboardModuleAction
                      id="practica"
                      className={`${secondaryButton} mt-4`}
                      onClick={() => setQuizSubjectId(subjectId)}
                    >
                      Practicar {task.subject?.name}
                    </DashboardModuleAction>
                  ) : null}
                  {task.subject ? (
                    <div className="mt-4 flex flex-wrap items-end gap-2">
                      <label className="min-w-48 flex-1">
                        <span className={labelClass}>Material de estudio</span>
                        <select
                          className={inputClass}
                          value={artifactTypes[task.id] ?? 'summary'}
                          onChange={(event) => setArtifactTypes((current) => ({
                            ...current,
                            [task.id]: event.target.value as ArtifactType,
                          }))}
                        >
                          {Object.entries(artifactNames).map(([value, name]) => (
                            <option key={value} value={value}>{name}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={busy || (quota?.remaining ?? 1) < 1}
                        onClick={() => void handleGenerateArtifact(task)}
                      >
                        Crear con IA
                      </button>
                    </div>
                  ) : null}
                </li>
                )
              })}
              {data.tasks.length === 0 ? <li className="rounded-md bg-page p-4 text-sm">Todavía no tienes actividades. Pide a tu encargado que te asigne una desde su panel.</li> : null}
            </ul>
          </section>
          </DashboardModule>

          <div className="space-y-6">
            <DashboardModule id="horario">
            <section id="horario" className={`${cardClass} scroll-mt-32`}>
              <h2 className="text-lg font-semibold">Horario de hoy</h2>
              <ul className="mt-3 divide-y divide-line">
                {todaysSchedule.map((block) => (
                  <li key={block.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="font-semibold">{block.startTime}–{block.endTime}</span>
                    <span className="text-right">{block.subject?.name ?? 'Tiempo de estudio'}</span>
                  </li>
                ))}
                {todaysSchedule.length === 0 ? <li className="py-3 text-sm text-tertiary/75">No tienes bloques programados para hoy.</li> : null}
              </ul>
            </section>
            </DashboardModule>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <DashboardModule id="practica">
          <section id="practica" className={`${cardClass} scroll-mt-32`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Práctica</p>
            <h2 className="mt-1 text-lg font-semibold">Unos minutos para aprender</h2>
            <p className="mt-1 text-sm text-tertiary/75">Elige una materia y responde preguntas. Al final verás qué salió bien y una explicación.</p>
            {!quiz && !practiceResult && data.subjects.length === 0 ? (
              <p className="mt-4 rounded-xl bg-page p-4 text-sm text-tertiary/80">
                Todavía no tienes materias para practicar. Pide a tu padre o encargado que te asigne una desde <strong>Perfiles → Materias</strong>.
              </p>
            ) : null}
            {!quiz && !practiceResult && data.subjects.length > 0 ? (
              <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={handleStartPractice}>
                <label className="min-w-52 flex-1"><span className={labelClass}>Materia</span>
                  <select className={inputClass} value={quizSubjectId} onChange={(event) => setQuizSubjectId(event.target.value)} required>
                    {data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </label>
                <button className={primaryButton} disabled={busy || data.subjects.length === 0}>Empezar práctica</button>
              </form>
            ) : quiz && currentQuestion ? (
              <div className="mt-4 rounded-lg bg-page p-4">
                <div className="flex items-center justify-between text-sm">
                  <span>{quiz.subject.name}</span>
                  <span>Pregunta {questionIndex + 1} de {quiz.questions.length}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full bg-secondary" style={{ width: `${((questionIndex + 1) / quiz.questions.length) * 100}%` }} />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{currentQuestion.prompt}</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {currentQuestion.options.map((option, index) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={answers[questionIndex] === index}
                      className={`rounded-lg border p-3 text-left text-sm ${answers[questionIndex] === index ? 'border-primary bg-primary/10 font-semibold' : 'border-line bg-card'}`}
                      onClick={() => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === questionIndex ? index : answer))}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-between gap-3">
                  <button type="button" className="rounded-md border border-line px-4 py-2 text-sm font-semibold" disabled={questionIndex === 0} onClick={() => setQuestionIndex((current) => current - 1)}>Anterior</button>
                  {questionIndex < quiz.questions.length - 1 ? (
                    <button type="button" className={primaryButton} disabled={answers[questionIndex] < 0} onClick={() => setQuestionIndex((current) => current + 1)}>Siguiente</button>
                  ) : (
                    <button type="button" className={primaryButton} disabled={busy || quizCompletedCount !== quiz.questions.length} onClick={() => void handleSubmitPractice()}>
                      {busy ? 'Revisando…' : 'Ver mi resultado'}
                    </button>
                  )}
                </div>
              </div>
            ) : practiceResult !== null ? (
              <div className="mt-4 rounded-lg bg-page p-4" role="status">
                <p className="text-xl font-semibold">Resultado: {practiceResult.score} de {practiceResult.total} ({practiceResult.percentage}%)</p>
                <p className="mt-1 text-sm font-semibold text-primary">⭐ Ganaste 10 puntos. ¡Sigue así!</p>
                <ul className="mt-3 space-y-3">
                  {practiceResult.answers.map((answer, index) => (
                    <li key={answer.questionId} className="text-sm">
                      <p className={answer.correct ? 'font-semibold text-success' : 'font-semibold text-accent'}>
                        {index + 1}. {answer.correct ? '¡Correcto!' : `La respuesta era: ${answer.correctAnswer}`}
                      </p>
                      <p className="text-tertiary/80">{answer.explanation}</p>
                    </li>
                  ))}
                </ul>
                <button type="button" className={`${primaryButton} mt-4`} onClick={() => setPracticeResult(null)}>Practicar otra vez</button>
              </div>
            ) : null}
          </section>
          </DashboardModule>

          <DashboardModule id="tutor">
          <section id="tutor" className={`${cardClass} scroll-mt-32`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Tutor de estudio</p>
            <h2 className="mt-1 text-lg font-semibold">¿Necesitas una pista?</h2>
            <p className="mt-2 text-sm text-tertiary/80">
              Cuéntale qué estás intentando aprender y recibe preguntas y pistas para avanzar paso a paso.
            </p>
            <Link to="/tutor" className={`${primaryButton} mt-4 inline-block`}>
              Abrir tutor de estudio
            </Link>
            <p className="mt-3 text-xs text-tertiary/70">
              {age !== null && age <= 10 ? 'No compartas datos personales. Puedes pedir apoyo a un adulto cuando una pregunta se sienta difícil.' : 'El tutor ofrece pistas, no hace la tarea por ti.'}
            </p>
          </section>
          </DashboardModule>
        </div>

        <DashboardModule id="resultados">
        <section id="resultados" className={`${cardClass} scroll-mt-32`}>
          <h2 className="text-lg font-semibold">Mis resultados</h2>
          <p className="mt-1 text-sm text-tertiary/75">Aquí están tus evaluaciones y las prácticas que ya completaste.</p>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Prácticas</h3>
              <ul className="mt-2 divide-y divide-line">
                {attempts.map((attempt) => (
                  <li key={attempt.id} className="flex justify-between gap-3 py-2 text-sm">
                    <span>{attempt.subject.name} · {new Date(attempt.completedAt ?? attempt.createdAt).toLocaleDateString('es')}</span>
                    <span className="font-semibold">{attempt.score}/{attempt.total}</span>
                  </li>
                ))}
                {attempts.length === 0 ? <li className="py-2 text-sm text-tertiary/70">Aún no terminas prácticas.</li> : null}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Resultados obtenidos (sobre 100)</h3>
              <ul className="mt-2 divide-y divide-line">
                {evaluations.map((evaluation) => (
                  <li key={evaluation.id} className="flex justify-between gap-3 py-2 text-sm">
                    <span>{evaluation.title} · {evaluation.subject.name}</span>
                    <span className="font-semibold">{Math.round((Number(evaluation.score) / Number(evaluation.maxScore)) * 100)}/100</span>
                  </li>
                ))}
                {evaluations.length === 0 ? <li className="py-2 text-sm text-tertiary/70">Aún no hay evaluaciones registradas.</li> : null}
              </ul>
            </div>
          </div>
        </section>
        </DashboardModule>

        <DashboardModule id="materiales">
        <section id="materiales" className={`${cardClass} scroll-mt-32`}>
          <h2 className="text-lg font-semibold">Mis materiales de estudio</h2>
          <p className="mt-1 text-sm text-tertiary/75">Los resúmenes, prácticas y narraciones que generaste para tus actividades.</p>
          <ul className="mt-4 space-y-3">
            {artifacts.map((artifact) => {
              const details = artifact.type === 'podcast' || artifact.type === 'video'
                ? (() => {
                    try {
                      return JSON.parse(artifact.content) as { transcript?: string }
                    } catch {
                      return {}
                    }
                  })()
                : null
              return (
                <li key={artifact.id} className="rounded-lg border border-line p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {artifactNames[artifact.type]} · {artifact.subject.name}
                  </p>
                  <h3 className="mt-1 font-semibold">{artifact.title}</h3>
                  {artifact.type === 'summary' ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-tertiary/80">{artifact.content}</p>
                  ) : null}
                  {artifact.type === 'practice' ? (
                    <button
                      type="button"
                      className={`${primaryButton} mt-3`}
                      disabled={busy}
                      onClick={() => void handleStartGeneratedPractice(artifact.id)}
                    >
                      Empezar esta práctica
                    </button>
                  ) : null}
                  {artifact.type === 'podcast' && artifact.fileUrl ? (
                    <audio className="mt-3 w-full" controls preload="none" src={artifact.fileUrl}>
                      Tu navegador no puede reproducir este audio.
                    </audio>
                  ) : null}
                  {artifact.type === 'video' && artifact.fileUrl ? (
                    <video className="mt-3 w-full rounded-lg" controls preload="none" src={artifact.fileUrl}>
                      Tu navegador no puede reproducir este video.
                    </video>
                  ) : null}
                  {details?.transcript ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-semibold text-primary">Ver transcripción</summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-tertiary/80">{details.transcript}</p>
                    </details>
                  ) : null}
                  {artifact.durationSeconds ? (
                    <p className="mt-2 text-xs text-tertiary/70">Duración aproximada: {Math.round(artifact.durationSeconds / 60)} minutos.</p>
                  ) : null}
                  <p className="mt-2 text-xs text-tertiary/70">{new Date(artifact.createdAt).toLocaleString('es')}</p>
                </li>
              )
            })}
            {artifacts.length === 0 ? (
              <li className="rounded-md bg-page p-4 text-sm text-tertiary/75">Aún no has generado materiales.</li>
            ) : null}
          </ul>
        </section>
        </DashboardModule>
    </DashboardLayout>
  )
}
