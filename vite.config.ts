import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Базовый путь задаёт скрипт сборки GitHub Pages; локально сайт открывается с корня
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', globals: false, include: ['src/**/*.test.ts?(x)'] },
})
