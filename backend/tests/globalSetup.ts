import 'dotenv/config'
import { execSync } from 'node:child_process'
import pg from 'pg'

const configuredDatabaseUrl = process.env.DATABASE_URL
const defaultTestUrl = configuredDatabaseUrl
  ? new URL('/aischool_test', configuredDatabaseUrl).toString()
  : 'postgresql://localhost:5432/aischool_test'

export default async function setup() {
  const effectiveTestUrl = process.env.TEST_DATABASE_URL ?? defaultTestUrl
  const effectiveAdminUrl =
    process.env.TEST_ADMIN_DATABASE_URL ?? new URL('/postgres', effectiveTestUrl).toString()
  const admin = new pg.Client({ connectionString: effectiveAdminUrl })
  await admin.connect()
  const testDatabaseName = decodeURIComponent(new URL(effectiveTestUrl).pathname.slice(1))
  const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDatabaseName])
  if (found.rowCount === 0) {
    const quotedDatabaseName = `"${testDatabaseName.replace(/"/g, '""')}"`
    await admin.query(`CREATE DATABASE ${quotedDatabaseName}`)
  }
  await admin.end()

  execSync('pnpm exec prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: effectiveTestUrl },
    stdio: 'inherit',
  })
}
