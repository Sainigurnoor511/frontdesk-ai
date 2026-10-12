import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Worktrees hold other branches' copies of these same test files; collecting
    // them from a root run makes the suite's pass/fail count meaningless.
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**', '**/.worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
