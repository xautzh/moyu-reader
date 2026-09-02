import { describe, expect, it } from 'vitest'
import { joinFrontMatter, splitFrontMatter } from './frontmatter'

describe('YAML front matter protection', () => {
  it('separates LF front matter from the editable Markdown body', () => {
    const source = '---\ntitle: Design\ncolors:\n  primary: "#123456"\n---\n\n# Body\n'

    expect(splitFrontMatter(source)).toEqual({
      hasFrontMatter: true,
      frontMatter: '---\ntitle: Design\ncolors:\n  primary: "#123456"\n---\n\n',
      body: '# Body\n'
    })
  })

  it('preserves BOM, CRLF, closing ellipsis, whitespace and the exact protected prefix', () => {
    const frontMatter = '\uFEFF---  \r\ntitle: Design\r\nnested:\r\n  value: true\r\n...\t\r\n\r\n'
    const source = `${frontMatter}Paragraph — preserved.\r\n`
    const split = splitFrontMatter(source)

    expect(split).toEqual({
      hasFrontMatter: true,
      frontMatter,
      body: 'Paragraph — preserved.\r\n'
    })
    expect(joinFrontMatter(split.frontMatter, 'Changed body.\r\n')).toBe(
      `${frontMatter}Changed body.\r\n`
    )
  })

  it('does not consume an unclosed block or an ordinary thematic-break document', () => {
    for (const source of ['---\ntitle: unfinished\n# Body', '---\n\nIntroduction\n\n---\n\nBody']) {
      expect(splitFrontMatter(source)).toEqual({
        hasFrontMatter: false,
        frontMatter: '',
        body: source
      })
    }
  })
})
