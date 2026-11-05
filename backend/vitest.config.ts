import 'dotenv/config'
import { defineConfig } from 'vitest/config'

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL
    ? new URL('/aischool_test', process.env.DATABASE_URL).toString()
    : 'postgresql://localhost:5432/aischool_test')

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: './tests/globalSetup.ts',
    env: {
      DATABASE_URL: testDatabaseUrl,
      JWT_ACCESS_SECRET: 'test-access-secret-must-be-32-chars-min',
      JWT_REFRESH_SECRET: 'test-refresh-secret-must-be-32-chars-min',
      CLIENT_ORIGIN: 'http://localhost:5173',
      NODE_ENV: 'test',
    },
  },
})
