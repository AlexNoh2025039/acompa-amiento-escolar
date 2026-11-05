import { AppError } from '../../lib/errors'
import { prisma } from '../../lib/prisma'

export async function getStudentChild(userId: string, familyId: string) {
  const child = await prisma.child.findFirst({
    where: { userId, familyId },
    include: {
      subjects: { include: { subject: true } },
      schedule: { include: { subject: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
    },
  })
  if (!child) {
    throw new AppError(403, 'STUDENT_PROFILE_MISSING', 'Tu cuenta no tiene un perfil de alumno activo')
  }
  return child
}
