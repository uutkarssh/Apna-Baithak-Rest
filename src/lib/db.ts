import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Turso / libSQL connection — adapter takes a config object { url, authToken }
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL!
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined
  const adapter = new PrismaLibSQL({ url, authToken })
  return new PrismaClient({ adapter, log: ['error', 'warn'] })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
