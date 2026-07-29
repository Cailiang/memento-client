import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appVersion = (JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }).version

export default defineConfig({
  root: resolve('src/renderer'),
  define: {
    __MEMENTO_VERSION__: JSON.stringify(appVersion)
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react()]
})
