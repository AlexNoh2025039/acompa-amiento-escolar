import type { ReactNode } from 'react'

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-card shadow-sm">
        <div className="h-1.5 bg-secondary" />
        <div className="space-y-6 p-8">
          <header className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Acompañamiento escolar</p>
            <h1 className="text-2xl font-semibold text-tertiary">{title}</h1>
            <p className="text-sm text-tertiary/80">{subtitle}</p>
          </header>
          {children}
        </div>
      </section>
    </main>
  )
}
