import GithubSlugger from 'github-slugger'
import { toString as mdastToString } from 'mdast-util-to-string'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { splitFrontMatter } from './frontmatter'

export interface OutlineItem {
  depth: number
  text: string
  id: string
}

export interface ReadingStats {
  characters: number
  words: number
  minutes: number
  lines: number
}

export function extractOutline(markdown: string): OutlineItem[] {
  const tree = unified().use(remarkParse).parse(splitFrontMatter(markdown).body)
  const slugger = new GithubSlugger()
  const headings: OutlineItem[] = []

  visit(tree, 'heading', (node) => {
    const text = mdastToString(node).replace(/\s+/g, ' ').trim()
    if (!text) {
      return
    }

    headings.push({
      depth: node.depth,
      text,
      id: slugger.slug(text)
    })
  })

  return headings
}

export function estimateReadingStats(markdown: string): ReadingStats {
  const plainText = mdastToString(unified().use(remarkParse).parse(splitFrontMatter(markdown).body))
  const cjkCharacters =
    plainText.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ??
    []
  const latinWords = plainText.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []
  const nonCjkWords = latinWords.filter(
    (word) => !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(word)
  )
  const readableCharacters = plainText.match(/[\p{L}\p{N}]/gu) ?? []
  const minutes = Math.max(1, Math.ceil(cjkCharacters.length / 400 + nonCjkWords.length / 220))

  return {
    characters: readableCharacters.length,
    words: cjkCharacters.length + nonCjkWords.length,
    minutes,
    lines: markdown.length === 0 ? 0 : markdown.split(/\r?\n/).length
  }
}

export function resolveImageSource(source: string | undefined, assetBaseUrl: string): string {
  if (!source) {
    return ''
  }

  const trimmed = source.trim()
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(trimmed)) {
    return trimmed
  }

  try {
    return new URL(trimmed.replace(/\\/g, '/'), assetBaseUrl).href
  } catch {
    return trimmed
  }
}
