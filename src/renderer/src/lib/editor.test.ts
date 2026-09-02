import { describe, expect, it } from 'vitest'
import {
  applyMarkdownEdit,
  editorMarkdownToFileMarkdown,
  fileMarkdownToEditorMarkdown,
  shouldRestoreDraft
} from './editor'

describe('Markdown image source conversion', () => {
  const baseUrl = 'moyu-file://asset/folder-token/'

  it('converts relative images for the secure editor protocol and restores portable paths', () => {
    const source = '# 图示\n\n![流程](images/flow chart.png)\n'
    const editorMarkdown = fileMarkdownToEditorMarkdown(source, baseUrl)

    expect(editorMarkdown).toContain(
      '![流程](moyu-file://asset/folder-token/images/flow%20chart.png)'
    )
    expect(editorMarkdownToFileMarkdown(editorMarkdown, baseUrl)).toBe(source)
  })

  it('leaves web and data URLs unchanged', () => {
    const source = '![A](https://example.com/a.png)\n![B](data:image/png;base64,abc)'
    expect(fileMarkdownToEditorMarkdown(source, baseUrl)).toBe(source)
  })
})

describe('applyMarkdownEdit', () => {
  it('wraps selected text and keeps the inner selection', () => {
    expect(applyMarkdownEdit('hello world', 6, 11, 'bold')).toEqual({
      value: 'hello **world**',
      selectionStart: 8,
      selectionEnd: 13
    })
  })

  it('turns the current line into a heading without stacking heading markers', () => {
    expect(applyMarkdownEdit('first\n# title\nlast', 10, 10, 'heading-2').value).toBe(
      'first\n## title\nlast'
    )
  })

  it('inserts useful table, math and mermaid templates', () => {
    expect(applyMarkdownEdit('', 0, 0, 'table').value).toContain('| 列 1 | 列 2 |')
    expect(applyMarkdownEdit('', 0, 0, 'math-block').value).toContain('$$')
    expect(applyMarkdownEdit('', 0, 0, 'mermaid').value).toContain('```mermaid')
  })
})

describe('shouldRestoreDraft', () => {
  it('offers a newer non-empty draft but not a stale copy', () => {
    const document = { modifiedAt: 1_000, content: 'disk' }
    expect(
      shouldRestoreDraft({ updatedAt: 2_000, content: 'draft', filePath: 'a.md' }, document)
    ).toBe(true)
    expect(
      shouldRestoreDraft({ updatedAt: 900, content: 'draft', filePath: 'a.md' }, document)
    ).toBe(false)
    expect(
      shouldRestoreDraft({ updatedAt: 2_000, content: 'disk', filePath: 'a.md' }, document)
    ).toBe(false)
  })
})
