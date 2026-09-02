export type MarkdownEditCommand =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inline-code'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'quote'
  | 'link'
  | 'image'
  | 'code-block'
  | 'table'
  | 'math-inline'
  | 'math-block'
  | 'mermaid'

export interface MarkdownEditResult {
  value: string
  selectionStart: number
  selectionEnd: number
}

interface DraftLike {
  filePath?: string
  updatedAt: number
  content: string
}

interface DocumentLike {
  modifiedAt: number
  content: string
}

function mapImageSources(markdown: string, mapSource: (source: string) => string): string {
  const inlineImages = markdown.replace(
    /(!\[[^\]]*\]\(\s*)([^)\n]+?)(\s*\))/g,
    (match, prefix: string, inner: string, suffix: string) => {
      const trimmed = inner.trim()
      const wrapped = trimmed.startsWith('<') && trimmed.endsWith('>')
      const rawValue = wrapped ? trimmed.slice(1, -1) : trimmed
      const titleMatch = rawValue.match(/^(\S+?)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))$/)
      const source = titleMatch?.[1] ?? rawValue
      const title = titleMatch?.[2] ?? ''
      const mapped = mapSource(source)
      if (mapped === source) {
        return match
      }
      return `${prefix}${wrapped ? '<' : ''}${mapped}${wrapped ? '>' : ''}${title}${suffix}`
    }
  )

  return inlineImages.replace(
    /^(\s*\[[^\]]+\]:\s*)(<?)(\S+?)(>?)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/gm,
    (match, prefix: string, open: string, source: string, close: string, title = '') => {
      const mapped = mapSource(source)
      return mapped === source ? match : `${prefix}${open}${mapped}${close}${title}`
    }
  )
}

function isAbsoluteSource(source: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)
}

export function fileMarkdownToEditorMarkdown(markdown: string, assetBaseUrl: string): string {
  if (!assetBaseUrl) {
    return markdown
  }
  return mapImageSources(markdown, (source) => {
    if (isAbsoluteSource(source)) {
      return source
    }
    try {
      return new URL(source.replace(/\\/g, '/'), assetBaseUrl).href
    } catch {
      return source
    }
  })
}

export function editorMarkdownToFileMarkdown(markdown: string, assetBaseUrl: string): string {
  if (!assetBaseUrl) {
    return markdown
  }
  return mapImageSources(markdown, (source) => {
    if (!source.startsWith(assetBaseUrl)) {
      return source
    }
    try {
      return decodeURIComponent(source.slice(assetBaseUrl.length))
    } catch {
      return source.slice(assetBaseUrl.length)
    }
  })
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string,
  placeholder: string
): MarkdownEditResult {
  const selected = value.slice(selectionStart, selectionEnd) || placeholder
  const replacement = `${before}${selected}${after}`
  return {
    value: `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`,
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + selected.length
  }
}

function replaceCurrentLine(
  value: string,
  position: number,
  transform: (line: string) => string
): MarkdownEditResult {
  const lineStart = value.lastIndexOf('\n', Math.max(0, position - 1)) + 1
  const nextBreak = value.indexOf('\n', position)
  const lineEnd = nextBreak < 0 ? value.length : nextBreak
  const line = value.slice(lineStart, lineEnd)
  const replacement = transform(line)
  const cursor = lineStart + replacement.length
  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    selectionStart: cursor,
    selectionEnd: cursor
  }
}

function insertTemplate(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  template: string,
  selectedText = ''
): MarkdownEditResult {
  const replacement = selectedText
    ? template.replace('{{selection}}', selectedText)
    : template.replace('{{selection}}', '')
  const cursorOffset = replacement.indexOf('{{cursor}}')
  const cleanReplacement = replacement.replace('{{cursor}}', '')
  const cursor = selectionStart + (cursorOffset >= 0 ? cursorOffset : cleanReplacement.length)
  return {
    value: `${value.slice(0, selectionStart)}${cleanReplacement}${value.slice(selectionEnd)}`,
    selectionStart: cursor,
    selectionEnd: cursor
  }
}

export function applyMarkdownEdit(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  command: MarkdownEditCommand
): MarkdownEditResult {
  const selection = value.slice(selectionStart, selectionEnd)
  if (command === 'bold') {
    return wrapSelection(value, selectionStart, selectionEnd, '**', '**', '粗体文字')
  }
  if (command === 'italic') {
    return wrapSelection(value, selectionStart, selectionEnd, '*', '*', '斜体文字')
  }
  if (command === 'strikethrough') {
    return wrapSelection(value, selectionStart, selectionEnd, '~~', '~~', '删除文字')
  }
  if (command === 'inline-code') {
    return wrapSelection(value, selectionStart, selectionEnd, '`', '`', 'code')
  }
  if (command === 'math-inline') {
    return wrapSelection(value, selectionStart, selectionEnd, '$', '$', 'E = mc^2')
  }

  if (command.startsWith('heading-')) {
    const level = Number(command.slice(-1))
    return replaceCurrentLine(value, selectionStart, (line) => {
      const content = line.replace(/^\s{0,3}#{1,6}\s+/, '').trimStart()
      return `${'#'.repeat(level)} ${content}`
    })
  }

  const linePrefixes: Partial<Record<MarkdownEditCommand, string>> = {
    'bullet-list': '- ',
    'ordered-list': '1. ',
    'task-list': '- [ ] ',
    quote: '> '
  }
  const prefix = linePrefixes[command]
  if (prefix) {
    return replaceCurrentLine(value, selectionStart, (line) => `${prefix}${line}`)
  }

  if (command === 'link') {
    return insertTemplate(
      value,
      selectionStart,
      selectionEnd,
      '[{{selection}}](https://{{cursor}})',
      selection || '链接文字'
    )
  }
  if (command === 'image') {
    return insertTemplate(
      value,
      selectionStart,
      selectionEnd,
      '![{{selection}}](images/{{cursor}})',
      selection || '图片说明'
    )
  }
  if (command === 'code-block') {
    return insertTemplate(
      value,
      selectionStart,
      selectionEnd,
      '```text\n{{selection}}{{cursor}}\n```\n',
      selection
    )
  }
  if (command === 'table') {
    return insertTemplate(
      value,
      selectionStart,
      selectionEnd,
      '| 列 1 | 列 2 |\n| --- | --- |\n| {{cursor}} |  |\n'
    )
  }
  if (command === 'math-block') {
    return insertTemplate(
      value,
      selectionStart,
      selectionEnd,
      '$$\n{{selection}}{{cursor}}\n$$\n',
      selection || 'E = mc^2'
    )
  }
  return insertTemplate(
    value,
    selectionStart,
    selectionEnd,
    '```mermaid\ngraph TD\n  A[开始] --> B[{{cursor}}结束]\n```\n'
  )
}

export function shouldRestoreDraft(draft: DraftLike, document: DocumentLike): boolean {
  return draft.updatedAt > document.modifiedAt && draft.content !== document.content
}
