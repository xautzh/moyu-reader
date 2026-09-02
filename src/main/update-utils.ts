import type { AppUpdateState } from '../shared/types'

export type UpdateSupport = { enabled: true } | { enabled: false; reason: string }

export function updateSupport(isPackaged: boolean, platform: NodeJS.Platform): UpdateSupport {
  if (!isPackaged) {
    return { enabled: false, reason: '开发模式不会连接正式更新源。' }
  }
  if (platform !== 'win32') {
    return { enabled: false, reason: 'macOS 自动更新将在应用完成代码签名后启用。' }
  }
  return { enabled: true }
}

export function createInitialUpdateState(
  currentVersion: string,
  isPackaged: boolean,
  platform: NodeJS.Platform
): AppUpdateState {
  const support = updateSupport(isPackaged, platform)
  return support.enabled
    ? { status: 'idle', currentVersion }
    : { status: 'unsupported', currentVersion, message: support.reason }
}

export function normalizeUpdateProgress(percent: number): number {
  return Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10
}

export function readableUpdateError(error: unknown): string {
  if (!(error instanceof Error) || !error.message) {
    return '更新服务暂时不可用，请稍后重试。'
  }
  const firstLine = error.message.split(/\r?\n/, 1)[0].trim()
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine
}
