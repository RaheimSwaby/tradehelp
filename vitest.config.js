import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The prop-firm parity test imports mobile TypeScript. mobile/tsconfig.json extends
  // Expo's base config, which isn't installed at the repo root, so hand esbuild a
  // literal tsconfig instead of letting it resolve that file.
  esbuild: { tsconfigRaw: '{}' },
  test: {
    // Run in Node — db.js uses better-sqlite3 (native) and the 'electron' mock
    environment: 'node',
    include: ['src/main/__tests__/**/*.test.js', 'src/renderer/src/__tests__/**/*.test.js', 'packages/core/test/**/*.test.js'],
    // Several suites dynamically import() tab components, so the first one pays for
    // Vite transforming a large JSX module. That runs ~600ms idle but has been seen
    // near 10s on a loaded machine, which made the 5s default flake in CI.
    testTimeout: 15000,
  },
})
