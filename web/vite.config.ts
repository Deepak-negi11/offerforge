import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Keep the browser's Host header so the API's same-origin check sees localhost:5174 on both sides.
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
})
