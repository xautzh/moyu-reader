import { describe, expect, it } from 'vitest'
import {
  collectRelativeImageSources,
  ensureMarkdownExtension,
  hasExternalChange,
  nextAvailableAssetName,
  rewriteMarkdownImageSources,
  sanitizeAssetFileName
} from './editor-utils'

describe('ensureMarkdownExtension', () => {
  it('adds .md only when a supported extension is missing', () => {
    expect(ensureMarkdownExtension('D:\\notes\\draft')).toBe('D:\\notes\\draft.md')
    expect(ensureMarkdownExtension('D:\\notes\\draft.markdown')).toBe('D:\\notes\\draft.markdown')
  })
})

describe('hasExternalChange', () => {
  it('detects a newer disk revision and ignores sub-millisecond timestamp noise', () => {
    expect(hasExternalChange(1_000, 1_000.4)).toBe(false)
    expect(hasExternalChange(1_000, 1_010)).toBe(true)
  })
})

describe('asset names', () => {
  it('keeps unicode names, removes unsafe characters and normalizes the extension', () => {
    expect(sanitizeAssetFileName(' 屏幕 截图 (1).PNG ')).toBe('屏幕-截图-1.png')
    expect(sanitizeAssetFileName('..\\evil?.svg')).toBe('evil.svg')
  })

  it('creates a deterministic non-conflicting file name', () => {
    const existing = new Set(['diagram.png', 'diagram-2.png'])
    expect(nextAvailableAssetName('diagram.png', existing)).toBe('diagram-3.png')
  })
})

describe('Markdown image sources', () => {
  it('collects local image sources without including remote or data URLs', () => {
    const markdown = [
      '![local](./images/a.png)',
      '![remote](https://example.com/a.png)',
      '![inline](data:image/png;base64,AAAA)',
      '[diagram]: assets/diagram.svg "Diagram"'
    ].join('\n')
    expect(collectRelativeImageSources(markdown)).toEqual(['./images/a.png', 'assets/diagram.svg'])
  })

  it('rewrites image and reference sources while preserving labels and titles', () => {
    const replacements = new Map([
      ['./images/a.png', 'assets/a-2.png'],
      ['assets/diagram.svg', 'assets/diagram-2.svg']
    ])
    const markdown = '![截图](./images/a.png "标题")\n[diagram]: assets/diagram.svg "图表"'
    expect(rewriteMarkdownImageSources(markdown, replacements)).toBe(
      '![截图](assets/a-2.png "标题")\n[diagram]: assets/diagram-2.svg "图表"'
    )
  })
})
