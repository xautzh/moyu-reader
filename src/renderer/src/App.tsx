import { FolderOpen } from 'lucide-react'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppCommand,
  DraftRecord,
  EditorMode,
  FindResult,
  MarkdownDocument,
  OpenDocumentResult,
  RecentFile,
  WorkspaceSnapshot
} from '../../shared/types'
import { ConfirmDialog } from './components/ConfirmDialog'
import { EditorToolbar } from './components/EditorToolbar'
import { FindBar } from './components/FindBar'
import { MarkdownView } from './components/MarkdownView'
import { RichMarkdownEditor, type RichMarkdownEditorHandle } from './components/RichMarkdownEditor'
import { Sidebar } from './components/Sidebar'
import { SourceEditor, type SourceEditorHandle } from './components/SourceEditor'
import { type ThemeMode, Toolbar } from './components/Toolbar'
import { type MarkdownEditCommand, shouldRestoreDraft } from './lib/editor'
import { buildStandaloneHtml } from './lib/export'
import { formatFileSize } from './lib/format'
import { joinFrontMatter, splitFrontMatter } from './lib/frontmatter'
import { estimateReadingStats, extractOutline } from './lib/markdown'

const THEME_STORAGE_KEY = 'moyu:theme'
const FONT_SCALE_STORAGE_KEY = 'moyu:font-scale'
const MODE_STORAGE_KEY = 'moyu:editor-mode'
const AUTOSAVE_STORAGE_KEY = 'moyu:autosave'
const FOCUS_STORAGE_KEY = 'moyu:focus-mode'
const TYPEWRITER_STORAGE_KEY = 'moyu:typewriter-mode'
const SCROLL_STORAGE_PREFIX = 'moyu:scroll:'
const MIN_FONT_SCALE = 0.8
const MAX_FONT_SCALE = 1.35

type NavigationRequest =
  | { kind: 'new' }
  | { kind: 'open-dialog' }
  | { kind: 'open-path'; filePath: string }
  | { kind: 'open-link'; href: string }

type UnsavedRequest = { kind: 'navigation'; request: NavigationRequest } | { kind: 'close' }

type SaveOutcome = 'saved' | 'cancelled' | 'conflict' | 'failed'

interface DraftPrompt {
  draft: DraftRecord
  document: MarkdownDocument
}

interface ConflictPrompt {
  diskDocument: MarkdownDocument
  reason: 'save' | 'external'
  afterSuccess?: () => void
  closePending: boolean
}

function createUntitledDocument(): MarkdownDocument {
  return {
    filePath: '',
    fileName: '未命名.md',
    content: '',
    modifiedAt: 0,
    size: 0,
    assetBaseUrl: ''
  }
}

function savedTheme(): ThemeMode {
  const value = localStorage.getItem(THEME_STORAGE_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function savedFontScale(): number {
  const value = Number(localStorage.getItem(FONT_SCALE_STORAGE_KEY))
  return Number.isFinite(value) && value >= MIN_FONT_SCALE && value <= MAX_FONT_SCALE ? value : 1
}

function savedEditorMode(): EditorMode {
  const value = localStorage.getItem(MODE_STORAGE_KEY)
  return value === 'wysiwyg' || value === 'source' || value === 'split' || value === 'preview'
    ? value
    : 'wysiwyg'
}

function savedBoolean(key: string): boolean {
  return localStorage.getItem(key) === 'true'
}

function scrollStorageKey(filePath: string): string {
  return `${SCROLL_STORAGE_PREFIX}${filePath.toLocaleLowerCase()}`
}

function baseNameWithoutMarkdownExtension(fileName: string): string {
  return fileName.replace(/\.(?:md|markdown|mdown|mkd)$/i, '') || '未命名'
}

function readableError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) {
    return fallback
  }
  const marker = error.message.lastIndexOf('Error: ')
  return marker >= 0 ? error.message.slice(marker + 7) : error.message
}

