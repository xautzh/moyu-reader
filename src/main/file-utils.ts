import { extname } from 'node:path'

export const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd'])

export interface RecentFile {
  path: string
  name: string
  lastOpenedAt: number
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

export function isMarkdownFile(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(stripWrappingQuotes(filePath)).toLowerCase())
}

export function pickMarkdownArgument(argv: string[]): string | undefined {
  for (const argument of argv) {
    const candidate = stripWrappingQuotes(argument)
    if (!candidate.startsWith('-') && isMarkdownFile(candidate)) {
      return candidate
    }
  }

  return undefined
}

function isRecentFile(value: unknown): value is RecentFile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const row = value as Partial<RecentFile>
  return (
    typeof row.path === 'string' &&
    row.path.trim().length > 0 &&
    isMarkdownFile(row.path) &&
    typeof row.name === 'string' &&
    row.name.trim().length > 0 &&
    typeof row.lastOpenedAt === 'number' &&
    Number.isFinite(row.lastOpenedAt)
  )
}

export function sanitizeRecentFiles(value: unknown, limit = 12): RecentFile[] {
  if (!Array.isArray(value) || limit <= 0) {
    return []
  }

  const seen = new Set<string>()
  const rows = value
    .filter(isRecentFile)
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)

  const result: RecentFile[] = []
  for (const row of rows) {
    const key = row.path.toLocaleLowerCase('en-US')
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(row)
    if (result.length >= limit) {
      break
    }
  }

  return result
}
