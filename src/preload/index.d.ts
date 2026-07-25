import type { MementoApi } from '../shared/types'

declare global {
  interface Window {
    memento?: MementoApi
  }
}

export {}
