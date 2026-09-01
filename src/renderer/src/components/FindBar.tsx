import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { FindResult } from '../../../shared/types'

interface FindBarProps {
  open: boolean
  query: string
  result: FindResult | null
  onQueryChange: (query: string) => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}

export function FindBar({
  open,
  query,
  result,
  onQueryChange,
  onPrevious,
  onNext,
  onClose
}: FindBarProps): React.JSX.Element | null {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  if (!open) {
    return null
  }

  const resultLabel = query
    ? result && result.matches > 0
      ? `${result.activeMatchOrdinal} / ${result.matches}`
      : '无匹配'
    : ''

  return (
    <search className="find-bar">
      <Search size={15} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="在文档中查找"
        aria-label="查找文本"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (event.shiftKey) {
              onPrevious()
            } else {
              onNext()
            }
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      />
      <span className="find-result" aria-live="polite">
        {resultLabel}
      </span>
      <button
        className="icon-button small"
        type="button"
        onClick={onPrevious}
        disabled={!query}
        aria-label="上一个匹配"
      >
        <ChevronUp size={15} />
      </button>
      <button
        className="icon-button small"
        type="button"
        onClick={onNext}
        disabled={!query}
        aria-label="下一个匹配"
      >
        <ChevronDown size={15} />
      </button>
      <button className="icon-button small" type="button" onClick={onClose} aria-label="关闭查找">
        <X size={15} />
      </button>
    </search>
  )
}
