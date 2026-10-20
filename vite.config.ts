import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // Listen on all network interfaces (allows mobile access on same Wi-Fi)
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
