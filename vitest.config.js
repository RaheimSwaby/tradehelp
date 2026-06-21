import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Run in Node — db.js uses better-sqlite3 (native) and the 'electron' mock
    environment: 'node',
    include: ['src/main/__tests__/**/*.test.js'],
  },
})
