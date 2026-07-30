import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/admin': {
        target: 'https://YOUR_ENV_ID.sh.run.app',
        changeOrigin: true
      }
    }
  }
})
