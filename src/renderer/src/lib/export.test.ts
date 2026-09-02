import { describe, expect, it } from 'vitest'
import { buildStandaloneHtml } from './export'

describe('buildStandaloneHtml', () => {
  it('escapes the document title and converts secure local asset URLs to relative paths', () => {
    const html = buildStandaloneHtml(
      'A < B',
      '<h1>Hello</h1><img src="moyu-file://asset/token/assets/chart.png">',
      'moyu-file://asset/token/',
      'light'
    )
    expect(html).toContain('<title>A &lt; B</title>')
    expect(html).toContain('src="assets/chart.png"')
    expect(html).not.toContain('moyu-file://')
  })

  it('emits a complete UTF-8 document with the selected color scheme', () => {
    const html = buildStandaloneHtml('笔记', '<p>正文</p>', '', 'dark')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('color-scheme: dark')
    expect(html).toContain('<p>正文</p>')
  })
})
