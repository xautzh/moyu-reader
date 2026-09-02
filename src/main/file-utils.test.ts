import { describe, expect, it } from 'vitest'
import { isMarkdownFile, pickMarkdownArgument, sanitizeRecentFiles } from './file-utils'

describe('isMarkdownFile', () => {
  it.each(['README.md', 'guide.MARKDOWN', 'notes.mdown', 'draft.mkd'])(
    'accepts supported Markdown file %s',
    (filePath) => expect(isMarkdownFile(filePath)).toBe(true)
  )

  it.each(['photo.png', 'document.txt', 'README'])('rejects unsupported file %s', (filePath) =>
    expect(isMarkdownFile(filePath)).toBe(false)
  )
})

describe('pickMarkdownArgument', () => {
  it('returns the first Markdown path and ignores switches and the executable', () => {
    const argv = ['墨阅.exe', '--flag', 'D:\\docs\\readme.md', 'other.md']
    expect(pickMarkdownArgument(argv)).toBe('D:\\docs\\readme.md')
  })

  it('returns undefined when no Markdown path exists', () => {
    expect(pickMarkdownArgument(['墨阅.exe', '--flag'])).toBeUndefined()
  })
})

describe('sanitizeRecentFiles', () => {
  it('deduplicates paths case-insensitively, removes malformed rows, sorts, and caps the list', () => {
    const rows = [
      { path: 'D:\\Docs\\A.md', name: 'A.md', lastOpenedAt: 2 },
      { path: 'd:\\docs\\a.md', name: 'A newer.md', lastOpenedAt: 4 },
      { path: 'D:\\Docs\\B.md', name: 'B.md', lastOpenedAt: 3 },
      { path: '', name: 'invalid', lastOpenedAt: 9 },
      null
    ]

    expect(sanitizeRecentFiles(rows, 2)).toEqual([
      { path: 'd:\\docs\\a.md', name: 'A newer.md', lastOpenedAt: 4 },
      { path: 'D:\\Docs\\B.md', name: 'B.md', lastOpenedAt: 3 }
    ])
  })
})
