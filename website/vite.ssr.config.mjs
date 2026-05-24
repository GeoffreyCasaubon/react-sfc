import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import rsfc from '@g-casau/rsfc-vite-plugin'

export default defineConfig({
  base: '/react-sfc/',
  plugins: [rsfc(), react()],
  build: {
    ssr: 'src/entry-server.tsx',
    outDir: 'dist-ssr',
    rollupOptions: { output: { format: 'esm' } },
  },
})
