import {
  Clock3,
  FileText,
  FolderOpen,
  FolderTree,
  ListTree,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import { type CSSProperties, useState } from 'react'
import type { MarkdownDocument, RecentFile, WorkspaceSnapshot } from '../../../shared/types'
import { displayPath, formatRecentTime } from '../lib/format'
import type { OutlineItem } from '../lib/markdown'

type SidebarTab = 'outline' | 'files' | 'recent'

interface SidebarProps {
  open: boolean
  document: MarkdownDocument | null
  outline: OutlineItem[]
  activeHeadingId: string
  recentFiles: RecentFile[]
  workspace: WorkspaceSnapshot | null
  onClose: () => void
  onHeadingClick: (id: string) => void
  onRecentClick: (filePath: string) => void
  onRemoveRecent: (filePath: string) => void
  onClearRecent: () => void
  onOpenWorkspace: () => void
  onRefreshWorkspace: () => void
}

const tabs: Array<{ id: SidebarTab; label: string; icon: typeof ListTree }> = [
  { id: 'outline', label: '大纲', icon: ListTree },
  { id: 'files', label: '文件', icon: FolderTree },
  { id: 'recent', label: '最近', icon: Clock3 }
]

export function Sidebar({
  open,
  document,
  outline,
  activeHeadingId,
  recentFiles,
  workspace,
  onClose,
  onHeadingClick,
  onRecentClick,
  onRemoveRecent,
  onClearRecent,
  onOpenWorkspace,
  onRefreshWorkspace
}: SidebarProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SidebarTab>('outline')

  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="文档导航">
      <div className="sidebar-mobile-header">
        <span>文档导航</span>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭侧栏">
          <X size={17} />
        </button>
      </div>

      <div className="sidebar-tabs" role="tablist" aria-label="侧栏内容">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            className={activeTab === id ? 'is-active' : ''}
            type="button"
            role="tab"
            key={id}
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'outline' && (
        <section className="sidebar-section outline-section" role="tabpanel">
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
                <span>添加标题后会在这里生成大纲</span>
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
      )}

      {activeTab === 'files' && (
        <section className="sidebar-section workspace-section" role="tabpanel">
          <div className="section-heading">
            <span className="section-heading-title">
              <FolderTree size={15} />
              {workspace?.name ?? '工作区'}
            </span>
            <span className="section-inline-actions">
              {workspace && (
                <button
                  className="section-icon-button"
                  type="button"
                  onClick={onRefreshWorkspace}
                  aria-label="刷新工作区"
                  title="刷新"
                >
                  <RefreshCw size={13} />
                </button>
              )}
              <button
                className="section-icon-button"
                type="button"
                onClick={onOpenWorkspace}
                aria-label="打开文件夹"
                title="打开文件夹"
              >
                <FolderOpen size={14} />
              </button>
            </span>
          </div>

          {!workspace && (
            <button className="workspace-empty" type="button" onClick={onOpenWorkspace}>
              <FolderOpen size={20} />
              <strong>打开 Markdown 文件夹</strong>
              <span>集中浏览和切换同一目录中的文档</span>
            </button>
          )}
          {workspace && workspace.files.length === 0 && (
            <div className="sidebar-placeholder compact">
              <span>此文件夹中没有 Markdown 文档</span>
            </div>
          )}
          {workspace && (
            <div className="workspace-files" title={workspace.rootPath}>
              {workspace.files.map((file) => {
                const style = {
                  '--tree-indent': `${Math.min(file.depth, 5) * 13}px`
                } as CSSProperties
                const current =
                  document?.filePath.toLocaleLowerCase() === file.path.toLocaleLowerCase()
                return (
                  <button
                    className={`workspace-file ${current ? 'is-current' : ''}`}
                    style={style}
                    type="button"
                    key={file.path.toLocaleLowerCase()}
                    onClick={() => onRecentClick(file.path)}
                    title={file.relativePath}
                  >
                    <FileText size={15} />
                    <span>{file.name}</span>
                  </button>
                )
              })}
              {workspace.truncated && (
                <div className="workspace-limit">仅显示前 500 个文件或前 8 层目录</div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'recent' && (
        <section className="sidebar-section recent-section" role="tabpanel">
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
      )}
    </aside>
  )
}
