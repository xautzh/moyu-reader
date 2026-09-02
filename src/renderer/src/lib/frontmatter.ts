export interface FrontMatterSplit {
  hasFrontMatter: boolean
  frontMatter: string
  body: string
}

const OPENING_DELIMITER = /^---[\t ]*(?:\r\n|\n)/
const CLOSING_DELIMITER = /^(?:---|\.\.\.)[\t ]*(?:\r\n|\n|$)/gm
const TOP_LEVEL_MAPPING_KEY = /(?:^|\r?\n)[A-Za-z_][\w.-]*[\t ]*:/
const BODY_SEPARATOR = /^(?:[\t ]*(?:\r\n|\n))+/

export function splitFrontMatter(markdown: string): FrontMatterSplit {
  const bom = markdown.startsWith('\uFEFF') ? '\uFEFF' : ''
  const source = markdown.slice(bom.length)
  const opening = OPENING_DELIMITER.exec(source)

  if (!opening) {
    return { hasFrontMatter: false, frontMatter: '', body: markdown }
  }

  CLOSING_DELIMITER.lastIndex = opening[0].length
  const closing = CLOSING_DELIMITER.exec(source)
  CLOSING_DELIMITER.lastIndex = 0

  if (!closing) {
    return { hasFrontMatter: false, frontMatter: '', body: markdown }
  }

  const yaml = source.slice(opening[0].length, closing.index)
  if (!TOP_LEVEL_MAPPING_KEY.test(yaml)) {
    return { hasFrontMatter: false, frontMatter: '', body: markdown }
  }

  let frontMatterEnd = closing.index + closing[0].length
  const separator = BODY_SEPARATOR.exec(source.slice(frontMatterEnd))
  if (separator) {
    frontMatterEnd += separator[0].length
  }
  return {
    hasFrontMatter: true,
    frontMatter: `${bom}${source.slice(0, frontMatterEnd)}`,
    body: source.slice(frontMatterEnd)
  }
}

export function joinFrontMatter(frontMatter: string, body: string): string {
  return `${frontMatter}${body}`
}
