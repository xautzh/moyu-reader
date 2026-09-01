import { Clock3, FileText, ListTree, Trash2, X } from 'lucide-react'
import type { MarkdownDocument, RecentFile } from '../../../shared/types'
import { displayPath, formatRecentTime } from '../lib/format'
import type { OutlineItem } from '../lib/markdown'

interface SidebarProps {
  open: boolean
  document: MarkdownDocument | null
  outline: OutlineItem[]
  activeHeadingId: string
  recentFiles: RecentFile[]
  onClose: () => void
  onHeadingClick: (id: string) => void
  onRecentClick: (filePath: string) => void
  onRemoveRecent: (filePath: string) => void
  onClearRecent: () => void
}

export function Sidebar({
  open,
  document,
  outline,
  activeHeadingId,
  recentFiles,
  onClose,
  onHeadingClick,
  onRecentClick,
  onRemoveRecent,
  onClearRecent
}: SidebarProps): React.JSX.Element {
  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="文档导航">
      <div className="sidebar-mobile-header">
        <span>文档导航</span>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭侧栏">
          <X size={17} />
        </button>
      </div>

      <section className="sidebar-section outline-section">
        <div className="section-heading">
          <span className="section-heading-title">
            <ListTree size={15} />
            文档结构
          </span>
          {outline.length > 0 && <span className="section-count">{outline.length}</span>}
        </div>

        <nav className="outline-list" aria-label="文档目录">
          {!document && (
            <div className="sidebar-placeholder">
              <FileText size={18} />
              <span>打开文档后显示目录</span>
            </div>
          )}
          {document && outline.length === 0 && (
            <div className="sidebar-placeholder compact">
              <span>此文档没有标题</span>
            </div>
          )}
          {outline.map((item) => (
            <button
              className={`outline-item depth-${item.depth} ${activeHeadingId === item.id ? 'is-active' : ''}`}
              type="button"
              key={item.id}
              title={item.text}
              onClick={() => onHeadingClick(item.id)}
            >
              <span>{item.text}</span>
            </button>
          ))}
        </nav>
      </section>

      <section className="sidebar-section recent-section">
        <div className="section-heading">
          <span className="section-heading-title">
            <Clock3 size={15} />
            最近打开
          </span>
          {recentFiles.length > 0 && (
            <button className="text-button" type="button" onClick={onClearRecent}>
              清空
            </button>
          )}
        </div>

        <div className="recent-list">
          {recentFiles.length === 0 && (
            <div className="sidebar-placeholder compact">
              <span>暂无最近文件</span>
            </div>
          )}
          {recentFiles.map((file) => (
            <div
              className={`recent-item ${document?.filePath.toLocaleLowerCase() === file.path.toLocaleLowerCase() ? 'is-current' : ''}`}
              key={file.path.toLocaleLowerCase()}
            >
              <button
                className="recent-main"
                type="button"
                onClick={() => onRecentClick(file.path)}
                title={file.path}
              >
                <FileText size={16} />
                <span className="recent-copy">
                  <span className="recent-name">{file.name}</span>
                  <span className="recent-meta">
                    {formatRecentTime(file.lastOpenedAt)} · {displayPath(file.path)}
                  </span>
                </span>
              </button>
              <button
                className="recent-remove"
                type="button"
                onClick={() => onRemoveRecent(file.path)}
                aria-label={`从最近文件中移除 ${file.name}`}
                title="移除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}
