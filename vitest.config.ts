import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // '**/e2e/**' is the second layer of the Playwright/Vitest split. Specs are
    // named *.e2e.ts, which Vitest's default include cannot match anyway, so
    // this exists to catch the obvious mistake: a future e2e/foo.test.ts.
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**', '**/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
