import { basename, extname } from 'node:path'
import { MARKDOWN_EXTENSIONS } from './file-utils'

export function ensureMarkdownExtension(filePath: string): string {
  return MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase()) ? filePath : `${filePath}.md`
}

export function hasExternalChange(expectedModifiedAt: number, actualModifiedAt: number): boolean {
  return Math.abs(expectedModifiedAt - actualModifiedAt) >= 1
}

export function sanitizeAssetFileName(fileName: string): string {
  const leafName = basename(fileName.trim())
  const extension = extname(leafName)
    .toLowerCase()
    .replace(/[^.a-z\d]/g, '')
  const rawStem = leafName.slice(0, leafName.length - extname(leafName).length).normalize('NFKC')
  const stem = rawStem
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
  return `${stem || 'image'}${extension || '.png'}`
}

export function nextAvailableAssetName(fileName: string, existingNames: Set<string>): string {
  const safeName = sanitizeAssetFileName(fileName)
  const normalizedExisting = new Set(
    Array.from(existingNames, (name) => name.toLocaleLowerCase('en-US'))
  )
  if (!normalizedExisting.has(safeName.toLocaleLowerCase('en-US'))) {
    return safeName
  }

  const extension = extname(safeName)
  const stem = safeName.slice(0, -extension.length)
  let index = 2
  while (normalizedExisting.has(`${stem}-${index}${extension}`.toLocaleLowerCase('en-US'))) {
    index += 1
  }
  return `${stem}-${index}${extension}`
}

function mapMarkdownImageSources(markdown: string, mapSource: (source: string) => string): string {
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

function isRelativeSource(source: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)
}

export function collectRelativeImageSources(markdown: string): string[] {
  const sources = new Set<string>()
  mapMarkdownImageSources(markdown, (source) => {
    if (isRelativeSource(source)) {
      sources.add(source)
    }
    return source
  })
  return Array.from(sources)
}

export function rewriteMarkdownImageSources(
  markdown: string,
  replacements: ReadonlyMap<string, string>
): string {
  return mapMarkdownImageSources(markdown, (source) => replacements.get(source) ?? source)
}
