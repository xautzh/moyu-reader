import {
  FileSearch,
  FolderOpen,
  LocateFixed,
  Menu,
  Minus,
  Monitor,
  Moon,
  Plus,
  Search,
  Sun
} from 'lucide-react'
import type { MarkdownDocument } from '../../../shared/types'
import { BrandMark } from './BrandMark'

export type ThemeMode = 'system' | 'light' | 'dark'

interface ToolbarProps {
  document: MarkdownDocument | null
  sidebarOpen: boolean
  themeMode: ThemeMode
  fontScale: number
  onToggleSidebar: () => void
  onOpen: () => void
  onReveal: () => void
  onToggleFind: () => void
  onCycleTheme: () => void
  onFontDecrease: () => void
  onFontIncrease: () => void
}

function ThemeIcon({ mode }: { mode: ThemeMode }): React.JSX.Element {
  if (mode === 'light') {
    return <Sun size={17} />
  }
  if (mode === 'dark') {
    return <Moon size={17} />
  }
  return <Monitor size={17} />
}

const themeTitle: Record<ThemeMode, string> = {
  system: '主题：跟随系统（点击切换）',
  light: '主题：浅色（点击切换）',
  dark: '主题：深色（点击切换）'
}

export function Toolbar({
  document,
  sidebarOpen,
  themeMode,
  fontScale,
  onToggleSidebar,
  onOpen,
  onReveal,
  onToggleFind,
  onCycleTheme,
  onFontDecrease,
  onFontIncrease
}: ToolbarProps): React.JSX.Element {
  return (
    <header className="titlebar">
      <div className="titlebar-left no-drag">
        <button
          className={`icon-button ${sidebarOpen ? 'is-pressed' : ''}`}
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          title="切换侧栏（Ctrl+B）"
        >
          <Menu size={18} />
        </button>
        <span className="brand-lockup">
          <BrandMark />
          <span className="brand-name">墨阅</span>
        </span>
      </div>

      <div className="window-title" title={document?.filePath}>
        {document ? (
          <>
            <FileSearch size={15} />
            <span>{document.fileName}</span>
          </>
        ) : (
          <span>Markdown 阅读器</span>
        )}
      </div>

      <div className="titlebar-actions no-drag">
        <button
          className="toolbar-button primary-action"
          type="button"
          onClick={onOpen}
          title="打开文件（Ctrl+O）"
        >
          <FolderOpen size={17} />
          <span>打开</span>
        </button>
        <span className="toolbar-divider" />
        <button
          className="icon-button"
          type="button"
          onClick={onToggleFind}
          disabled={!document}
          aria-label="在文档中查找"
          title="查找（Ctrl+F）"
        >
          <Search size={17} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onReveal}
          disabled={!document}
          aria-label="在资源管理器中显示"
          title="在资源管理器中显示"
        >
          <LocateFixed size={17} />
        </button>
        <span className="toolbar-divider" />
        <fieldset className="font-controls" aria-label="正文字号">
          <button
            className="icon-button small"
            type="button"
            onClick={onFontDecrease}
            aria-label="减小字号"
          >
            <Minus size={14} />
          </button>
          <span className="font-scale" title="正文字号">
            {Math.round(fontScale * 100)}%
          </span>
          <button
            className="icon-button small"
            type="button"
            onClick={onFontIncrease}
            aria-label="增大字号"
          >
            <Plus size={14} />
          </button>
        </fieldset>
        <button
          className="icon-button"
          type="button"
          onClick={onCycleTheme}
          aria-label={themeTitle[themeMode]}
          title={themeTitle[themeMode]}
        >
          <ThemeIcon mode={themeMode} />
        </button>
      </div>
    </header>
  )
}
