import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, apiRequest } from '../api'
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout, DashboardModule } from '../components/DashboardLayout'
import type { DashboardNavItem } from '../components/DashboardLayout'

type Subject = { id: string; name: string }
type Child = {
  id: string
  fullName: string
  birthDate: string
  grade: string
  subjects: Subject[]
  user?: { id: string; email: string } | null
}
type Schedule = {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  subject: Subject | null
}
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
  reviewedAt: string | null
}
type Evaluation = {
  id: string
  title: string
  score: string | number
  maxScore: string | number
  evaluatedAt: string
  subject: Subject
}
type LearningArtifact = {
  id: string
  type: 'summary' | 'practice' | 'podcast' | 'video'
  title: string
  content: string
  mimeType: string | null
  durationSeconds: number | null
  createdAt: string
  fileUrl: string | null
  subject: Subject
  task: { id: string; title: string } | null
}
type Preferences = { emailSummary: boolean; reminderTime: string | null }
type ChildSummary = {
  id: string
  fullName: string
  grade: string
  birthDate: string
  tasks: { pending: number; inProgress: number; completed: number }
  nextTask: { title: string; dueAt: string } | null
  averageScore: number | null
  evaluationCount: number
  points: number
  subjectAverages: { name: string; averageScore: number; evaluationCount: number }[]
  gradeHistory: { fromGrade: string; toGrade: string; createdAt: string }[]
}
type FamilyOverview = { family: { id: string; name: string | null }; children: ChildSummary[] }

const parentNavigation: DashboardNavItem[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'seguimiento', label: 'Seguimiento' },
  { id: 'perfiles', label: 'Perfiles' },
  { id: 'cursos', label: 'Materias' },
  { id: 'horarios', label: 'Horarios' },
  { id: 'actividades', label: 'Tareas y actividades' },
  { id: 'evaluaciones', label: 'Resultados' },
  { id: 'materiales', label: 'Material de apoyo' },
  { id: 'configuracion', label: 'Configuración' },
]
const parentOverviewNavigation: DashboardNavItem[] = parentNavigation.filter(
  (item) => ['inicio', 'seguimiento', 'perfiles', 'configuracion'].includes(item.id),
)

const days: Record<string, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
}
const taskTypes: Record<Task['type'], string> = {
  homework: 'Tarea',
  exam: 'Examen',
  reading: 'Lectura',
}
const taskStatuses: Record<Task['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
}
const controlClass =
  'w-full rounded-md border border-line bg-card px-3 py-2 text-tertiary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30'
const labelClass = 'mb-1 block text-sm font-medium text-tertiary'
const buttonClass =
  'rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60'
const secondaryButtonClass =
  'rounded-md border border-line px-3 py-2 text-sm font-semibold text-tertiary hover:bg-page disabled:opacity-60'

