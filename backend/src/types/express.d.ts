import type { Role } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        familyId: string
        role: Role
        email: string
        fullName: string
      }
    }
  }
}

export {}
