import { useAuth } from '../auth/AuthContext'
import { ParentDashboard } from './ParentDashboard'
import { StudentDashboard } from './StudentDashboard'

export function HomePage() {
  const { user } = useAuth()
  return user?.role === 'student' ? <StudentDashboard /> : <ParentDashboard />
}
