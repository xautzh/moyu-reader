import { describe, expect, it } from 'vitest'
import { formatShortcut, revealInFolderLabel } from './platform'

describe('platform UI helpers', () => {
  it('uses Command symbols and Finder wording on macOS', () => {
    expect(formatShortcut('darwin', 'F')).toBe('⌘F')
    expect(revealInFolderLabel('darwin')).toBe('在 Finder 中显示')
  })

  it('keeps Ctrl shortcuts and Explorer wording on Windows', () => {
    expect(formatShortcut('win32', 'F')).toBe('Ctrl+F')
    expect(revealInFolderLabel('win32')).toBe('在资源管理器中显示')
  })
})
