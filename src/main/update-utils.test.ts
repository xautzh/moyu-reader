import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createInitialUpdateState, normalizeUpdateProgress, updateSupport } from './update-utils'

describe('update bridge configuration', () => {
  it('enables automatic updates only for packaged Windows builds', () => {
    expect(updateSupport(true, 'win32')).toEqual({ enabled: true })
    expect(updateSupport(false, 'win32')).toEqual({
      enabled: false,
      reason: '开发模式不会连接正式更新源。'
    })
    expect(updateSupport(true, 'darwin')).toEqual({
      enabled: false,
      reason: 'macOS 自动更新将在应用完成代码签名后启用。'
    })
  })

  it('creates a stable initial state and clamps download progress', () => {
    expect(createInitialUpdateState('2.0.1', true, 'win32')).toEqual({
      status: 'idle',
      currentVersion: '2.0.1'
    })
    expect(normalizeUpdateProgress(-5)).toBe(0)
    expect(normalizeUpdateProgress(38.456)).toBe(38.5)
    expect(normalizeUpdateProgress(120)).toBe(100)
  })

  it('publishes update metadata with ASCII artifact names that GitHub preserves', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

    expect(packageJson.version).toBe('2.0.1')
    expect(packageJson.dependencies['electron-updater']).toBeTruthy()
    expect(packageJson.build.publish).toEqual([
      { provider: 'github', owner: 'xautzh', repo: 'moyu-reader' }
    ])
    expect(packageJson.build.win.artifactName).toBe(`Moyu-\${version}-Windows.\${ext}`)
    expect(packageJson.build.mac.artifactName).toBe(`Moyu-\${version}-macOS-\${arch}.\${ext}`)
  })
})