export default function App(): React.JSX.Element {
  const [documentMeta, setDocumentMeta] = useState<MarkdownDocument>(createUntitledDocument)
  const [content, setContent] = useState('')
  const [baselineContent, setBaselineContent] = useState('')
  const [documentSession, setDocumentSession] = useState(0)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 900)
  const [themeMode, setThemeMode] = useState<ThemeMode>(savedTheme)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const [fontScale, setFontScale] = useState(savedFontScale)
  const [mode, setMode] = useState<EditorMode>(savedEditorMode)
  const [autosave, setAutosave] = useState(() => savedBoolean(AUTOSAVE_STORAGE_KEY))
  const [focusMode, setFocusMode] = useState(() => savedBoolean(FOCUS_STORAGE_KEY))
  const [typewriterMode, setTypewriterMode] = useState(() => savedBoolean(TYPEWRITER_STORAGE_KEY))
  const [readingProgress, setReadingProgress] = useState(0)
  const [activeHeadingId, setActiveHeadingId] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findResult, setFindResult] = useState<FindResult | null>(null)
  const [unsavedRequest, setUnsavedRequest] = useState<UnsavedRequest | null>(null)
  const [draftPrompt, setDraftPrompt] = useState<DraftPrompt | null>(null)
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPrompt | null>(null)

  const previewScrollRef = useRef<HTMLDivElement>(null)
  const printRootRef = useRef<HTMLDivElement>(null)
  const sourceEditorRef = useRef<SourceEditorHandle>(null)
  const richEditorRef = useRef<RichMarkdownEditorHandle>(null)
  const toastTimerRef = useRef<number | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const dragDepthRef = useRef(0)
  const pendingAnchorRef = useRef<string | undefined>(undefined)
  const loadGenerationRef = useRef(0)
  const documentSessionRef = useRef(documentSession)
  const savingRef = useRef(false)
  const documentRef = useRef(documentMeta)
  const contentRef = useRef(content)
  const dirtyRef = useRef(false)

  const resolvedTheme = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode
  const dirty = content !== baselineContent
  const frontMatterSplit = useMemo(() => splitFrontMatter(content), [content])
  const renderedDocument = useMemo<MarkdownDocument>(
    () => ({
      ...documentMeta,
      content,
      size: new Blob([content]).size
    }),
    [content, documentMeta]
  )
  const outline = useMemo(() => extractOutline(content), [content])
  const readingStats = useMemo(() => estimateReadingStats(content), [content])

  const updateRichBody = useCallback((body: string) => {
    setContent((current) => joinFrontMatter(splitFrontMatter(current).frontMatter, body))
  }, [])

  documentRef.current = renderedDocument
  contentRef.current = content
  dirtyRef.current = dirty
  documentSessionRef.current = documentSession

  const notify = useCallback((message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    setToast(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToast('')
      toastTimerRef.current = null
    }, 2600)
  }, [])

  const refreshRecentFiles = useCallback(async () => {
    try {
      setRecentFiles(await window.moyu.getRecentFiles())
    } catch {
      notify('最近文件列表加载失败')
    }
  }, [notify])

  const loadDocument = useCallback(
    async (documentData: MarkdownDocument, anchor?: string, checkDraft = true) => {
      const generation = ++loadGenerationRef.current
      pendingAnchorRef.current = anchor
      setDocumentMeta(documentData)
      setContent(documentData.content)
      setBaselineContent(documentData.content)
      setDocumentSession((session) => session + 1)
      setActiveHeadingId(anchor ?? '')
      setReadingProgress(0)
      setFindResult(null)
      setDraftPrompt(null)
      setConflictPrompt(null)
      void refreshRecentFiles()

      if (documentData.filePath) {
        void window.moyu
          .workspaceForDocument(documentData.filePath)
          .then((snapshot) => {
            if (loadGenerationRef.current === generation) {
              setWorkspace(snapshot)
            }
          })
          .catch(() => undefined)
      }

      if (!checkDraft) {
        return
      }
      try {
        const draft = await window.moyu.getDraft(documentData.filePath)
        if (
          draft &&
          loadGenerationRef.current === generation &&
          shouldRestoreDraft(draft, documentData)
        ) {
          setDraftPrompt({ draft, document: documentData })
        }
      } catch {
        notify('草稿恢复信息读取失败')
      }
    },
    [notify, refreshRecentFiles]
  )

  const handleOpenResult = useCallback(
    (result: OpenDocumentResult | null) => {
      if (!result) {
        return
      }
      if (result.ok) {
        void loadDocument(result.document, result.anchor)
      } else {
        notify(result.message)
      }
    },
    [loadDocument, notify]
  )

  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindResult(null)
    window.moyu.stopFindInPage()
  }, [])

  const executeNavigation = useCallback(
    async (request: NavigationRequest) => {
      setIsBusy(true)
      try {
        if (request.kind === 'new') {
          await window.moyu.newDocument()
          ++loadGenerationRef.current
          const untitled = createUntitledDocument()
          pendingAnchorRef.current = undefined
          setDocumentMeta(untitled)
          setContent('')
          setBaselineContent('')
          setDocumentSession((session) => session + 1)
          setActiveHeadingId('')
          setReadingProgress(0)
          setConflictPrompt(null)
          closeFind()
          return
        }

        if (request.kind === 'open-dialog') {
          handleOpenResult(await window.moyu.openDialog())
          return
        }
        if (request.kind === 'open-path') {
          handleOpenResult(await window.moyu.openPath(request.filePath))
          return
        }

        const currentPath = documentRef.current.filePath
        if (!currentPath) {
          notify('请先保存当前文档，再打开相对链接')
          return
        }
        const result = await window.moyu.openLink(request.href, currentPath)
        if (!result.ok) {
          notify(result.message)
        } else if (result.kind === 'document') {
          void loadDocument(result.document, result.anchor)
        } else if (result.kind === 'anchor') {
          pendingAnchorRef.current = result.anchor
        }
      } catch (error) {
        notify(readableError(error, '无法完成打开操作'))
      } finally {
        setIsBusy(false)
      }
    },
    [closeFind, handleOpenResult, loadDocument, notify]
  )

  const requestNavigation = useCallback(
    (request: NavigationRequest) => {
      if (dirtyRef.current) {
        setConflictPrompt(null)
        setUnsavedRequest({ kind: 'navigation', request })
      } else {
        void executeNavigation(request)
      }
    },
    [executeNavigation]
  )

  const acceptSavedDocument = useCallback(
    async (savedDocument: MarkdownDocument, previousPath: string, afterSuccess?: () => void) => {
      ++loadGenerationRef.current
      const pathChanged =
        previousPath.toLocaleLowerCase() !== savedDocument.filePath.toLocaleLowerCase()
      setDocumentMeta(savedDocument)
      setContent(savedDocument.content)
      setBaselineContent(savedDocument.content)
      setConflictPrompt(null)
      if (pathChanged) {
        setDocumentSession((session) => session + 1)
      }
      window.moyu.setDirty(false)
      await Promise.all([
        window.moyu.clearDraft(previousPath),
        window.moyu.clearDraft(savedDocument.filePath)
      ]).catch(() => undefined)
      void refreshRecentFiles()
      void window.moyu
        .workspaceForDocument(savedDocument.filePath)
        .then(setWorkspace)
        .catch(() => undefined)
      notify('已保存')
      afterSuccess?.()
    },
    [notify, refreshRecentFiles]
  )

  const saveAsCurrent = useCallback(
    async (afterSuccess?: () => void): Promise<SaveOutcome> => {
      if (savingRef.current) {
        return 'failed'
      }
      savingRef.current = true
      setIsSaving(true)
      const previousPath = documentRef.current.filePath
      try {
        const result = await window.moyu.saveDocumentAs(
          contentRef.current,
          documentRef.current.fileName
        )
        if (!result) {
          return 'cancelled'
        }
        if (!result.ok) {
          notify(result.message)
          return 'failed'
        }
        await acceptSavedDocument(result.document, previousPath, afterSuccess)
        return 'saved'
      } catch (error) {
        notify(readableError(error, '另存为失败'))
        return 'failed'
      } finally {
        savingRef.current = false
        setIsSaving(false)
      }
    },
    [acceptSavedDocument, notify]
  )

  const saveCurrent = useCallback(
    async (
      force = false,
      afterSuccess?: () => void,
      closePending = false
    ): Promise<SaveOutcome> => {
      const current = documentRef.current
      if (!current.filePath) {
        return saveAsCurrent(afterSuccess)
      }
      if (savingRef.current) {
        return 'failed'
      }

      savingRef.current = true
      setIsSaving(true)
      try {
        const result = await window.moyu.saveDocument({
          filePath: current.filePath,
          content: contentRef.current,
          expectedModifiedAt: current.modifiedAt,
          force
        })
        if (!result.ok) {
          if (result.kind === 'conflict' && result.diskDocument) {
            setConflictPrompt({
              diskDocument: result.diskDocument,
              reason: 'save',
              afterSuccess,
              closePending
            })
            return 'conflict'
          }
          notify(result.message)
          return 'failed'
        }
        await acceptSavedDocument(result.document, current.filePath, afterSuccess)
        return 'saved'
      } catch (error) {
        notify(readableError(error, '保存失败'))
        return 'failed'
      } finally {
        savingRef.current = false
        setIsSaving(false)
      }
    },
    [acceptSavedDocument, notify, saveAsCurrent]
  )

  const openWorkspace = useCallback(async () => {
    try {
      const snapshot = await window.moyu.openWorkspace()
      if (snapshot) {
        setWorkspace(snapshot)
        setSidebarOpen(true)
      }
    } catch (error) {
      notify(readableError(error, '无法打开文件夹'))
    }
  }, [notify])

  const refreshWorkspace = useCallback(async () => {
    if (!workspace) {
      return
    }
    try {
      setWorkspace(await window.moyu.scanWorkspace(workspace.rootPath))
      notify('工作区已刷新')
    } catch (error) {
      notify(readableError(error, '工作区刷新失败'))
    }
  }, [notify, workspace])

  const exportHtmlCurrent = useCallback(async () => {
    await new Promise<void>((resolveFrame) => window.requestAnimationFrame(() => resolveFrame()))
    const bodyHtml = printRootRef.current?.querySelector('.markdown-body')?.innerHTML
    if (!bodyHtml) {
      notify('当前文档没有可导出的内容')
      return
    }
    setIsBusy(true)
    try {
      const name = `${baseNameWithoutMarkdownExtension(documentRef.current.fileName)}.html`
      const html = buildStandaloneHtml(
        documentRef.current.fileName,
        bodyHtml,
        documentRef.current.assetBaseUrl,
        resolvedTheme
      )
      const result = await window.moyu.exportHtml(html, name)
      if (result?.ok) {
        notify('HTML 已导出')
      } else if (result && !result.ok) {
        notify(result.message)
      }
    } catch (error) {
      notify(readableError(error, 'HTML 导出失败'))
    } finally {
      setIsBusy(false)
    }
  }, [notify, resolvedTheme])

  const exportPdfCurrent = useCallback(async () => {
    setIsBusy(true)
    try {
      const name = `${baseNameWithoutMarkdownExtension(documentRef.current.fileName)}.pdf`
      const result = await window.moyu.exportPdf(name)
      if (result?.ok) {
        notify('PDF 已导出')
      } else if (result && !result.ok) {
        notify(result.message)
      }
    } catch (error) {
      notify(readableError(error, 'PDF 导出失败'))
    } finally {
      setIsBusy(false)
    }
  }, [notify])

  const printCurrent = useCallback(async () => {
    try {
      const result = await window.moyu.printDocument()
      if (!result.ok) {
        notify(result.message)
      }
    } catch (error) {
      notify(readableError(error, '无法启动打印'))
    }
  }, [notify])

  const toggleFocusMode = useCallback(() => {
    setFocusMode((current) => {
      if (!current) {
        setSidebarOpen(false)
      }
      return !current
    })
  }, [])

  const toggleTypewriterMode = useCallback(() => {
    setTypewriterMode((current) => !current)
  }, [])

  const handleFormat = useCallback((command: MarkdownEditCommand) => {
    sourceEditorRef.current?.applyCommand(command)
  }, [])

  const insertImage = useCallback(async () => {
    const current = documentRef.current
    if (!current.filePath) {
      notify('请先保存文档，再插入本地图片')
      return
    }
    try {
      const asset = await window.moyu.chooseImage(current.filePath)
      if (!asset) {
        return
      }
      if (mode === 'wysiwyg') {
        richEditorRef.current?.insertImage(asset.relativePath, '图片')
      } else if (mode === 'source' || mode === 'split') {
        sourceEditorRef.current?.insertText(`![图片](${asset.relativePath})`)
      } else {
        setContent(
          (currentContent) =>
            `${currentContent.replace(/\s*$/, '')}\n\n![图片](${asset.relativePath})\n`
        )
        setMode('wysiwyg')
      }
    } catch (error) {
      notify(readableError(error, '图片插入失败'))
    }
  }, [mode, notify])

  const handleAppCommand = useCallback(
    (command: AppCommand) => {
      if (command === 'new') {
        requestNavigation({ kind: 'new' })
      } else if (command === 'open') {
        requestNavigation({ kind: 'open-dialog' })
      } else if (command === 'save') {
        void saveCurrent()
      } else if (command === 'save-as') {
        void saveAsCurrent()
      } else if (command === 'export-html') {
        void exportHtmlCurrent()
      } else if (command === 'export-pdf') {
        void exportPdfCurrent()
      } else if (command === 'print') {
        void printCurrent()
      } else if (command.startsWith('mode-')) {
        setMode(command.slice(5) as EditorMode)
      } else if (command === 'toggle-focus') {
        toggleFocusMode()
      } else if (command === 'toggle-typewriter') {
        toggleTypewriterMode()
      }
    },
    [
      exportHtmlCurrent,
      exportPdfCurrent,
      printCurrent,
      requestNavigation,
      saveAsCurrent,
      saveCurrent,
      toggleFocusMode,
      toggleTypewriterMode
    ]
  )

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
    localStorage.setItem(MODE_STORAGE_KEY, mode)
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, String(autosave))
    localStorage.setItem(FOCUS_STORAGE_KEY, String(focusMode))
    localStorage.setItem(TYPEWRITER_STORAGE_KEY, String(typewriterMode))
  }, [autosave, focusMode, mode, typewriterMode])

  useEffect(() => {
    window.moyu.setDirty(dirty)
    document.title = `${documentMeta.fileName}${dirty ? ' *' : ''} — 墨阅`
  }, [dirty, documentMeta.fileName])

  useEffect(() => {
    let disposed = false
    let openedByEvent = false
    const unsubscribeOpened = window.moyu.onDocumentOpened((documentData, anchor) => {
      openedByEvent = true
      void loadDocument(documentData, anchor)
    })
    const unsubscribeUpdated = window.moyu.onDocumentUpdated((documentData) => {
      if (
        documentRef.current.filePath &&
        documentRef.current.filePath.toLocaleLowerCase() ===
          documentData.filePath.toLocaleLowerCase()
      ) {
        void loadDocument(documentData, undefined, false)
        notify('已同步磁盘上的更改')
      }
    })
    const unsubscribeExternal = window.moyu.onExternalChange((diskDocument) => {
      if (
        documentRef.current.filePath.toLocaleLowerCase() ===
        diskDocument.filePath.toLocaleLowerCase()
      ) {
        setConflictPrompt({
          diskDocument,
          reason: 'external',
          closePending: false
        })
      }
    })
    const unsubscribeOpenRequested = window.moyu.onOpenRequested((filePath) => {
      requestNavigation({ kind: 'open-path', filePath })
    })
    const unsubscribeError = window.moyu.onDocumentError(notify)
    const unsubscribeFind = window.moyu.onFindResult(setFindResult)
    const unsubscribeClose = window.moyu.onCloseRequested(() => {
      if (dirtyRef.current) {
        setConflictPrompt(null)
        setUnsavedRequest({ kind: 'close' })
      } else {
        window.moyu.confirmClose()
      }
    })
    const unsubscribeCommand = window.moyu.onAppCommand(handleAppCommand)

    void refreshRecentFiles()
    void window.moyu.getCurrentDocument().then(async (documentData) => {
      if (disposed || openedByEvent) {
        return
      }
      if (documentData) {
        await loadDocument(documentData)
        return
      }
      try {
        const draft = await window.moyu.getDraft('')
        if (draft?.content && !disposed) {
          setDraftPrompt({ draft, document: createUntitledDocument() })
        }
      } catch {
        // Starting with a blank document remains safe when draft storage is unavailable.
      }
    })

    return () => {
      disposed = true
      unsubscribeOpened()
      unsubscribeUpdated()
      unsubscribeExternal()
      unsubscribeOpenRequested()
      unsubscribeError()
      unsubscribeFind()
      unsubscribeClose()
      unsubscribeCommand()
    }
  }, [handleAppCommand, loadDocument, notify, refreshRecentFiles, requestNavigation])

  useEffect(() => {
    if (!dirty) {
      return
    }
    const current = documentMeta
    const draftContent = content
    const timer = window.setTimeout(() => {
      void window.moyu
        .saveDraft({
          filePath: current.filePath,
          fileName: current.fileName,
          content: draftContent,
          baseModifiedAt: current.modifiedAt,
          updatedAt: Date.now(),
          assetBaseUrl: current.assetBaseUrl
        })
        .catch(() => undefined)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [content, dirty, documentMeta])

  useEffect(() => {
    if (!autosave || !dirty || !documentMeta.filePath || conflictPrompt || unsavedRequest) {
      return
    }
    const scheduledContent = content
    const timer = window.setTimeout(() => {
      if (contentRef.current === scheduledContent) {
        void saveCurrent()
      }
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [autosave, conflictPrompt, content, dirty, documentMeta.filePath, saveCurrent, unsavedRequest])

  useEffect(() => {
    if (!findOpen) {
      return
    }
    setFindResult(null)
    window.moyu.findInPage(findQuery, true, true)
  }, [findOpen, findQuery])

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
    const handleKeyboard = (event: KeyboardEvent): void => {
      const command = event.ctrlKey || event.metaKey
      const key = event.key.toLocaleLowerCase()

      if (!command) {
        if (event.key === 'Escape' && findOpen) {
          event.preventDefault()
          closeFind()
        } else if (event.key === 'F8') {
          event.preventDefault()
          toggleFocusMode()
        } else if (event.key === 'F9') {
          event.preventDefault()
          toggleTypewriterMode()
        }
        return
      }

      if (key === 's') {
        event.preventDefault()
        if (event.shiftKey) {
          void saveAsCurrent()
        } else {
          void saveCurrent()
        }
      } else if (key === 'n') {
        event.preventDefault()
        requestNavigation({ kind: 'new' })
      } else if (key === 'o') {
        event.preventDefault()
        requestNavigation({ kind: 'open-dialog' })
      } else if (key === 'b' && event.shiftKey) {
        event.preventDefault()
        setSidebarOpen((open) => !open)
      } else if ((key === 'b' || key === 'i') && (mode === 'source' || mode === 'split')) {
        event.preventDefault()
        handleFormat(key === 'b' ? 'bold' : 'italic')
      } else if (key === 'f') {
        event.preventDefault()
        setFindOpen(true)
      } else if (['1', '2', '3', '4'].includes(key)) {
        event.preventDefault()
        const modes: EditorMode[] = ['wysiwyg', 'source', 'split', 'preview']
        setMode(modes[Number(key) - 1])
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
  }, [
    adjustFontScale,
    closeFind,
    findOpen,
    handleFormat,
    mode,
    requestNavigation,
    saveAsCurrent,
    saveCurrent,
    toggleFocusMode,
    toggleTypewriterMode
  ])

  useEffect(() => {
    const eventInsideEditor = (event: globalThis.DragEvent): boolean =>
      event.target instanceof Element &&
      Boolean(event.target.closest('.rich-editor, .source-editor'))

    const handleDragEnter = (event: globalThis.DragEvent): void => {
      event.preventDefault()
      if (eventInsideEditor(event)) {
        dragDepthRef.current = 0
        setIsDragging(false)
        return
      }
      dragDepthRef.current += 1
      setIsDragging(true)
    }
    const handleDragOver = (event: globalThis.DragEvent): void => event.preventDefault()
    const handleDragLeave = (event: globalThis.DragEvent): void => {
      event.preventDefault()
      if (eventInsideEditor(event)) {
        dragDepthRef.current = 0
        setIsDragging(false)
        return
      }
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDragging(false)
      }
    }
    const handleDrop = (event: globalThis.DragEvent): void => {
      event.preventDefault()
      dragDepthRef.current = 0
      setIsDragging(false)
      if (eventInsideEditor(event)) {
        return
      }
      const file = event.dataTransfer?.files[0]
      if (!file) {
        return
      }
      if (!/\.(?:md|markdown|mdown|mkd)$/i.test(file.name)) {
        notify('请拖入 Markdown 文档')
        return
      }
      const filePath = window.moyu.getPathForFile(file)
      if (!filePath) {
        notify('无法识别拖入的文件')
        return
      }
      requestNavigation({ kind: 'open-path', filePath })
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
  }, [notify, requestNavigation])

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

  const scrollToPreviewAnchor = useCallback((anchor: string): boolean => {
    const reader = previewScrollRef.current
    if (!reader) {
      return false
    }
    const target = reader.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`)
    if (!target) {
      return false
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return true
  }, [])

  useEffect(() => {
    if (mode !== 'preview' && mode !== 'split') {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      if (documentSessionRef.current !== documentSession) {
        return
      }
      const anchor = pendingAnchorRef.current
      if (anchor && scrollToPreviewAnchor(anchor)) {
        pendingAnchorRef.current = undefined
        return
      }
      if (documentMeta.filePath && previewScrollRef.current) {
        const savedPosition = Number(localStorage.getItem(scrollStorageKey(documentMeta.filePath)))
        previewScrollRef.current.scrollTop = Number.isFinite(savedPosition) ? savedPosition : 0
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [documentMeta.filePath, documentSession, mode, scrollToPreviewAnchor])

  const updateReadingPosition = useCallback(() => {
    if (scrollFrameRef.current) {
      return
    }
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const reader = previewScrollRef.current
      if (!reader) {
        return
      }
      const availableScroll = reader.scrollHeight - reader.clientHeight
      setReadingProgress(
        availableScroll <= 0
          ? 100
          : Math.min(100, Math.round((reader.scrollTop / availableScroll) * 100))
      )
      if (documentRef.current.filePath) {
        localStorage.setItem(
          scrollStorageKey(documentRef.current.filePath),
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
  }, [])

  const handleHeadingClick = useCallback(
    (id: string) => {
      setActiveHeadingId(id)
      if (mode === 'wysiwyg') {
        const index = outline.findIndex((item) => item.id === id)
        const headings = document.querySelectorAll<HTMLElement>(
          '.rich-editor .ProseMirror h1, .rich-editor .ProseMirror h2, .rich-editor .ProseMirror h3, .rich-editor .ProseMirror h4, .rich-editor .ProseMirror h5, .rich-editor .ProseMirror h6'
        )
        headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else if (mode === 'source') {
        pendingAnchorRef.current = id
        setMode('preview')
      } else if (!scrollToPreviewAnchor(id)) {
        notify('没有找到对应的标题')
      }
      if (window.innerWidth < 900) {
        setSidebarOpen(false)
      }
    },
    [mode, notify, outline, scrollToPreviewAnchor]
  )

  const handleLink = useCallback(
    (href: string) => {
      if (href.startsWith('#')) {
        if (!scrollToPreviewAnchor(href.slice(1))) {
          notify('没有找到链接对应的标题')
        }
        return
      }
      const request: NavigationRequest = { kind: 'open-link', href }
      if (/^(?:https?:|mailto:)/i.test(href)) {
        void executeNavigation(request)
      } else {
        requestNavigation(request)
      }
    },
    [executeNavigation, notify, requestNavigation, scrollToPreviewAnchor]
  )

  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ['system', 'light', 'dark']
    setThemeMode((current) => order[(order.indexOf(current) + 1) % order.length])
  }, [])

  const removeRecent = useCallback(async (filePath: string) => {
    setRecentFiles(await window.moyu.removeRecentFile(filePath))
  }, [])

  const clearRecent = useCallback(async () => {
    await window.moyu.clearRecentFiles()
    setRecentFiles([])
    notify('最近文件记录已清空')
  }, [notify])

  const cancelUnsavedRequest = useCallback(() => {
    if (unsavedRequest?.kind === 'close') {
      window.moyu.cancelClose()
    }
    setUnsavedRequest(null)
  }, [unsavedRequest])

  const discardUnsavedChanges = useCallback(async () => {
    const request = unsavedRequest
    if (!request) {
      return
    }
    setUnsavedRequest(null)
    await window.moyu.clearDraft(documentRef.current.filePath).catch(() => undefined)
    if (request.kind === 'close') {
      window.moyu.confirmClose()
    } else {
      void executeNavigation(request.request)
    }
  }, [executeNavigation, unsavedRequest])

  const saveBeforeContinuing = useCallback(async () => {
    const request = unsavedRequest
    if (!request) {
      return
    }
    setUnsavedRequest(null)
    const afterSuccess =
      request.kind === 'close'
        ? () => window.moyu.confirmClose()
        : () => void executeNavigation(request.request)
    const outcome = await saveCurrent(false, afterSuccess, request.kind === 'close')
    if (request.kind === 'close' && outcome !== 'saved' && outcome !== 'conflict') {
      window.moyu.cancelClose()
    }
  }, [executeNavigation, saveCurrent, unsavedRequest])

  const restoreDraft = useCallback(() => {
    if (!draftPrompt) {
      return
    }
    ++loadGenerationRef.current
    setDocumentMeta(draftPrompt.document)
    setBaselineContent(draftPrompt.document.content)
    setContent(draftPrompt.draft.content)
    setDocumentSession((session) => session + 1)
    setDraftPrompt(null)
    notify('已恢复未保存草稿')
  }, [draftPrompt, notify])

  const discardDraft = useCallback(async () => {
    if (!draftPrompt) {
      return
    }
    await window.moyu.clearDraft(draftPrompt.draft.filePath).catch(() => undefined)
    setDraftPrompt(null)
  }, [draftPrompt])

  const continueAfterConflict = useCallback(() => {
    if (conflictPrompt?.closePending) {
      window.moyu.cancelClose()
    }
    setConflictPrompt(null)
  }, [conflictPrompt])

  const reloadConflictDocument = useCallback(async () => {
    if (!conflictPrompt) {
      return
    }
    const prompt = conflictPrompt
    setConflictPrompt(null)
    await window.moyu.clearDraft(documentRef.current.filePath).catch(() => undefined)
    await loadDocument(prompt.diskDocument, undefined, false)
    prompt.afterSuccess?.()
  }, [conflictPrompt, loadDocument])

  const overwriteConflictDocument = useCallback(async () => {
    if (!conflictPrompt) {
      return
    }
    const prompt = conflictPrompt
    setConflictPrompt(null)
    const outcome = await saveCurrent(true, prompt.afterSuccess, prompt.closePending)
    if (prompt.closePending && outcome !== 'saved' && outcome !== 'conflict') {
      window.moyu.cancelClose()
    }
  }, [conflictPrompt, saveCurrent])

  const shellStyle = { '--reader-scale': fontScale } as CSSProperties
  const modeLabel: Record<EditorMode, string> = {
    wysiwyg: '所见即所得',
    source: '源码',
    split: '分屏',
    preview: '预览'
  }
  const noOpLink = useCallback(() => undefined, [])

  return (
    <div
      className={`app-shell theme-${resolvedTheme} platform-${window.moyu.platform} ${focusMode ? 'focus-mode' : ''}`}
      style={shellStyle}
    >
      <Toolbar
        platform={window.moyu.platform}
        document={renderedDocument}
        dirty={dirty}
        saving={isSaving}
        sidebarOpen={sidebarOpen}
        themeMode={themeMode}
        fontScale={fontScale}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onNew={() => requestNavigation({ kind: 'new' })}
        onOpen={() => requestNavigation({ kind: 'open-dialog' })}
        onSave={() => void saveCurrent()}
        onReveal={() => documentMeta.filePath && void window.moyu.revealFile(documentMeta.filePath)}
        onToggleFind={() => (findOpen ? closeFind() : setFindOpen(true))}
        onCycleTheme={cycleTheme}
        onFontDecrease={() => adjustFontScale(-0.05)}
        onFontIncrease={() => adjustFontScale(0.05)}
      />

      <EditorToolbar
        mode={mode}
        canUseAssets={Boolean(documentMeta.filePath)}
        autosave={autosave}
        focusMode={focusMode}
        typewriterMode={typewriterMode}
        onModeChange={setMode}
        onFormat={handleFormat}
        onInsertImage={() => void insertImage()}
        onExportHtml={() => void exportHtmlCurrent()}
        onExportPdf={() => void exportPdfCurrent()}
        onToggleAutosave={() => setAutosave((enabled) => !enabled)}
        onToggleFocus={toggleFocusMode}
        onToggleTypewriter={toggleTypewriterMode}
      />

      <div className={`workspace ${sidebarOpen ? 'sidebar-visible' : ''}`}>
        <Sidebar
          open={sidebarOpen}
          document={renderedDocument}
          outline={outline}
          activeHeadingId={activeHeadingId}
          recentFiles={recentFiles}
          workspace={workspace}
          onClose={() => setSidebarOpen(false)}
          onHeadingClick={handleHeadingClick}
          onRecentClick={(filePath) => requestNavigation({ kind: 'open-path', filePath })}
          onRemoveRecent={(filePath) => void removeRecent(filePath)}
          onClearRecent={() => void clearRecent()}
          onOpenWorkspace={() => void openWorkspace()}
          onRefreshWorkspace={() => void refreshWorkspace()}
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
            open={findOpen}
            query={findQuery}
            result={findResult}
            onQueryChange={setFindQuery}
            onPrevious={() => window.moyu.findInPage(findQuery, false, false)}
            onNext={() => window.moyu.findInPage(findQuery, true, false)}
            onClose={closeFind}
          />

          <div className={`editor-workbench mode-${mode}`}>
            {mode === 'wysiwyg' && (
              <section className="editor-pane rich-pane" aria-label="所见即所得编辑器">
                <div className="editor-scroll">
                  {frontMatterSplit.hasFrontMatter && (
                    <aside className="frontmatter-notice" aria-label="Front Matter 已安全保留">
                      <span>
                        <strong>Front Matter 已安全保留</strong>
                        <small>元数据不会进入正文渲染，也不会被富文本格式化</small>
                      </span>
                      <button type="button" onClick={() => setMode('source')}>
                        编辑元数据
                      </button>
                    </aside>
                  )}
                  <RichMarkdownEditor
                    key={`${documentSession}:${documentMeta.filePath}`}
                    ref={richEditorRef}
                    value={frontMatterSplit.body}
                    assetBaseUrl={documentMeta.assetBaseUrl}
                    documentPath={documentMeta.filePath}
                    typewriterMode={typewriterMode}
                    onChange={updateRichBody}
                    onNotify={notify}
                  />
                </div>
              </section>
            )}

            {(mode === 'source' || mode === 'split') && (
              <section className="editor-pane source-pane" aria-label="源码编辑器">
                <SourceEditor
                  ref={sourceEditorRef}
                  value={content}
                  dark={resolvedTheme === 'dark'}
                  typewriterMode={typewriterMode}
                  onChange={setContent}
                />
              </section>
            )}

            {(mode === 'preview' || mode === 'split') && (
              <section className="editor-pane preview-pane" aria-label="实时预览">
                <div
                  className="reader-scroll preview-scroll"
                  ref={previewScrollRef}
                  onScroll={updateReadingPosition}
                >
                  <div className="document-surface">
                    <MarkdownView
                      document={renderedDocument}
                      theme={resolvedTheme}
                      onOpenLink={handleLink}
                      onNotify={notify}
                    />
                    <div className="document-end" aria-hidden="true">
                      <span />
                      文档结束
                      <span />
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          <footer className="statusbar">
            <span className={`save-state ${dirty ? 'is-dirty' : ''}`}>
              {isSaving
                ? '保存中…'
                : dirty
                  ? '未保存'
                  : documentMeta.filePath
                    ? '已保存'
                    : '新文档'}
            </span>
            <span>{modeLabel[mode]}</span>
            <span>{readingStats.words.toLocaleString('zh-CN')} 字词</span>
            <span>{readingStats.minutes} 分钟阅读</span>
            <span>{readingStats.lines.toLocaleString('zh-CN')} 行</span>
            <span>{formatFileSize(renderedDocument.size)}</span>
            <button
              type="button"
              disabled={!documentMeta.filePath}
              onClick={() => documentMeta.filePath && window.moyu.revealFile(documentMeta.filePath)}
              title={documentMeta.filePath}
            >
              {documentMeta.filePath || '尚未保存到磁盘'}
            </button>
            {(mode === 'preview' || mode === 'split') && (
              <span className="progress-label">{readingProgress}%</span>
            )}
          </footer>
          <div
            className="reading-progress"
            style={{ transform: `scaleX(${readingProgress / 100})` }}
          />
        </main>
      </div>

      <div className="print-root" ref={printRootRef} aria-hidden="true">
        <MarkdownView
          document={renderedDocument}
          theme={resolvedTheme}
          onOpenLink={noOpLink}
          onNotify={notify}
        />
      </div>

      {isDragging && (
        <div className="drop-overlay" aria-live="polite">
          <div className="drop-card">
            <FolderOpen size={28} />
            <strong>松开即可打开</strong>
            <span>支持 Markdown 文件</span>
          </div>
        </div>
      )}
      {(isBusy || isSaving) && (
        <div className="busy-indicator" role="status">
          <span className="spinner" />
          {isSaving ? '正在保存' : '正在处理'}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(unsavedRequest)}
        title="保存对文档的更改？"
        description="当前内容尚未保存。继续操作会丢失这些更改。"
        detail={documentMeta.fileName}
        onCancel={cancelUnsavedRequest}
        actions={[
          { label: '取消', onClick: cancelUnsavedRequest },
          { label: '不保存', tone: 'danger', onClick: () => void discardUnsavedChanges() },
          {
            label: '保存',
            tone: 'primary',
            disabled: isSaving,
            onClick: () => void saveBeforeContinuing()
          }
        ]}
      />

      <ConfirmDialog
        open={Boolean(draftPrompt)}
        title="发现未保存的草稿"
        description="墨阅在上次编辑时保留了更新的草稿，你可以恢复它或继续使用磁盘版本。"
        detail={
          draftPrompt
            ? `草稿时间：${new Date(draftPrompt.draft.updatedAt).toLocaleString('zh-CN')}`
            : undefined
        }
        onCancel={() => void discardDraft()}
        actions={[
          { label: '使用磁盘版本', onClick: () => void discardDraft() },
          { label: '恢复草稿', tone: 'primary', onClick: restoreDraft }
        ]}
      />

      <ConfirmDialog
        open={Boolean(conflictPrompt)}
        title="检测到磁盘版本冲突"
        description={
          conflictPrompt?.reason === 'external'
            ? '其他程序刚刚修改了此文件。为避免覆盖内容，请选择如何处理。'
            : '保存前发现磁盘文件已有更新。覆盖会替换其他程序写入的版本。'
        }
        detail={
          conflictPrompt
            ? `磁盘修改时间：${new Date(conflictPrompt.diskDocument.modifiedAt).toLocaleString('zh-CN')}`
            : undefined
        }
        onCancel={continueAfterConflict}
        actions={[
          { label: '继续编辑', onClick: continueAfterConflict },
          { label: '重新载入', onClick: () => void reloadConflictDocument() },
          {
            label: '覆盖磁盘',
            tone: 'danger',
            disabled: isSaving,
            onClick: () => void overwriteConflictDocument()
          }
        ]}
      />
    </div>
  )
}
