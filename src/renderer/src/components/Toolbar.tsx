import {
  FilePlus2,
  FileSearch,
  FolderOpen,
  LocateFixed,
  Menu,
  Minus,
  Monitor,
  Moon,
  Plus,
  Save,
  Search,
  Sun
} from 'lucide-react'
import type { MarkdownDocument } from '../../../shared/types'
import { formatShortcut, revealInFolderLabel } from '../lib/platform'
import { BrandMark } from './BrandMark'

export type ThemeMode = 'system' | 'light' | 'dark'

interface ToolbarProps {
  platform: NodeJS.Platform
  document: MarkdownDocument | null
  dirty: boolean
  saving: boolean
  sidebarOpen: boolean
  themeMode: ThemeMode
  fontScale: number
  onToggleSidebar: () => void
  onNew: () => void
  onOpen: () => void
  onSave: () => void
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
  platform,
  document,
  dirty,
  saving,
  sidebarOpen,
  themeMode,
  fontScale,
  onToggleSidebar,
  onNew,
  onOpen,
  onSave,
  onReveal,
  onToggleFind,
  onCycleTheme,
  onFontDecrease,
  onFontIncrease
}: ToolbarProps): React.JSX.Element {
  const revealLabel = revealInFolderLabel(platform)

  return (
    <header className="titlebar">
      <div className="titlebar-left no-drag">
        <button
          className={`icon-button ${sidebarOpen ? 'is-pressed' : ''}`}
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          title={`切换侧栏（${platform === 'darwin' ? '⌘⇧B' : 'Ctrl+Shift+B'}）`}
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
            {dirty && <span className="dirty-indicator" role="img" aria-label="有未保存更改" />}
          </>
        ) : (
          <span>未命名文档</span>
        )}
      </div>

      <div className="titlebar-actions no-drag">
        <button
          className="icon-button"
          type="button"
          onClick={onNew}
          aria-label="新建文档"
          title={`新建文档（${formatShortcut(platform, 'N')}）`}
        >
          <FilePlus2 size={17} />
        </button>
        <button
          className="toolbar-button"
          type="button"
          onClick={onOpen}
          title={`打开文件（${formatShortcut(platform, 'O')}）`}
        >
          <FolderOpen size={17} />
          <span>打开</span>
        </button>
        <button
          className="toolbar-button primary-action"
          type="button"
          onClick={onSave}
          disabled={!document || saving}
          title={`保存（${formatShortcut(platform, 'S')}）`}
        >
          <Save size={16} />
          <span>{saving ? '保存中' : '保存'}</span>
        </button>
        <span className="toolbar-divider" />
        <button
          className="icon-button"
          type="button"
          onClick={onToggleFind}
          disabled={!document}
          aria-label="在文档中查找"
          title={`查找（${formatShortcut(platform, 'F')}）`}
        >
          <Search size={17} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onReveal}
          disabled={!document?.filePath}
          aria-label={revealLabel}
          title={revealLabel}
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
