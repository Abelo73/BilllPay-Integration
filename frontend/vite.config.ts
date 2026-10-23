import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Ports are non-default on purpose; see ../.env.example
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, path.resolve(import.meta.dirname, '..'), '') }
  const port = Number(env.FRONTEND_PORT ?? 5280)
  const backend = `http://localhost:${env.BACKEND_PORT ?? 8181}`
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: {
      port,
      strictPort: true,
      proxy: { '/api': backend },
    },
    preview: { port, strictPort: true },
  }
})
