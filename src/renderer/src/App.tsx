import {
  ArrowRight,
  Clock3,
  FileText,
  FolderOpen,
  Keyboard,
  ListTree,
  RefreshCw
} from 'lucide-react'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  FindResult,
  MarkdownDocument,
  OpenDocumentResult,
  RecentFile
} from '../../shared/types'
import { BrandMark } from './components/BrandMark'
import { FindBar } from './components/FindBar'
import { MarkdownView } from './components/MarkdownView'
import { Sidebar } from './components/Sidebar'
import { type ThemeMode, Toolbar } from './components/Toolbar'
import { formatFileSize } from './lib/format'
import { estimateReadingStats, extractOutline } from './lib/markdown'

const THEME_STORAGE_KEY = 'moyu:theme'
const FONT_SCALE_STORAGE_KEY = 'moyu:font-scale'
const SCROLL_STORAGE_PREFIX = 'moyu:scroll:'
const MIN_FONT_SCALE = 0.8
const MAX_FONT_SCALE = 1.35

function savedTheme(): ThemeMode {
  const value = localStorage.getItem(THEME_STORAGE_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function savedFontScale(): number {
  const value = Number(localStorage.getItem(FONT_SCALE_STORAGE_KEY))
  return Number.isFinite(value) && value >= MIN_FONT_SCALE && value <= MAX_FONT_SCALE ? value : 1
}

function scrollStorageKey(filePath: string): string {
  return `${SCROLL_STORAGE_PREFIX}${filePath.toLocaleLowerCase()}`
}

function scrollToAnchor(anchor: string): boolean {
  const decodedAnchor = (() => {
    try {
      return decodeURIComponent(anchor)
    } catch {
      return anchor
    }
  })()
  const target = document.getElementById(decodedAnchor)
  if (!target) {
    return false
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}

export default function App(): React.JSX.Element {
  const [currentDocument, setCurrentDocument] = useState<MarkdownDocument | null>(null)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 900)
  const [themeMode, setThemeMode] = useState<ThemeMode>(savedTheme)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const [fontScale, setFontScale] = useState(savedFontScale)
  const [readingProgress, setReadingProgress] = useState(0)
  const [activeHeadingId, setActiveHeadingId] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findResult, setFindResult] = useState<FindResult | null>(null)

  const readerRef = useRef<HTMLDivElement>(null)
  const toastTimerRef = useRef<number | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const dragDepthRef = useRef(0)
  const pendingNavigationRef = useRef<{ filePath: string; anchor?: string } | null>(null)

  const resolvedTheme = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode
  const outline = useMemo(
    () => (currentDocument ? extractOutline(currentDocument.content) : []),
    [currentDocument]
  )
  const readingStats = useMemo(
    () => (currentDocument ? estimateReadingStats(currentDocument.content) : null),
    [currentDocument]
  )

  const notify = useCallback((message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    setToast(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToast('')
      toastTimerRef.current = null
    }, 2400)
  }, [])

  const refreshRecentFiles = useCallback(async () => {
    try {
      setRecentFiles(await window.moyu.getRecentFiles())
    } catch {
      notify('最近文件列表加载失败')
    }
  }, [notify])

  const applyOpenedDocument = useCallback(
    (documentData: MarkdownDocument, anchor?: string) => {
      pendingNavigationRef.current = { filePath: documentData.filePath, anchor }
      setCurrentDocument(documentData)
      setActiveHeadingId(anchor ?? '')
      setReadingProgress(0)
      setFindResult(null)
      document.title = `${documentData.fileName} — 墨阅`
      void refreshRecentFiles()
    },
    [refreshRecentFiles]
  )

  const handleOpenResult = useCallback(
    (result: OpenDocumentResult | null) => {
      if (!result) {
        return
      }
      if (result.ok) {
        applyOpenedDocument(result.document, result.anchor)
      } else {
        notify(result.message)
      }
    },
    [applyOpenedDocument, notify]
  )

  const openDialog = useCallback(async () => {
    setIsBusy(true)
    try {
      handleOpenResult(await window.moyu.openDialog())
    } catch {
      notify('打开文件时发生异常')
    } finally {
      setIsBusy(false)
    }
  }, [handleOpenResult, notify])

  const openPath = useCallback(
    async (filePath: string) => {
      setIsBusy(true)
      try {
        handleOpenResult(await window.moyu.openPath(filePath))
      } catch {
        notify('无法打开所选文件')
      } finally {
        setIsBusy(false)
      }
    },
    [handleOpenResult, notify]
  )

  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindResult(null)
    window.moyu.stopFindInPage()
  }, [])

  const adjustFontScale = useCallback((delta: number) => {
    setFontScale((current) => {
      const next = Math.min(
        MAX_FONT_SCALE,
        Math.max(MIN_FONT_SCALE, Number((current + delta).toFixed(2)))
      )
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(next))
      return next
    })
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.style.colorScheme = resolvedTheme
    window.moyu.setTitlebarTheme(resolvedTheme)
    localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [resolvedTheme, themeMode])

  useEffect(() => {
    const unsubscribeOpened = window.moyu.onDocumentOpened((documentData, anchor) => {
      applyOpenedDocument(documentData, anchor)
    })
    const unsubscribeUpdated = window.moyu.onDocumentUpdated((documentData) => {
      setCurrentDocument(documentData)
      notify('已同步磁盘上的更改')
    })
    const unsubscribeError = window.moyu.onDocumentError(notify)
    const unsubscribeFind = window.moyu.onFindResult(setFindResult)

    void refreshRecentFiles()
    void window.moyu.getCurrentDocument().then((documentData) => {
      if (documentData) {
        applyOpenedDocument(documentData)
      }
    })

    return () => {
      unsubscribeOpened()
      unsubscribeUpdated()
      unsubscribeError()
      unsubscribeFind()
    }
  }, [applyOpenedDocument, notify, refreshRecentFiles])

  useEffect(() => {
    const pendingNavigation = pendingNavigationRef.current
    if (
      !currentDocument ||
      !pendingNavigation ||
      pendingNavigation.filePath !== currentDocument.filePath
    ) {
      return
    }

    pendingNavigationRef.current = null
    window.requestAnimationFrame(() => {
      const reader = readerRef.current
      if (!reader) {
        return
      }

      if (pendingNavigation.anchor && scrollToAnchor(pendingNavigation.anchor)) {
        return
      }

      const savedPosition = Number(localStorage.getItem(scrollStorageKey(currentDocument.filePath)))
      reader.scrollTop = Number.isFinite(savedPosition) ? savedPosition : 0
    })
  }, [currentDocument])

  useEffect(() => {
    if (!findOpen) {
      return
    }
    setFindResult(null)
    window.moyu.findInPage(findQuery, true, true)
  }, [findOpen, findQuery])

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent): void => {
      const command = event.ctrlKey || event.metaKey
      if (!command) {
        if (event.key === 'Escape' && findOpen) {
          event.preventDefault()
          closeFind()
        }
        return
      }

      const key = event.key.toLocaleLowerCase()
      if (key === 'b') {
        event.preventDefault()
        setSidebarOpen((open) => !open)
      } else if (key === 'f' && currentDocument) {
        event.preventDefault()
        setFindOpen(true)
      } else if (key === '=' || key === '+') {
        event.preventDefault()
        adjustFontScale(0.05)
      } else if (key === '-') {
        event.preventDefault()
        adjustFontScale(-0.05)
      } else if (key === '0') {
        event.preventDefault()
        setFontScale(1)
        localStorage.setItem(FONT_SCALE_STORAGE_KEY, '1')
      }
    }

    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [adjustFontScale, closeFind, currentDocument, findOpen])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [])

  const updateReadingPosition = useCallback(() => {
    if (scrollFrameRef.current) {
      return
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const reader = readerRef.current
      if (!reader) {
        return
      }

      const availableScroll = reader.scrollHeight - reader.clientHeight
      setReadingProgress(
        availableScroll <= 0
          ? 100
          : Math.min(100, Math.round((reader.scrollTop / availableScroll) * 100))
      )

      if (currentDocument) {
        localStorage.setItem(
          scrollStorageKey(currentDocument.filePath),
          String(Math.round(reader.scrollTop))
        )
      }

      const containerTop = reader.getBoundingClientRect().top
      const headings = Array.from(
        reader.querySelectorAll<HTMLElement>(
          '.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6'
        )
      )
      let currentId = headings[0]?.id ?? ''
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top - containerTop <= 132) {
          currentId = heading.id
        } else {
          break
        }
      }
      setActiveHeadingId(currentId)
    })
  }, [currentDocument])

  const handleHeadingClick = useCallback((id: string) => {
    if (scrollToAnchor(id)) {
      setActiveHeadingId(id)
      if (window.innerWidth < 900) {
        setSidebarOpen(false)
      }
    }
  }, [])

  const handleLink = useCallback(
    async (href: string) => {
      if (!currentDocument) {
        return
      }
      if (href.startsWith('#')) {
        if (!scrollToAnchor(href.slice(1))) {
          notify('没有找到链接对应的标题')
        }
        return
      }

      try {
        const result = await window.moyu.openLink(href, currentDocument.filePath)
        if (!result.ok) {
          notify(result.message)
        } else if (result.kind === 'document') {
          applyOpenedDocument(result.document, result.anchor)
        } else if (result.kind === 'anchor') {
          scrollToAnchor(result.anchor)
        }
      } catch {
        notify('无法打开此链接')
      }
    },
    [applyOpenedDocument, currentDocument, notify]
  )

  useEffect(() => {
    const handleDragEnter = (event: globalThis.DragEvent): void => {
      event.preventDefault()
      dragDepthRef.current += 1
      setIsDragging(true)
    }
    const handleDragOver = (event: globalThis.DragEvent): void => event.preventDefault()
    const handleDragLeave = (event: globalThis.DragEvent): void => {
      event.preventDefault()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDragging(false)
      }
    }
    const handleDrop = (event: globalThis.DragEvent): void => {
      event.preventDefault()
      dragDepthRef.current = 0
      setIsDragging(false)
      const file = event.dataTransfer?.files[0]
      if (!file) {
        return
      }
      const filePath = window.moyu.getPathForFile(file)
      if (!filePath) {
        notify('无法识别拖入的文件')
        return
      }
      void openPath(filePath)
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [notify, openPath])

  const cycleTheme = (): void => {
    const order: ThemeMode[] = ['system', 'light', 'dark']
    setThemeMode((current) => order[(order.indexOf(current) + 1) % order.length])
  }

  const removeRecent = async (filePath: string): Promise<void> => {
    setRecentFiles(await window.moyu.removeRecentFile(filePath))
  }

  const clearRecent = async (): Promise<void> => {
    await window.moyu.clearRecentFiles()
    setRecentFiles([])
    notify('最近文件记录已清空')
  }

  const shellStyle = { '--reader-scale': fontScale } as CSSProperties

  return (
    <div
      className={`app-shell theme-${resolvedTheme} platform-${window.moyu.platform}`}
      style={shellStyle}
    >
      <Toolbar
        platform={window.moyu.platform}
        document={currentDocument}
        sidebarOpen={sidebarOpen}
        themeMode={themeMode}
        fontScale={fontScale}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onOpen={openDialog}
        onReveal={() => currentDocument && void window.moyu.revealFile(currentDocument.filePath)}
        onToggleFind={() => (findOpen ? closeFind() : setFindOpen(true))}
        onCycleTheme={cycleTheme}
        onFontDecrease={() => adjustFontScale(-0.05)}
        onFontIncrease={() => adjustFontScale(0.05)}
      />

      <div className={`workspace ${sidebarOpen ? 'sidebar-visible' : ''}`}>
        <Sidebar
          open={sidebarOpen}
          document={currentDocument}
          outline={outline}
          activeHeadingId={activeHeadingId}
          recentFiles={recentFiles}
          onClose={() => setSidebarOpen(false)}
          onHeadingClick={handleHeadingClick}
          onRecentClick={(filePath) => void openPath(filePath)}
          onRemoveRecent={(filePath) => void removeRecent(filePath)}
          onClearRecent={() => void clearRecent()}
        />
        {sidebarOpen && (
          <button
            className="sidebar-backdrop"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭侧栏"
          />
        )}

        <main className="reader-pane">
          <FindBar
            open={findOpen && Boolean(currentDocument)}
            query={findQuery}
            result={findResult}
            onQueryChange={setFindQuery}
            onPrevious={() => window.moyu.findInPage(findQuery, false, false)}
            onNext={() => window.moyu.findInPage(findQuery, true, false)}
            onClose={closeFind}
          />

          <div className="reader-scroll" ref={readerRef} onScroll={updateReadingPosition}>
            {currentDocument ? (
              <div className="document-surface">
                <MarkdownView
                  document={currentDocument}
                  onOpenLink={handleLink}
                  onNotify={notify}
                />
                <div className="document-end" aria-hidden="true">
                  <span />
                  文档结束
                  <span />
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-hero">
                  <BrandMark size="large" />
                  <p className="eyebrow">FOCUSED MARKDOWN READER</p>
                  <h1>让文字回到阅读本身</h1>
                  <p className="empty-description">
                    打开本地 Markdown
                    文档，墨阅会为你整理目录、保留阅读位置，并在文件变化时自动同步。
                  </p>
                  <button className="open-hero-button" type="button" onClick={openDialog}>
                    <FolderOpen size={18} />
                    选择 Markdown 文件
                    <ArrowRight size={16} />
                  </button>
                  <p className="drop-hint">也可以把 .md 文件直接拖到窗口</p>
                </div>

                <section className="feature-strip" aria-label="核心功能">
                  <div className="feature-item">
                    <ListTree size={18} />
                    <span>
                      <strong>自动目录</strong>
                      <small>快速定位章节</small>
                    </span>
                  </div>
                  <div className="feature-item">
                    <RefreshCw size={18} />
                    <span>
                      <strong>实时同步</strong>
                      <small>磁盘改动自动刷新</small>
                    </span>
                  </div>
                  <div className="feature-item">
                    <Keyboard size={18} />
                    <span>
                      <strong>键盘友好</strong>
                      <small>查找、字号与侧栏</small>
                    </span>
                  </div>
                </section>

                {recentFiles.length > 0 && (
                  <section className="empty-recents">
                    <div className="empty-recents-heading">
                      <span>
                        <Clock3 size={15} />
                        继续阅读
                      </span>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => void clearRecent()}
                      >
                        清空
                      </button>
                    </div>
                    <div className="empty-recent-grid">
                      {recentFiles.slice(0, 4).map((file) => (
                        <button
                          type="button"
                          key={file.path}
                          onClick={() => void openPath(file.path)}
                          title={file.path}
                        >
                          <FileText size={18} />
                          <span>{file.name}</span>
                          <ArrowRight size={15} />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          <footer className="statusbar">
            {currentDocument && readingStats ? (
              <>
                <span>{readingStats.words.toLocaleString('zh-CN')} 字词</span>
                <span>{readingStats.minutes} 分钟阅读</span>
                <span>{readingStats.lines.toLocaleString('zh-CN')} 行</span>
                <span>{formatFileSize(currentDocument.size)}</span>
                <button
                  type="button"
                  onClick={() => window.moyu.revealFile(currentDocument.filePath)}
                  title={currentDocument.filePath}
                >
                  {currentDocument.filePath}
                </button>
                <span className="progress-label">{readingProgress}%</span>
              </>
            ) : (
              <span>就绪 · 支持 .md / .markdown / .mdown / .mkd</span>
            )}
          </footer>
          <div
            className="reading-progress"
            style={{ transform: `scaleX(${readingProgress / 100})` }}
          />
        </main>
      </div>

      {isDragging && (
        <div className="drop-overlay" aria-live="polite">
          <div className="drop-card">
            <FolderOpen size={28} />
            <strong>松开即可阅读</strong>
            <span>支持 Markdown 文件</span>
          </div>
        </div>
      )}
      {isBusy && (
        <div className="busy-indicator" role="status">
          <span className="spinner" />
          正在打开文档
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
