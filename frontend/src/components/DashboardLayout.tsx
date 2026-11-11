import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type DashboardNavItem = {
  id: string
  label: string
  href?: string
}

type DashboardModuleContextValue = {
  activeId: string
  setActiveId: (id: string) => void
}

const ActiveDashboardModule = createContext<DashboardModuleContextValue | null>(null)

const playfulIcons: Record<string, string> = {
  inicio: '🏠',
  avisos: '🔔',
  cursos: '📚',
  actividades: '🧩',
  horario: '📅',
  horarios: '📅',
  practica: '🎯',
  tutor: '🤖',
  resultados: '🏆',
  materiales: '🎨',
  seguimiento: '🌱',
  perfiles: '🙂',
  configuracion: '⚙️',
}
const familyIcons: Record<string, string> = {
  inicio: '🏠',
  seguimiento: '📊',
  perfiles: '👪',
  cursos: '📘',
  horarios: '🗓️',
  actividades: '☑️',
  evaluaciones: '📈',
  materiales: '📁',
  configuracion: '⚙️',
}

export function DashboardModule({ id, children }: { id: string; children: ReactNode }) {
  const context = useContext(ActiveDashboardModule)
  if (!context) throw new Error('DashboardModule debe usarse dentro de DashboardLayout')
  return context.activeId === id ? children : null
}

export function DashboardModuleAction({
  id,
  onClick,
  className,
  children,
}: {
  id: string
  onClick?: () => void
  className: string
  children: ReactNode
}) {
  const context = useContext(ActiveDashboardModule)
  if (!context) throw new Error('DashboardModuleAction debe usarse dentro de DashboardLayout')

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onClick?.()
        context.setActiveId(id)
      }}
    >
      {children}
    </button>
  )
}

