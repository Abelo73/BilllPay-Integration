import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Ports are non-default on purpose; see ../.env.example
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, path.resolve(import.meta.dirname, '..'), '') }
  const port = Number(env.FRONTEND_PORT ?? 5280)
  const backend = `http://localhost:${env.BACKEND_PORT ?? 8181}`
  // Running from WSL on a Windows drive (/mnt/c/...): file events don't arrive, so poll for edits
  const onWindowsDriveFromWsl = process.platform === 'linux' && import.meta.dirname.startsWith('/mnt/')
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: {
      port,
      strictPort: true,
      proxy: { '/api': backend },
      watch: onWindowsDriveFromWsl ? { usePolling: true, interval: 300 } : undefined,
    },
    preview: { port, strictPort: true },
  }
})
