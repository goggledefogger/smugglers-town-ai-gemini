import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      '@smugglers-town/shared-utils': path.resolve(__dirname, '../shared-utils/src'),
      '@smugglers-town/shared-schemas': path.resolve(__dirname, '../shared-schemas/src'),
    },
  },
  server: {
    port: 3000, // Match the port used in the reference repo if desired
  }
})
