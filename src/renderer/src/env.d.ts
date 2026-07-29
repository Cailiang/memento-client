/// <reference types="vite/client" />

import type { MementoApi } from '../../shared/types'

declare global {
  const __MEMENTO_VERSION__: string

  interface Window {
    memento?: MementoApi
  }
}

export {}