function Navigation({
  items,
  activeId,
  onSelect,
  horizontal = false,
  playful = false,
  family = false,
}: {
  items: DashboardNavItem[]
  activeId: string
  onSelect: (id: string) => void
  horizontal?: boolean
  playful?: boolean
  family?: boolean
}) {
  return (
    <nav aria-label="Secciones del espacio">
      <ul className={horizontal ? 'flex min-w-max gap-2' : 'space-y-1'}>
        {items.map((item) => (
          <li key={item.id}>
            {item.href ? (
              <Link
                to={item.href}
                aria-current={activeId === item.id ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  activeId === item.id
                    ? playful
                      ? 'student-nav-item-active bg-[#eaf1f6] text-[#315b78]'
                      : family ? 'family-nav-item-active text-tertiary' : 'bg-primary text-white shadow-sm'
                    : playful
                      ? 'student-nav-item text-tertiary/80 hover:bg-white/80 hover:text-tertiary'
                      : family
                        ? activeId === item.id ? 'family-nav-item-active text-tertiary' : 'family-nav-item text-tertiary/80'
                        : 'text-tertiary/75 hover:bg-page hover:text-tertiary'
                }`}
              >
                {playful
                  ? <span aria-hidden="true" className="student-nav-icon">{playfulIcons[item.id] ?? '✨'}</span>
                  : family
                    ? <span aria-hidden="true" className="family-nav-icon">{familyIcons[item.id] ?? '•'}</span>
                    : <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeId === item.id ? 'bg-white' : 'bg-primary/40'}`} />}
                {item.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={activeId === item.id ? 'location' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                  activeId === item.id
                    ? playful
                      ? 'student-nav-item-active bg-[#eaf1f6] text-[#315b78]'
                      : family ? 'family-nav-item-active text-tertiary' : 'bg-primary text-white shadow-sm'
                    : playful
                      ? 'student-nav-item text-tertiary/80 hover:bg-white/80 hover:text-tertiary'
                      : family
                        ? activeId === item.id ? 'family-nav-item-active text-tertiary' : 'family-nav-item text-tertiary/80'
                        : 'text-tertiary/75 hover:bg-page hover:text-tertiary'
                }`}
              >
                {playful
                  ? <span aria-hidden="true" className="student-nav-icon">{playfulIcons[item.id] ?? '✨'}</span>
                  : family
                    ? <span aria-hidden="true" className="family-nav-icon">{familyIcons[item.id] ?? '•'}</span>
                    : <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeId === item.id ? 'bg-white' : 'bg-primary/40'}`} />}
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function DashboardLayout({
  brand,
  description,
  items,
  children,
}: {
  brand: string
  description: string
  items: DashboardNavItem[]
  children: ReactNode
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')
  const playful = brand === 'Espacio del alumno' || brand === 'Tutor de estudio'
  const family = brand === 'Espacio familiar'

  useEffect(() => {
    if (!items.some((item) => item.id === activeId)) {
      setActiveId(items[0]?.id ?? '')
    }
  }, [items, activeId])

  return (
    <div className={`min-h-screen text-tertiary lg:flex ${playful ? 'student-dashboard' : family ? 'family-dashboard' : 'bg-page'}`}>
      <aside className={`sticky top-0 z-20 hidden h-screen w-64 shrink-0 flex-col border-r px-5 py-6 lg:flex ${playful ? 'student-sidebar border-white/70 bg-white/75 backdrop-blur-xl' : family ? 'family-sidebar border-white/70 bg-white/80 backdrop-blur-xl' : 'border-line bg-card'}`}>
        <button
          type="button"
          onClick={() => setActiveId(items.some((item) => item.id === 'inicio') ? 'inicio' : items[0]?.id ?? '')}
          className="mb-8 flex items-center gap-3 rounded-xl text-left"
        >
          <span className={`grid h-11 w-11 place-items-center rounded-2xl text-lg font-bold text-white ${playful ? 'student-brand-mark bg-[#4b83a5]' : family ? 'family-brand-mark' : 'bg-primary'}`}>A</span>
          <span>
            <span className="block font-bold tracking-tight text-tertiary">AIschool</span>
            <span className="block text-xs text-tertiary/60">{playful ? '¡Aprender es una aventura!' : family ? 'Acompañamiento en equipo' : brand}</span>
          </span>
        </button>
        <p className="mb-3 px-3 text-xs font-bold uppercase tracking-wider text-tertiary/50">{playful ? '¿Qué hacemos hoy?' : family ? 'Administración familiar' : 'Secciones'}</p>
        <Navigation items={items} activeId={activeId} onSelect={setActiveId} playful={playful} family={family} />
        <div className={`mt-auto rounded-2xl p-4 ${playful ? 'student-sidebar-note bg-[#f1f5f8]' : family ? 'family-sidebar-note' : 'rounded-xl bg-page'}`}>
          <p className="text-sm font-semibold">{playful ? 'Vas muy bien 🌟' : family ? 'Todo en un mismo lugar' : brand}</p>
          <p className="mt-1 text-xs leading-relaxed text-tertiary/65">{description}</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className={`sticky top-0 z-20 border-b px-4 py-3 backdrop-blur lg:hidden ${playful ? 'student-mobile-header border-white/70 bg-white/85' : family ? 'family-mobile-header border-white/70 bg-white/90' : 'border-line bg-card/95'}`}>
          <button
            type="button"
            onClick={() => setActiveId(items.some((item) => item.id === 'inicio') ? 'inicio' : items[0]?.id ?? '')}
            className="mb-3 flex items-center gap-2"
          >
            <span className={`grid h-8 w-8 place-items-center rounded-xl font-bold text-white ${playful ? 'student-brand-mark bg-[#4b83a5]' : family ? 'family-brand-mark' : 'bg-primary'}`}>A</span>
            <span className="font-bold">AIschool</span>
            <span className="text-sm text-tertiary/60">· {brand}</span>
          </button>
          <div className="dashboard-nav-scrollbar overflow-x-auto pb-1">
            <Navigation items={items} activeId={activeId} onSelect={setActiveId} horizontal playful={playful} family={family} />
          </div>
        </div>
        <main className={`px-4 py-6 md:px-8 lg:py-8 ${playful ? 'student-main' : family ? 'family-main' : ''}`}>
          <ActiveDashboardModule.Provider value={{ activeId, setActiveId }}>
            <div className="mx-auto max-w-6xl space-y-6">{children}</div>
          </ActiveDashboardModule.Provider>
        </main>
      </div>
    </div>
  )
}
