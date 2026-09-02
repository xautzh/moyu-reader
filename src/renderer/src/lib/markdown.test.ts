import { describe, expect, it } from 'vitest'
import { estimateReadingStats, extractOutline, resolveImageSource } from './markdown'

describe('extractOutline', () => {
  it('extracts real headings, strips formatting, and creates stable unique slugs', () => {
    const markdown = [
      '# 开始 **阅读**',
      '',
      '## Install `now`',
      '## Install now',
      '',
      '```md',
      '# fenced heading',
      '```'
    ].join('\n')

    expect(extractOutline(markdown)).toEqual([
      { depth: 1, text: '开始 阅读', id: '开始-阅读' },
      { depth: 2, text: 'Install now', id: 'install-now' },
      { depth: 2, text: 'Install now', id: 'install-now-1' }
    ])
  })

  it('returns an empty outline for documents without headings', () => {
    expect(extractOutline('Just a paragraph.')).toEqual([])
  })

  it('ignores YAML front matter fields when building the outline', () => {
    const markdown = '---\ntitle: Hidden metadata\ncategory: Internal\n---\n\n# Visible title\n'

    expect(extractOutline(markdown)).toEqual([
      { depth: 1, text: 'Visible title', id: 'visible-title' }
    ])
  })
})

describe('estimateReadingStats', () => {
  it('counts CJK characters and Latin words without counting markdown punctuation', () => {
    const stats = estimateReadingStats('# 标题\n\n这是正文。 Hello world!')

    expect(stats.characters).toBe(16)
    expect(stats.words).toBe(8)
    expect(stats.minutes).toBe(1)
    expect(stats.lines).toBe(3)
  })

  it('excludes YAML front matter from reading statistics while retaining physical line count', () => {
    const stats = estimateReadingStats('---\nsecret: hidden words\n---\n\nVisible words.')

    expect(stats.words).toBe(2)
    expect(stats.lines).toBe(5)
  })
})

describe('resolveImageSource', () => {
  const baseUrl = 'moyu-file://asset/encoded-folder/'

  it('resolves local relative image paths against the document asset URL', () => {
    expect(resolveImageSource('./images/cover 1.png', baseUrl)).toBe(
      'moyu-file://asset/encoded-folder/images/cover%201.png'
    )
  })

  it.each(['https://example.com/a.png', 'data:image/png;base64,abc'])(
    'keeps already absolute source %s unchanged',
    (source) => {
      expect(resolveImageSource(source, baseUrl)).toBe(source)
    }
  )
})
