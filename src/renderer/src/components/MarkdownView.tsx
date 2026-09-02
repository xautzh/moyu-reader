import { Check, Copy } from 'lucide-react'
import mermaid from 'mermaid'
import { isValidElement, type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { MarkdownDocument } from '../../../shared/types'
import { splitFrontMatter } from '../lib/frontmatter'
import { resolveImageSource } from '../lib/markdown'

interface MarkdownViewProps {
  document: MarkdownDocument
  theme: 'light' | 'dark'
  onOpenLink: (href: string) => void
  onNotify: (message: string) => void
}

function MermaidDiagram({
  source,
  theme
}: {
  source: string
  theme: 'light' | 'dark'
}): React.JSX.Element {
  const rawId = useId()
  const diagramId = useMemo(() => `moyu-mermaid-${rawId.replace(/[^a-z\d]/gi, '')}`, [rawId])
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setSvg('')
    setError('')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'neutral',
      fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif'
    })
    void mermaid
      .render(diagramId, source)
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Mermaid 图表语法有误，请在源码模式中检查。')
        }
      })
    return () => {
      cancelled = true
    }
  }, [diagramId, source, theme])

  if (error) {
    return (
      <div className="mermaid-error" role="alert">
        {error}
      </div>
    )
  }

  return (
    <figure className="mermaid-diagram" role="img" aria-label="Mermaid 图表">
      {svg ? (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid sanitizes SVG with securityLevel "strict" before it reaches React.
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="diagram-loading">正在绘制图表…</div>
      )}
    </figure>
  )
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(nodeText).join('')
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children)
  }
  return ''
}

function CodeBlock({
  children,
  onNotify
}: {
  children: ReactNode
  onNotify: (message: string) => void
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  async function copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(nodeText(children).replace(/\n$/, ''))
      setCopied(true)
      onNotify('代码已复制')
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      onNotify('复制失败，请手动选择代码')
    }
  }

  return (
    <div className="code-block">
      <button className="copy-code-button" type="button" onClick={copyCode} aria-label="复制代码">
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span>{copied ? '已复制' : '复制'}</span>
      </button>
      <pre>{children}</pre>
    </div>
  )
}

export function MarkdownView({
  document,
  theme,
  onOpenLink,
  onNotify
}: MarkdownViewProps): React.JSX.Element {
  const markdownBody = useMemo(() => splitFrontMatter(document.content).body, [document.content])
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children, ...props }) => (
        <a
          {...props}
          href={href}
          onClick={(event) => {
            event.preventDefault()
            if (href) {
              onOpenLink(href)
            }
          }}
        >
          {children}
        </a>
      ),
      img: ({ src, alt, ...props }) => (
        <img
          {...props}
          src={resolveImageSource(typeof src === 'string' ? src : undefined, document.assetBaseUrl)}
          alt={alt ?? ''}
          loading="lazy"
        />
      ),
      pre: ({ children }) => {
        if (
          isValidElement<{ className?: string; children?: ReactNode }>(children) &&
          children.props.className?.split(' ').includes('language-mermaid')
        ) {
          return <MermaidDiagram source={nodeText(children).replace(/\n$/, '')} theme={theme} />
        }
        return <CodeBlock onNotify={onNotify}>{children}</CodeBlock>
      },
      table: ({ children }) => (
        <section className="table-scroll" aria-label="Markdown 表格">
          <table>{children}</table>
        </section>
      ),
      input: ({ type, ...props }) => (
        <input type={type} {...props} disabled={type === 'checkbox' || props.disabled} />
      )
    }),
    [document.assetBaseUrl, onNotify, onOpenLink, theme]
  )

  return (
    <article className="markdown-body" aria-label={`${document.fileName} 内容`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeSlug,
          rehypeKatex,
          [rehypeHighlight, { detect: false, ignoreMissing: true }]
        ]}
        components={components}
        skipHtml
      >
        {markdownBody}
      </ReactMarkdown>
    </article>
  )
}
