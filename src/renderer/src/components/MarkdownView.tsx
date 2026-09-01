import { Check, Copy } from 'lucide-react'
import { isValidElement, type ReactNode, useMemo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import type { MarkdownDocument } from '../../../shared/types'
import { resolveImageSource } from '../lib/markdown'

interface MarkdownViewProps {
  document: MarkdownDocument
  onOpenLink: (href: string) => void
  onNotify: (message: string) => void
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
  onOpenLink,
  onNotify
}: MarkdownViewProps): React.JSX.Element {
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
      pre: ({ children }) => <CodeBlock onNotify={onNotify}>{children}</CodeBlock>,
      table: ({ children }) => (
        <section className="table-scroll" aria-label="Markdown 表格">
          <table>{children}</table>
        </section>
      ),
      input: ({ type, ...props }) => (
        <input type={type} {...props} disabled={type === 'checkbox' || props.disabled} />
      )
    }),
    [document.assetBaseUrl, onNotify, onOpenLink]
  )

  return (
    <article className="markdown-body" aria-label={`${document.fileName} 内容`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={components}
        skipHtml
      >
        {document.content}
      </ReactMarkdown>
    </article>
  )
}
