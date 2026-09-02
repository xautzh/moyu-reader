import {
  Bold,
  Braces,
  CheckSquare,
  Code2,
  Columns2,
  Eye,
  FileCode2,
  FileDown,
  Focus,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Sigma,
  Strikethrough,
  Table2,
  TimerReset
} from 'lucide-react'
import type { EditorMode } from '../../../shared/types'
import type { MarkdownEditCommand } from '../lib/editor'

interface EditorToolbarProps {
  mode: EditorMode
  canUseAssets: boolean
  autosave: boolean
  focusMode: boolean
  typewriterMode: boolean
  onModeChange: (mode: EditorMode) => void
  onFormat: (command: MarkdownEditCommand) => void
  onInsertImage: () => void
  onExportHtml: () => void
  onExportPdf: () => void
  onToggleAutosave: () => void
  onToggleFocus: () => void
  onToggleTypewriter: () => void
}

const modes: Array<{ mode: EditorMode; label: string; icon: typeof Pilcrow }> = [
  { mode: 'wysiwyg', label: '所见即所得', icon: Pilcrow },
  { mode: 'source', label: '源码', icon: FileCode2 },
  { mode: 'split', label: '分屏', icon: Columns2 },
  { mode: 'preview', label: '预览', icon: Eye }
]

const formatButtons: Array<{
  command: MarkdownEditCommand
  label: string
  icon: typeof Bold
}> = [
  { command: 'heading-1', label: '一级标题', icon: Heading1 },
  { command: 'heading-2', label: '二级标题', icon: Heading2 },
  { command: 'bold', label: '粗体', icon: Bold },
  { command: 'italic', label: '斜体', icon: Italic },
  { command: 'strikethrough', label: '删除线', icon: Strikethrough },
  { command: 'inline-code', label: '行内代码', icon: Code2 },
  { command: 'quote', label: '引用', icon: Quote },
  { command: 'bullet-list', label: '无序列表', icon: List },
  { command: 'ordered-list', label: '有序列表', icon: ListOrdered },
  { command: 'task-list', label: '任务列表', icon: CheckSquare },
  { command: 'link', label: '链接', icon: Link2 },
  { command: 'table', label: '表格', icon: Table2 },
  { command: 'code-block', label: '代码块', icon: Braces },
  { command: 'math-block', label: '数学公式', icon: Sigma }
]

export function EditorToolbar({
  mode,
  canUseAssets,
  autosave,
  focusMode,
  typewriterMode,
  onModeChange,
  onFormat,
  onInsertImage,
  onExportHtml,
  onExportPdf,
  onToggleAutosave,
  onToggleFocus,
  onToggleTypewriter
}: EditorToolbarProps): React.JSX.Element {
  const sourceToolsVisible = mode === 'source' || mode === 'split'

  return (
    <div className="editor-toolbar no-drag" role="toolbar" aria-label="编辑工具栏">
      <fieldset className="mode-switcher" aria-label="编辑模式">
        {modes.map(({ mode: itemMode, label, icon: Icon }) => (
          <button
            className={mode === itemMode ? 'is-active' : ''}
            type="button"
            key={itemMode}
            onClick={() => onModeChange(itemMode)}
            aria-pressed={mode === itemMode}
            title={label}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </fieldset>

      <span className="editor-toolbar-divider" />

      <fieldset className="format-actions" aria-label="Markdown 格式">
        {sourceToolsVisible ? (
          formatButtons.map(({ command, label, icon: Icon }) => (
            <button
              className="compact-tool-button"
              type="button"
              key={command}
              onClick={() => onFormat(command)}
              aria-label={label}
              title={label}
            >
              <Icon size={15} />
            </button>
          ))
        ) : (
          <span className="wysiwyg-hint">选中文字即可排版，输入 / 可插入内容块</span>
        )}
      </fieldset>

      <div className="editor-utility-actions">
        <button
          className="compact-tool-button"
          type="button"
          onClick={onInsertImage}
          disabled={!canUseAssets}
          aria-label="插入本地图片"
          title={canUseAssets ? '插入本地图片' : '保存文档后可插入本地图片'}
        >
          <ImagePlus size={16} />
        </button>
        <button
          className="compact-tool-button"
          type="button"
          onClick={onExportHtml}
          aria-label="导出 HTML"
          title="导出 HTML"
        >
          <FileDown size={16} />
        </button>
        <button
          className="compact-tool-button pdf-tool"
          type="button"
          onClick={onExportPdf}
          aria-label="导出 PDF"
          title="导出 PDF"
        >
          PDF
        </button>
        <span className="editor-toolbar-divider" />
        <button
          className={`compact-tool-button ${autosave ? 'is-active' : ''}`}
          type="button"
          onClick={onToggleAutosave}
          aria-pressed={autosave}
          aria-label="自动保存"
          title="自动保存（停止输入后保存）"
        >
          <TimerReset size={16} />
        </button>
        <button
          className={`compact-tool-button ${focusMode ? 'is-active' : ''}`}
          type="button"
          onClick={onToggleFocus}
          aria-pressed={focusMode}
          aria-label="专注模式"
          title="专注模式（F8）"
        >
          <Focus size={16} />
        </button>
        <button
          className={`compact-tool-button ${typewriterMode ? 'is-active' : ''}`}
          type="button"
          onClick={onToggleTypewriter}
          aria-pressed={typewriterMode}
          aria-label="打字机模式"
          title="打字机模式（F9）"
        >
          <span className="typewriter-glyph">T</span>
        </button>
      </div>
    </div>
  )
}
