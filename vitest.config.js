import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Run in Node — db.js uses better-sqlite3 (native) and the 'electron' mock
    environment: 'node',
    include: ['src/main/__tests__/**/*.test.js', 'src/renderer/src/__tests__/**/*.test.js'],
    // Several suites dynamically import() tab components, so the first one pays for
    // Vite transforming a large JSX module. That runs ~600ms idle but has been seen
    // near 10s on a loaded machine, which made the 5s default flake in CI.
    testTimeout: 15000,
  },
})