function ScheduleEditor({
  schedule,
  subjects,
  disabled,
  onSave,
}: {
  schedule: Schedule
  subjects: Subject[]
  disabled: boolean
  onSave: (scheduleId: string, value: {
    dayOfWeek: string
    startTime: string
    endTime: string
    subjectId: string | null
  }) => Promise<void>
}) {
  const [dayOfWeek, setDayOfWeek] = useState(schedule.dayOfWeek)
  const [startTime, setStartTime] = useState(schedule.startTime)
  const [endTime, setEndTime] = useState(schedule.endTime)
  const [subjectId, setSubjectId] = useState(schedule.subject?.id ?? '')

  function submit(event: FormEvent) {
    event.preventDefault()
    void onSave(schedule.id, { dayOfWeek, startTime, endTime, subjectId: subjectId || null })
  }

  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer font-medium text-primary">Editar horario</summary>
      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={submit}>
        <label><span className={labelClass}>Día</span>
          <select className={controlClass} value={dayOfWeek} onChange={(event) => setDayOfWeek(event.target.value)}>
            {Object.entries(days).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        <label><span className={labelClass}>Materia</span>
          <select className={controlClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">Sin materia</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <label><span className={labelClass}>Inicio</span>
          <input className={controlClass} type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
        </label>
        <label><span className={labelClass}>Fin</span>
          <input className={controlClass} type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
        </label>
        <button className={`${buttonClass} sm:col-span-2`} disabled={disabled}>Guardar horario</button>
      </form>
    </details>
  )
}

function formatLocalDateTime(value: string) {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function TaskEditor({
  task,
  subjects,
  disabled,
  onSave,
}: {
  task: Task
  subjects: Subject[]
  disabled: boolean
  onSave: (taskId: string, value: {
    title: string
    description: string | null
    type: Task['type']
    dueAt: string | null
    subjectId: string | null
  }) => Promise<void>
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [type, setType] = useState(task.type)
  const [dueAt, setDueAt] = useState(task.dueAt ? formatLocalDateTime(task.dueAt) : '')
  const [subjectId, setSubjectId] = useState(task.subject?.id ?? '')

  function submit(event: FormEvent) {
    event.preventDefault()
    void onSave(task.id, {
      title,
      description: description || null,
      type,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      subjectId: subjectId || null,
    })
  }

  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-medium text-primary">Editar actividad</summary>
      <form className="mt-3 grid gap-3" onSubmit={submit}>
        <label><span className={labelClass}>Título</span>
          <input className={controlClass} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className={labelClass}>Tipo</span>
            <select className={controlClass} value={type} onChange={(event) => setType(event.target.value as Task['type'])} disabled={disabled || task.isQuiz}>
              {Object.entries(taskTypes).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
          <label><span className={labelClass}>Materia</span>
            <select className={controlClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={disabled || task.isQuiz}>
              <option value="">Sin materia</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
        </div>
        {task.isQuiz ? <p className="text-xs text-tertiary/70">La materia y el tipo de un cuestionario no se pueden cambiar porque sus preguntas corresponden al grado y materia seleccionados al asignarlo.</p> : null}
        <label><span className={labelClass}>Vencimiento</span>
          <input className={controlClass} type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </label>
        <label><span className={labelClass}>Detalles</span>
          <textarea className={controlClass} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10000} />
        </label>
        <button className={buttonClass} disabled={disabled}>Guardar actividad</button>
      </form>
    </details>
  )
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

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'No pudimos conectar con el servidor. Intenta de nuevo.'
}

export function ParentDashboard() {
  const { user, setUser } = useAuth()
  const [familyName, setFamilyName] = useState('')
  const [familyNameInput, setFamilyNameInput] = useState('')
  const [childSummaries, setChildSummaries] = useState<ChildSummary[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [learningArtifacts, setLearningArtifacts] = useState<LearningArtifact[]>([])
  const [preferences, setPreferences] = useState<Preferences>({ emailSummary: false, reminderTime: null })
  const [pageLoading, setPageLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [childName, setChildName] = useState('')
  const [childBirthDate, setChildBirthDate] = useState('')
  const [childGrade, setChildGrade] = useState('')
  const [studentEmail, setStudentEmail] = useState('')
  const [studentPassword, setStudentPassword] = useState('')
  const [studentConfirmPassword, setStudentConfirmPassword] = useState('')
  const [editName, setEditName] = useState('')
  const [editBirthDate, setEditBirthDate] = useState('')
  const [editGrade, setEditGrade] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [scheduleDay, setScheduleDay] = useState('monday')
  const [scheduleStart, setScheduleStart] = useState('09:00')
  const [scheduleEnd, setScheduleEnd] = useState('10:00')
  const [scheduleSubject, setScheduleSubject] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskType, setTaskType] = useState<Task['type']>('homework')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [taskSubject, setTaskSubject] = useState('')
  const [taskCreateQuiz, setTaskCreateQuiz] = useState(false)

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedId) ?? null,
    [children, selectedId],
  )

  async function refreshOverview() {
    const overview = await apiRequest<FamilyOverview>('/api/families/me/overview')
    setFamilyName(overview.family.name ?? '')
    setFamilyNameInput(overview.family.name ?? '')
    setChildSummaries(overview.children)
  }

  async function handleSaveFamilyName(event: FormEvent) {
    event.preventDefault()
    await perform(async () => {
      const result = await apiRequest<{ family: { id: string; name: string } }>('/api/families/me', {
        method: 'PUT',
        body: JSON.stringify({ name: familyNameInput }),
      })
      setFamilyName(result.family.name)
      setFamilyNameInput(result.family.name)
    }, 'Nombre de la familia actualizado.')
  }

  useEffect(() => {
    let cancelled = false
    async function loadDashboard() {
      try {
        const [childResult, preferenceResult] = await Promise.all([
          apiRequest<{ children: Child[] }>('/api/families/me/children'),
          apiRequest<{ preference: Preferences }>('/api/families/me/notification-preferences'),
        ])
        const overview = await apiRequest<FamilyOverview>('/api/families/me/overview')
        if (!cancelled) {
          setChildren(childResult.children)
          setPreferences(preferenceResult.preference)
          setFamilyName(overview.family.name ?? '')
          setFamilyNameInput(overview.family.name ?? '')
          setChildSummaries(overview.children)
          setSelectedId((current) => current || childResult.children[0]?.id || '')
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(errorMessage(error))
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false)
        }
      }
    }
    void loadDashboard()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedChild) {
      setSchedules([])
      setTasks([])
      setEvaluations([])
      setLearningArtifacts([])
      setEditName('')
      setEditBirthDate('')
      setEditGrade('')
      return
    }
    setEditName(selectedChild.fullName)
    setEditBirthDate(selectedChild.birthDate.slice(0, 10))
    setEditGrade(selectedChild.grade)
    const childId = selectedChild.id
    let cancelled = false
    async function loadChildDetails() {
      setDetailLoading(true)
      setPageError('')
      try {
        const [scheduleResult, taskResult, evaluationResult, artifactResult] = await Promise.all([
          apiRequest<{ schedules: Schedule[] }>(`/api/families/me/children/${childId}/schedules`),
          apiRequest<{ tasks: Task[] }>(`/api/families/me/children/${childId}/tasks`),
          apiRequest<{ evaluations: Evaluation[] }>(
            `/api/families/me/children/${childId}/evaluations`,
          ),
          apiRequest<{ artifacts: LearningArtifact[] }>(
            `/api/families/me/children/${childId}/learning-artifacts`,
          ),
        ])
        if (!cancelled) {
          setSchedules(scheduleResult.schedules)
          setTasks(taskResult.tasks)
          setEvaluations(evaluationResult.evaluations)
          setLearningArtifacts(artifactResult.artifacts)
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(errorMessage(error))
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false)
        }
      }
    }
    void loadChildDetails()
    return () => {
      cancelled = true
    }
  }, [selectedChild])

  async function perform(action: () => Promise<void>, successMessage: string) {
    setBusy(true)
    setActionError('')
    setActionMessage('')
    try {
      await action()
      setActionMessage(successMessage)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddChild(event: FormEvent) {
    event.preventDefault()
    await perform(async () => {
      const result = await apiRequest<{ child: Child }>('/api/families/me/children', {
        method: 'POST',
        body: JSON.stringify({ fullName: childName, birthDate: childBirthDate, grade: childGrade }),
      })
      setChildren((current) => [...current, result.child])
      setSelectedId(result.child.id)
      setChildName('')
      setChildBirthDate('')
      setChildGrade('')
      await refreshOverview()
    }, 'Perfil del hijo agregado.')
  }

  async function handleSaveChild(event: FormEvent) {
    event.preventDefault()
    if (!selectedChild) return
    if (editGrade.trim() !== selectedChild.grade &&
      !window.confirm(`¿Confirmas cambiar el grado de ${selectedChild.fullName} de ${selectedChild.grade} a ${editGrade.trim()}?`)) {
      return
    }
    await perform(async () => {
      const result = await apiRequest<{ child: Omit<Child, 'subjects'> }>(
        `/api/families/me/children/${selectedChild.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ fullName: editName, birthDate: editBirthDate, grade: editGrade }),
        },
      )
      setChildren((current) =>
        current.map((child) =>
          child.id === selectedChild.id
            ? { ...result.child, subjects: child.subjects, user: child.user }
            : child,
        ),
      )
      await refreshOverview()
    }, 'Información del hijo actualizada.')
  }

  async function handleCreateStudentAccount(event: FormEvent) {
    event.preventDefault()
    if (!selectedChild) return
    if (studentPassword !== studentConfirmPassword) {
      setActionError('Las contraseñas no coinciden')
      setActionMessage('')
      return
    }
    await perform(async () => {
      const result = await apiRequest<{ student: { id: string; email: string } }>(
        `/api/families/me/children/${selectedChild.id}/account`,
        {
          method: 'POST',
          body: JSON.stringify({
            email: studentEmail,
            password: studentPassword,
            confirmPassword: studentConfirmPassword,
          }),
        },
      )
      setChildren((current) =>
        current.map((child) =>
          child.id === selectedChild.id
            ? { ...child, user: { id: result.student.id, email: result.student.email } }
            : child,
        ),
      )
      setStudentEmail('')
      setStudentPassword('')
      setStudentConfirmPassword('')
    }, 'Cuenta de alumno creada. Puede iniciar sesión con su correo y contraseña.')
  }

  async function handleDeleteChild() {
    if (!selectedChild || !window.confirm(`¿Eliminar el perfil de ${selectedChild.fullName} y sus datos?`)) {
      return
    }
    await perform(async () => {
      await apiRequest<void>(`/api/families/me/children/${selectedChild.id}`, { method: 'DELETE' })
      const remaining = children.filter((child) => child.id !== selectedChild.id)
      setChildren(remaining)
      setSelectedId(remaining[0]?.id ?? '')
      await refreshOverview()
    }, 'Perfil del hijo eliminado.')
  }

  async function handleAssignSubject(event: FormEvent) {
    event.preventDefault()
    if (!selectedChild) return
    await perform(async () => {
      const result = await apiRequest<{ subject: Subject }>(
        `/api/families/me/children/${selectedChild.id}/subjects`,
        { method: 'POST', body: JSON.stringify({ name: subjectName }) },
      )
      setChildren((current) =>
        current.map((child) =>
          child.id === selectedChild.id &&
          !child.subjects.some((subject) => subject.id === result.subject.id)
            ? { ...child, subjects: [...child.subjects, result.subject] }
            : child,
        ),
      )
      setSubjectName('')
    }, 'Materia asignada al hijo.')
  }

  async function handleRemoveSubject(subject: Subject) {
    if (!selectedChild) return
    await perform(async () => {
      await apiRequest<void>(
        `/api/families/me/children/${selectedChild.id}/subjects/${subject.id}`,
        { method: 'DELETE' },
      )
      setChildren((current) =>
        current.map((child) =>
          child.id === selectedChild.id
            ? { ...child, subjects: child.subjects.filter((item) => item.id !== subject.id) }
            : child,
        ),
      )
    }, 'Materia quitada del perfil.')
  }

  async function handleAddSchedule(event: FormEvent) {
    event.preventDefault()
    if (!selectedChild) return
    await perform(async () => {
      const result = await apiRequest<{ schedule: Schedule }>(
        `/api/families/me/children/${selectedChild.id}/schedules`,
        {
          method: 'POST',
          body: JSON.stringify({
            dayOfWeek: scheduleDay,
            startTime: scheduleStart,
            endTime: scheduleEnd,
            subjectId: scheduleSubject || null,
          }),
        },
      )
      setSchedules((current) => [...current, result.schedule])
    }, 'Horario agregado.')
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!selectedChild) return
    await perform(async () => {
      await apiRequest<void>(
        `/api/families/me/children/${selectedChild.id}/schedules/${scheduleId}`,
        { method: 'DELETE' },
      )
      setSchedules((current) => current.filter((schedule) => schedule.id !== scheduleId))
    }, 'Horario eliminado.')
  }

  async function handleUpdateSchedule(
    scheduleId: string,
    value: { dayOfWeek: string; startTime: string; endTime: string; subjectId: string | null },
  ) {
    if (!selectedChild) return
    await perform(async () => {
      const result = await apiRequest<{ schedule: Schedule }>(
        `/api/families/me/children/${selectedChild.id}/schedules/${scheduleId}`,
        { method: 'PATCH', body: JSON.stringify(value) },
      )
      setSchedules((current) =>
        current.map((schedule) => (schedule.id === scheduleId ? result.schedule : schedule)),
      )
    }, 'Horario actualizado.')
  }

  async function handleAddTask(event: FormEvent) {
    event.preventDefault()
    if (!selectedChild) return
    await perform(async () => {
      const result = await apiRequest<{ task: Task }>(
        `/api/families/me/children/${selectedChild.id}/tasks`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: taskTitle,
            description: taskDescription || null,
            type: taskType,
            createQuiz: taskCreateQuiz,
            dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
            subjectId: taskSubject || null,
          }),
        },
      )
      setTasks((current) => [...current, result.task])
      setTaskTitle('')
      setTaskDescription('')
      setTaskDueAt('')
      setTaskSubject('')
      setTaskCreateQuiz(false)
      await refreshOverview()
    }, taskCreateQuiz ? 'Cuestionario asignado. El alumno recibirá preguntas de su grado actual.' : 'Tarea agregada.')
  }

  async function handleReviewTask(task: Task) {
    if (!selectedChild || task.status !== 'completed' || task.reviewedAt) return
    await perform(async () => {
      const result = await apiRequest<{ task: { id: string; reviewedAt: string }; pointsAwarded: number }>(
        `/api/families/me/children/${selectedChild.id}/tasks/${task.id}/review`,
        { method: 'POST' },
      )
      setTasks((current) => current.map((item) =>
        item.id === task.id ? { ...item, reviewedAt: result.task.reviewedAt } : item,
      ))
      await refreshOverview()
    }, 'Tarea revisada. ¡Sumó 5 puntos!')
  }

  async function handleSaveTask(
    taskId: string,
    value: {
      title: string
      description: string | null
      type: Task['type']
      dueAt: string | null
      subjectId: string | null
    },
  ) {
    if (!selectedChild) return
    await perform(async () => {
      const result = await apiRequest<{ task: Task }>(
        `/api/families/me/children/${selectedChild.id}/tasks/${taskId}`,
        { method: 'PATCH', body: JSON.stringify(value) },
      )
      setTasks((current) => current.map((task) => (task.id === taskId ? result.task : task)))
      await refreshOverview()
    }, 'Actividad actualizada.')
  }

  async function handleTaskStatus(task: Task, status: Task['status']) {
    if (!selectedChild) return
    await perform(async () => {
      const result = await apiRequest<{ task: Task }>(
        `/api/families/me/children/${selectedChild.id}/tasks/${task.id}`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
      )
      setTasks((current) => current.map((item) => (item.id === task.id ? result.task : item)))
      await refreshOverview()
    }, 'Estado de la tarea actualizado.')
  }

  async function handleDeleteTask(task: Task) {
    if (!selectedChild || !window.confirm(`¿Eliminar la tarea "${task.title}" y sus archivos?`)) return
    await perform(async () => {
      await apiRequest<void>(
        `/api/families/me/children/${selectedChild.id}/tasks/${task.id}`,
        { method: 'DELETE' },
      )
      setTasks((current) => current.filter((item) => item.id !== task.id))
      await refreshOverview()
    }, 'Tarea eliminada.')
  }

  async function handleUpload(task: Task, file: File | undefined) {
    if (!selectedChild || !file) return
    const formData = new FormData()
    formData.append('file', file)
    await perform(async () => {
      await apiRequest(
        `/api/families/me/children/${selectedChild.id}/tasks/${task.id}/attachments`,
        { method: 'POST', body: formData },
      )
      const result = await apiRequest<{ tasks: Task[] }>(
        `/api/families/me/children/${selectedChild.id}/tasks`,
      )
      setTasks(result.tasks)
    }, 'Archivo guardado de forma privada.')
  }

  async function handleDeleteAttachment(task: Task, attachment: Attachment) {
    if (!selectedChild) return
    await perform(async () => {
      await apiRequest<void>(
        `/api/families/me/children/${selectedChild.id}/tasks/${task.id}/attachments/${attachment.id}`,
        { method: 'DELETE' },
      )
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? { ...item, attachments: item.attachments.filter((file) => file.id !== attachment.id) }
            : item,
        ),
      )
    }, 'Archivo eliminado.')
  }

  async function handleSavePreferences(event: FormEvent) {
    event.preventDefault()
    await perform(async () => {
      const result = await apiRequest<{ preference: Preferences }>(
        '/api/families/me/notification-preferences',
        { method: 'PUT', body: JSON.stringify(preferences) },
      )
      setPreferences(result.preference)
    }, 'Preferencias guardadas.')
  }

  async function handleLogout() {
    setLoggingOut(true)
    setActionError('')
    try {
      await apiRequest<void>('/api/auth/logout', { method: 'POST' })
      setUser(null)
    } catch (error) {
      setActionError(errorMessage(error))
      setLoggingOut(false)
    }
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      '¿Eliminar permanentemente la cuenta familiar, los perfiles, las tareas y los archivos? Esta acción no se puede deshacer.',
    )
    if (!confirmed) return
    setDeletingAccount(true)
    setActionError('')
    try {
      const result = await apiRequest<{ message?: string } | void>('/api/families/me', { method: 'DELETE' })
      if (result && result.message) window.alert(result.message)
      setUser(null)
    } catch (error) {
      setActionError(errorMessage(error))
      setDeletingAccount(false)
    }
  }

  if (user?.role !== 'parent') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page px-4">
        <section className="rounded-xl border border-line bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-tertiary">Este espacio es para padres y encargados</h1>
          <p className="mt-2 text-sm text-tertiary">El panel del alumno estará disponible en una fase posterior.</p>
        </section>
      </main>
    )
  }

  if (pageLoading) {
    return <main className="grid min-h-screen place-items-center bg-page text-tertiary">Cargando tu familia…</main>
  }

  const cardClass = 'rounded-xl border border-line bg-card p-5 shadow-sm'
  const navigation = selectedChild ? parentNavigation : parentOverviewNavigation

  return (
    <DashboardLayout brand="Espacio familiar" description="Organiza perfiles, cursos y actividades escolares." items={navigation}>
        <DashboardModule id="inicio">
        <header id="inicio" className="flex scroll-mt-32 flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-card p-5 shadow-sm">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Acompañamiento escolar</p>
            <h1 className="mt-1 text-2xl font-semibold">Hola, {user.fullName}</h1>
            <p className="text-sm text-tertiary/75">{familyName || 'Tu familia'} · Gestiona perfiles, estudio y seguimiento.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} onClick={handleLogout} disabled={loggingOut || deletingAccount}>
              {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
            <button
              type="button"
              className="rounded-md border border-accent px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/10 disabled:opacity-60"
              onClick={() => void handleDeleteAccount()}
              disabled={deletingAccount || loggingOut}
            >
              {deletingAccount ? 'Eliminando…' : 'Eliminar cuenta familiar'}
            </button>
          </div>
        </header>
        </DashboardModule>

        {pageError ? <p className="rounded-md bg-white p-3 text-sm text-accent" role="alert">{pageError}</p> : null}
        {actionError ? <p className="rounded-md bg-white p-3 text-sm text-accent" role="alert">{actionError}</p> : null}
        {actionMessage ? <p className="rounded-md bg-white p-3 text-sm text-success" role="status">{actionMessage}</p> : null}

        <DashboardModule id="configuracion">
        <section id="configuracion" className={`${cardClass} scroll-mt-32`}>
          <h2 className="text-lg font-semibold">Cuenta familiar</h2>
          <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={handleSaveFamilyName}>
            <label className="min-w-60 flex-1">
              <span className={labelClass}>Nombre de la familia</span>
              <input className={controlClass} value={familyNameInput} onChange={(event) => setFamilyNameInput(event.target.value)} required minLength={2} maxLength={120} />
            </label>
            <button type="submit" className={buttonClass} disabled={busy}>Guardar nombre</button>
          </form>
        </section>
        </DashboardModule>

        <DashboardModule id="seguimiento">
        <section id="seguimiento" className={`${cardClass} scroll-mt-32`}>
          <h2 className="text-lg font-semibold">Resumen de seguimiento</h2>
          {childSummaries.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {childSummaries.map((summary) => (
                <article key={summary.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{summary.fullName}</h3>
                      <p className="text-sm text-tertiary/75">{summary.grade} · {calculateAge(summary.birthDate)} años</p>
                    </div>
                    <p className="rounded-full bg-page px-3 py-1 text-sm">
                      {summary.averageScore === null ? 'Sin evaluaciones' : `Promedio ${summary.averageScore}%`}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-page px-2 py-1">Pendientes: {summary.tasks.pending}</span>
                    <span className="rounded bg-page px-2 py-1">En progreso: {summary.tasks.inProgress}</span>
                    <span className="rounded bg-page px-2 py-1">Completadas: {summary.tasks.completed}</span>
                    <span className="rounded bg-page px-2 py-1">Evaluaciones: {summary.evaluationCount}</span>
                    <span className="rounded bg-page px-2 py-1">⭐ Puntos: {summary.points}</span>
                  </div>
                  {summary.subjectAverages.length > 0 ? (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold">Promedio por materia</h4>
                      <ul className="mt-2 space-y-2">
                        {summary.subjectAverages.map((subject) => (
                          <li key={subject.name}>
                            <div className="flex justify-between gap-3 text-xs">
                              <span>{subject.name}</span><span>{subject.averageScore}%</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-page">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, subject.averageScore))}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {summary.gradeHistory.length > 0 ? (
                    <div className="mt-4 text-sm">
                      <h4 className="font-semibold">Cambios de grado</h4>
                      <ul className="mt-1 space-y-1 text-tertiary/75">
                        {summary.gradeHistory.map((change) => (
                          <li key={`${change.createdAt}-${change.toGrade}`}>
                            {change.fromGrade} → {change.toGrade} · {new Date(change.createdAt).toLocaleDateString('es')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {summary.nextTask ? (
                    <p className="mt-3 text-sm">
                      Próxima entrega: <span className="font-medium">{summary.nextTask.title}</span>
                      {' · '}{new Date(summary.nextTask.dueAt).toLocaleString('es')}
                    </p>
                  ) : <p className="mt-3 text-sm text-tertiary/70">Sin entregas próximas.</p>}
                  <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => setSelectedId(summary.id)}>
                    Ver perfil
                  </button>
                </article>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-tertiary/75">Agrega perfiles para ver aquí su seguimiento.</p>}
        </section>
        </DashboardModule>

        <DashboardModule id="perfiles">
        <section id="perfiles" className={`${cardClass} scroll-mt-32`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Hijos de tu familia</h2>
              <p className="text-sm text-tertiary/75">La edad se calcula a partir de la fecha de nacimiento.</p>
            </div>
            {children.length > 0 ? (
              <label className="min-w-52">
                <span className={labelClass}>Perfil seleccionado</span>
                <select
                  className={controlClass}
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {children.map((child) => <option key={child.id} value={child.id}>{child.fullName}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          {selectedChild ? (
            <p className="mt-3 inline-flex rounded-full bg-page px-3 py-1 text-sm">
              {calculateAge(selectedChild.birthDate)} años · {selectedChild.grade}
            </p>
          ) : (
            <p className="mt-4 rounded-md bg-page p-3 text-sm">
              Todavía no hay perfiles. Agrega un hijo para organizar sus materias y actividades.
            </p>
          )}
        </section>
        </DashboardModule>

        <div className="grid gap-6 lg:grid-cols-2">
          <DashboardModule id="perfiles">
          <section className={cardClass}>
            <h2 className="text-lg font-semibold">Agregar hijo</h2>
            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleAddChild}>
              <label className="sm:col-span-2"><span className={labelClass}>Nombre completo</span>
                <input className={controlClass} value={childName} onChange={(event) => setChildName(event.target.value)} required minLength={2} maxLength={120} />
              </label>
              <label><span className={labelClass}>Fecha de nacimiento</span>
                <input className={controlClass} type="date" value={childBirthDate} onChange={(event) => setChildBirthDate(event.target.value)} required max={new Date().toISOString().slice(0, 10)} />
              </label>
              <label><span className={labelClass}>Grado</span>
                <input className={controlClass} value={childGrade} onChange={(event) => setChildGrade(event.target.value)} required maxLength={80} placeholder="3° primaria" />
              </label>
              <button className={`${buttonClass} sm:col-span-2`} disabled={busy}>Agregar perfil</button>
            </form>
          </section>
          </DashboardModule>

          <DashboardModule id="perfiles">
          <section className={cardClass}>
            <h2 className="text-lg font-semibold">Información del perfil</h2>
            {selectedChild ? (
              <>
                <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSaveChild}>
                  <label className="sm:col-span-2"><span className={labelClass}>Nombre completo</span>
                    <input className={controlClass} value={editName} onChange={(event) => setEditName(event.target.value)} required minLength={2} maxLength={120} />
                  </label>
                  <label><span className={labelClass}>Fecha de nacimiento</span>
                    <input className={controlClass} type="date" value={editBirthDate} onChange={(event) => setEditBirthDate(event.target.value)} required max={new Date().toISOString().slice(0, 10)} />
                  </label>
                  <label><span className={labelClass}>Grado</span>
                    <input className={controlClass} value={editGrade} onChange={(event) => setEditGrade(event.target.value)} required maxLength={80} />
                  </label>
                  <button className={buttonClass} disabled={busy}>Guardar cambios</button>
                  <button className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700" type="button" disabled={busy} onClick={handleDeleteChild}>Eliminar perfil</button>
                </form>
                <div className="mt-6 border-t border-line pt-4">
                  <h3 className="font-semibold">Acceso del alumno</h3>
                  {selectedChild.user ? (
                    <p className="mt-2 text-sm">
                      Cuenta activa: <span className="font-medium">{selectedChild.user.email}</span>.
                      El alumno puede iniciar sesión desde la pantalla habitual.
                    </p>
                  ) : (
                    <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={handleCreateStudentAccount}>
                      <p className="text-sm text-tertiary/75 sm:col-span-2">
                        Crea credenciales para que {selectedChild.fullName} pueda entrar a su panel.
                      </p>
                      <label className="sm:col-span-2"><span className={labelClass}>Correo del alumno</span>
                        <input className={controlClass} type="email" autoComplete="email" value={studentEmail} onChange={(event) => setStudentEmail(event.target.value)} required maxLength={254} />
                      </label>
                      <label><span className={labelClass}>Contraseña (8+ caracteres, letra y número)</span>
                        <input className={controlClass} type="password" autoComplete="new-password" value={studentPassword} onChange={(event) => setStudentPassword(event.target.value)} required minLength={8} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}" />
                      </label>
                      <label><span className={labelClass}>Confirmar contraseña</span>
                        <input className={controlClass} type="password" autoComplete="new-password" value={studentConfirmPassword} onChange={(event) => setStudentConfirmPassword(event.target.value)} required minLength={8} />
                      </label>
                      <button className={`${buttonClass} sm:col-span-2`} disabled={busy}>Crear cuenta del alumno</button>
                    </form>
                  )}
                </div>
              </>
            ) : <p className="mt-3 text-sm text-tertiary/75">Agrega un hijo para editar su perfil.</p>}
          </section>
          </DashboardModule>
        </div>

        {selectedChild ? (
          <>
            <DashboardModule id="cursos">
            <section id="cursos" className={`${cardClass} scroll-mt-32`}>
              <h2 className="text-lg font-semibold">Materias del alumno</h2>
              <p className="mt-2 text-sm text-tertiary/75">
                Aquí asignas materias como Matemáticas, Ciencias o Español. En esta versión todavía no hay cursos separados por unidades o lecciones.
                Para crear una actividad que el alumno pueda completar, ve a <strong>Tareas y actividades</strong> y asígnale una tarea o un examen interactivo.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedChild.subjects.map((subject) => (
                  <span key={subject.id} className="inline-flex items-center gap-2 rounded-full bg-page px-3 py-1 text-sm">
                    {subject.name}
                    <button type="button" className="font-bold text-accent" aria-label={`Quitar ${subject.name}`} onClick={() => void handleRemoveSubject(subject)}>×</button>
                  </span>
                ))}
                {selectedChild.subjects.length === 0 ? <p className="text-sm text-tertiary/75">Aún no hay materias asignadas.</p> : null}
              </div>
              <form className="mt-4 flex flex-wrap gap-2" onSubmit={handleAssignSubject}>
                <input className={`${controlClass} max-w-sm`} value={subjectName} onChange={(event) => setSubjectName(event.target.value)} required maxLength={80} placeholder="Ej. Matemática" aria-label="Nueva materia" />
                <button className={buttonClass} disabled={busy}>Asignar materia</button>
              </form>
            </section>
            </DashboardModule>

            <DashboardModule id="materiales">
            <section id="materiales" className={`${cardClass} scroll-mt-32`}>
              <h2 className="text-lg font-semibold">Material de apoyo de {selectedChild.fullName}</h2>
              <p className="mt-2 text-sm text-tertiary/75">
                Aquí puedes consultar los materiales que el alumno generó para sus actividades. Las prácticas interactivas se mantienen en su cuenta para que las responda el alumno.
              </p>
              <ul className="mt-4 space-y-3">
                {learningArtifacts.map((artifact) => {
                  const details = artifact.type === 'podcast' || artifact.type === 'video'
                    ? (() => {
                        try {
                          return JSON.parse(artifact.content) as { transcript?: string }
                        } catch {
                          return {}
                        }
                      })()
                    : null
                  const typeLabel = {
                    summary: 'Resumen',
                    practice: 'Práctica',
                    podcast: 'Audio narrado',
                    video: 'Video con diapositivas',
                  }[artifact.type]
                  return (
                    <li key={artifact.id} className="rounded-lg border border-line p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        {typeLabel} · {artifact.subject.name}
                      </p>
                      <h3 className="mt-1 font-semibold">{artifact.title}</h3>
                      {artifact.task ? <p className="mt-1 text-sm text-tertiary/70">Actividad: {artifact.task.title}</p> : null}
                      {artifact.type === 'summary' ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-tertiary/80">{artifact.content}</p>
                      ) : null}
                      {artifact.type === 'practice' ? (
                        <p className="mt-2 text-sm text-tertiary/80">El contenido de las preguntas se muestra en el panel del alumno para que pueda responder sin revelar las respuestas.</p>
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
                {!detailLoading && learningArtifacts.length === 0 ? (
                  <li className="rounded-md bg-page p-4 text-sm text-tertiary/75">Aún no hay materiales. El alumno puede crear uno desde una tarea que tenga materia asignada.</li>
                ) : null}
              </ul>
            </section>
            </DashboardModule>

            <div className="grid gap-6 lg:grid-cols-2">
              <DashboardModule id="horarios">
              <section id="horarios" className={`${cardClass} scroll-mt-32`}>
                <h2 className="text-lg font-semibold">Horario de estudio</h2>
                <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleAddSchedule}>
                  <label><span className={labelClass}>Día</span>
                    <select className={controlClass} value={scheduleDay} onChange={(event) => setScheduleDay(event.target.value)}>
                      {Object.entries(days).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                    </select>
                  </label>
                  <label><span className={labelClass}>Materia (opcional)</span>
                    <select className={controlClass} value={scheduleSubject} onChange={(event) => setScheduleSubject(event.target.value)}>
                      <option value="">Sin materia</option>
                      {selectedChild.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                    </select>
                  </label>
                  <label><span className={labelClass}>Inicio</span>
                    <input className={controlClass} type="time" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} required />
                  </label>
                  <label><span className={labelClass}>Fin</span>
                    <input className={controlClass} type="time" value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} required />
                  </label>
                  <button className={`${buttonClass} sm:col-span-2`} disabled={busy}>Agregar horario</button>
                </form>
                <ul className="mt-4 divide-y divide-line">
                  {schedules.map((schedule) => (
                    <li key={schedule.id} className="py-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>{days[schedule.dayOfWeek]} · {schedule.startTime}–{schedule.endTime}{schedule.subject ? ` · ${schedule.subject.name}` : ''}</span>
                        <button className="text-accent" type="button" onClick={() => void handleDeleteSchedule(schedule.id)}>Eliminar</button>
                      </div>
                      <ScheduleEditor
                        schedule={schedule}
                        subjects={selectedChild.subjects}
                        disabled={busy}
                        onSave={handleUpdateSchedule}
                      />
                    </li>
                  ))}
                  {!detailLoading && schedules.length === 0 ? <li className="py-3 text-sm text-tertiary/75">No hay horarios todavía.</li> : null}
                </ul>
              </section>
              </DashboardModule>

              <DashboardModule id="actividades">
              <section className={cardClass}>
                <h2 className="text-lg font-semibold">Agregar tarea o examen</h2>
                <label className="mt-3 block max-w-sm">
                  <span className={labelClass}>¿Para quién es?</span>
                  <select
                    className={controlClass}
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    aria-label="Perfil que recibirá la tarea"
                  >
                    {children.map((child) => <option key={child.id} value={child.id}>{child.fullName}</option>)}
                  </select>
                </label>
                <p className="mt-2 rounded-lg bg-page p-3 text-sm text-tertiary/75">
                  Se asignará a <strong>{selectedChild.fullName}</strong> · {selectedChild.grade}
                  {selectedChild.user
                    ? <> · Cuenta del alumno: <strong>{selectedChild.user.email}</strong></>
                    : ' · Este perfil aún no tiene una cuenta de alumno para iniciar sesión.'}
                </p>
                <form className="mt-4 grid gap-3" onSubmit={handleAddTask}>
                  <label><span className={labelClass}>Título</span>
                    <input className={controlClass} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} required maxLength={180} />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label><span className={labelClass}>Tipo</span>
                      <select className={controlClass} value={taskType} onChange={(event) => setTaskType(event.target.value as Task['type'])}>
                        {Object.entries(taskTypes).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                      </select>
                    </label>
                    <label><span className={labelClass}>Materia (opcional)</span>
                      <select className={controlClass} value={taskSubject} onChange={(event) => setTaskSubject(event.target.value)}>
                        <option value="">Sin materia</option>
                        {selectedChild.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                      </select>
                    </label>
                  </div>
                  {taskType === 'exam' ? (
                    <label className="flex items-start gap-2 rounded-lg bg-page p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={taskCreateQuiz}
                        onChange={(event) => setTaskCreateQuiz(event.target.checked)}
                        disabled={!taskSubject}
                        className="mt-1"
                      />
                      <span>
                        <strong>Crear cuestionario interactivo</strong>
                        <span className="block text-tertiary/70">
                          Usa preguntas de {selectedChild.grade} y permite que el alumno lo responda aquí.
                          {!taskSubject ? ' Elige una materia para activarlo.' : ''}
                        </span>
                      </span>
                    </label>
                  ) : null}
                  <label><span className={labelClass}>Vencimiento (opcional)</span>
                    <input className={controlClass} type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} />
                  </label>
                  <label><span className={labelClass}>Detalles (opcional)</span>
                    <textarea className={controlClass} rows={2} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} maxLength={10000} />
                  </label>
                  <button className={buttonClass} disabled={busy}>Guardar actividad</button>
                </form>
              </section>
              </DashboardModule>
            </div>

            <DashboardModule id="actividades">
            <section id="actividades" className={`${cardClass} scroll-mt-32`}>
              <h2 className="text-lg font-semibold">Tareas y exámenes</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {tasks.map((task) => (
                  <article key={task.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{taskTypes[task.type]}{task.subject ? ` · ${task.subject.name}` : ''}</p>
                        <h3 className="mt-1 font-semibold">{task.title}</h3>
                        {task.isQuiz ? <p className="mt-1 text-sm font-medium text-primary">📝 Cuestionario interactivo</p> : null}
                        {task.reviewedAt ? <p className="mt-1 text-sm text-success">Revisada · +5 puntos</p> : null}
                        {task.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-tertiary/80">{task.description}</p> : null}
                        {task.dueAt ? <p className="mt-2 text-sm">Vence: {new Date(task.dueAt).toLocaleString('es')}</p> : null}
                      </div>
                      <button type="button" className="text-sm text-accent" onClick={() => void handleDeleteTask(task)}>Eliminar</button>
                    </div>
                    <label className="mt-3 block max-w-xs">
                      <span className={labelClass}>Estado</span>
                      <select className={controlClass} value={task.status} onChange={(event) => void handleTaskStatus(task, event.target.value as Task['status'])}>
                        {Object.entries(taskStatuses).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                      </select>
                    </label>
                    {task.status === 'completed' && !task.reviewedAt ? (
                      <button
                        type="button"
                        className={`${buttonClass} mt-3`}
                        disabled={busy}
                        onClick={() => void handleReviewTask(task)}
                      >
                        Revisar tarea · dar 5 puntos
                      </button>
                    ) : null}
                    <TaskEditor
                      task={task}
                      subjects={selectedChild.subjects}
                      disabled={busy}
                      onSave={handleSaveTask}
                    />
                    <ul className="mt-3 space-y-1">
                      {task.attachments.map((file) => (
                        <li key={file.id} className="flex flex-wrap items-center gap-3 text-sm">
                          <a
                            className="font-medium text-primary underline"
                            href={`/api/families/me/children/${selectedChild.id}/tasks/${task.id}/attachments/${file.id}`}
                          >
                            {file.originalName}
                          </a>
                          <button type="button" className="text-accent" onClick={() => void handleDeleteAttachment(task, file)}>Quitar archivo</button>
                        </li>
                      ))}
                    </ul>
                    <label className="mt-3 block text-sm">
                      <span className="sr-only">Adjuntar PDF o imagen</span>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        disabled={busy}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          void handleUpload(task, file)
                          event.target.value = ''
                        }}
                        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-page file:px-3 file:py-2 file:font-semibold file:text-tertiary"
                      />
                      <span className="mt-1 block text-xs text-tertiary/70">PDF, JPG, PNG o WebP · máximo 10 MB por archivo.</span>
                    </label>
                  </article>
                ))}
                {!detailLoading && tasks.length === 0 ? <p className="text-sm text-tertiary/75">No hay actividades registradas.</p> : null}
              </div>
            </section>
            </DashboardModule>

            <div className="grid gap-6 lg:grid-cols-2">
              <DashboardModule id="evaluaciones">
              <section id="evaluaciones" className={`${cardClass} scroll-mt-32`}>
                <h2 className="text-lg font-semibold">Resultados obtenidos</h2>
                <p className="mt-2 text-sm text-tertiary/75">
                  Las calificaciones se registran automáticamente cuando el alumno entrega una práctica o un cuestionario. Cada resultado se expresa sobre 100; no se pueden inventar ni asignar notas desde aquí.
                </p>
                <ul className="mt-4 divide-y divide-line">
                  {evaluations.map((evaluation) => {
                    const percentage = (Number(evaluation.score) / Number(evaluation.maxScore)) * 100
                    return (
                      <li key={evaluation.id} className="py-3">
                        <div className="flex justify-between gap-3 text-sm">
                          <span className="font-medium">{evaluation.title} · {evaluation.subject.name}</span>
                          <span>{percentage.toFixed(0)}/100</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-page">
                          <div className="h-full bg-secondary" style={{ width: `${Math.min(percentage, 100)}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-tertiary/70">{new Date(evaluation.evaluatedAt).toLocaleDateString('es')}</p>
                      </li>
                    )
                  })}
                  {!detailLoading && evaluations.length === 0 ? <li className="py-3 text-sm text-tertiary/75">Aún no hay resultados para mostrar.</li> : null}
                </ul>
              </section>
              </DashboardModule>

              <DashboardModule id="configuracion">
              <section className={cardClass}>
                <h2 className="text-lg font-semibold">Notificaciones y estudio</h2>
                <form className="mt-4 space-y-4" onSubmit={handleSavePreferences}>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={preferences.emailSummary}
                      onChange={(event) => setPreferences((current) => ({ ...current, emailSummary: event.target.checked }))}
                      className="h-4 w-4 accent-primary"
                    />
                    Recibir resúmenes por correo cuando el servicio esté disponible
                  </label>
                  <label className="block max-w-xs">
                    <span className={labelClass}>Hora preferida para recordatorios</span>
                    <input
                      className={controlClass}
                      type="time"
                      value={preferences.reminderTime ?? ''}
                      onChange={(event) => setPreferences((current) => ({ ...current, reminderTime: event.target.value || null }))}
                    />
                  </label>
                  <p className="text-xs text-tertiary/70">En esta fase guardamos tus preferencias; el envío de correos se habilitará más adelante.</p>
                  <button className={buttonClass} disabled={busy}>Guardar preferencias</button>
                </form>
              </section>
              </DashboardModule>
            </div>
          </>
        ) : null}
    </DashboardLayout>
  )
}
