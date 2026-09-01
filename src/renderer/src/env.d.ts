/// <reference types="vite/client" />

import type { MoyuApi } from '../../shared/types'

declare global {
  interface Window {
    moyu: MoyuApi
  }
}
