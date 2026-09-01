import { type FSWatcher, watch } from 'node:fs'
import { access, readFile, stat, writeFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve
} from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  net,
  protocol,
  shell
} from 'electron'
import type {
  MarkdownDocument,
  OpenDocumentResult,
  OpenLinkResult,
  RecentFile
} from '../shared/types'
import { isMarkdownFile, pickMarkdownArgument, sanitizeRecentFiles } from './file-utils'

const currentDirectory = __dirname
const MAX_FILE_SIZE = 20 * 1024 * 1024
const RECENT_FILE_LIMIT = 12
const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp'
])

let mainWindow: BrowserWindow | null = null
let activeDocument: MarkdownDocument | null = null
let activeWatcher: FSWatcher | null = null
let watcherTimer: NodeJS.Timeout | null = null
let startupFilePath = pickMarkdownArgument(process.argv)
const allowedAssetRoots = new Set<string>()

if (process.env.MOYU_USER_DATA_DIR) {
  app.setPath('userData', resolve(process.env.MOYU_USER_DATA_DIR))
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'moyu-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

function normalizedKey(filePath: string): string {
  return normalize(filePath).toLocaleLowerCase('en-US')
}

function isInsideDirectory(rootPath: string, candidatePath: string): boolean {
  const pathFromRoot = relative(rootPath, candidatePath)
  return (
    pathFromRoot === '' ||
    (!pathFromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
      pathFromRoot !== '..' &&
      !isAbsolute(pathFromRoot))
  )
}

function assetBaseUrl(filePath: string): string {
  const rootPath = dirname(filePath)
  const token = Buffer.from(rootPath, 'utf8').toString('base64url')
  return `moyu-file://asset/${token}/`
}

function recentFileStorePath(): string {
  return join(app.getPath('userData'), 'recent-files.json')
}

async function readRecentFiles(): Promise<RecentFile[]> {
  try {
    const content = await readFile(recentFileStorePath(), 'utf8')
    return sanitizeRecentFiles(JSON.parse(content), RECENT_FILE_LIMIT)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Unable to read recent files:', error)
    }
    return []
  }
}

async function writeRecentFiles(files: RecentFile[]): Promise<void> {
  try {
    await writeFile(recentFileStorePath(), JSON.stringify(files, null, 2), 'utf8')
  } catch (error) {
    console.error('Unable to save recent files:', error)
  }
}

async function addRecentFile(filePath: string): Promise<void> {
  const files = await readRecentFiles()
  const nextFiles = sanitizeRecentFiles(
    [
      {
        path: filePath,
        name: basename(filePath),
        lastOpenedAt: Date.now()
      },
      ...files
    ],
    RECENT_FILE_LIMIT
  )
  await writeRecentFiles(nextFiles)
}

function userFacingFileError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Moyu:')) {
    return error.message.slice('Moyu:'.length)
  }

  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'ENOENT') {
    return '文件不存在，可能已被移动或删除。'
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return '没有权限读取这个文件。'
  }
  if (code === 'EBUSY') {
    return '文件正被其他程序占用，请稍后再试。'
  }

  console.error('Unable to open Markdown document:', error)
  return '无法打开此文件，请确认文件完整后重试。'
}

async function readMarkdownDocument(filePath: string): Promise<MarkdownDocument> {
  const resolvedPath = resolve(filePath)
  if (!isMarkdownFile(resolvedPath)) {
    throw new Error('Moyu:请选择 .md、.markdown、.mdown 或 .mkd 文件。')
  }

  const fileStat = await stat(resolvedPath)
  if (!fileStat.isFile()) {
    throw new Error('Moyu:所选路径不是文件。')
  }
  if (fileStat.size > MAX_FILE_SIZE) {
    throw new Error('Moyu:文件超过 20 MB，为避免应用卡顿暂不支持打开。')
  }

  const rawContent = await readFile(resolvedPath, 'utf8')
  const content = rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent

  return {
    filePath: resolvedPath,
    fileName: basename(resolvedPath),
    content,
    modifiedAt: fileStat.mtimeMs,
    size: fileStat.size,
    assetBaseUrl: assetBaseUrl(resolvedPath)
  }
}

function disposeWatcher(): void {
  if (watcherTimer) {
    clearTimeout(watcherTimer)
    watcherTimer = null
  }
  activeWatcher?.close()
  activeWatcher = null
}

function sendDocumentError(message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('document:error', message)
  }
}

async function refreshActiveDocument(expectedPath: string): Promise<void> {
  if (!activeDocument || normalizedKey(activeDocument.filePath) !== normalizedKey(expectedPath)) {
    return
  }

  try {
    const updatedDocument = await readMarkdownDocument(expectedPath)
    if (!activeDocument || normalizedKey(activeDocument.filePath) !== normalizedKey(expectedPath)) {
      return
    }
    if (
      updatedDocument.modifiedAt === activeDocument.modifiedAt &&
      updatedDocument.size === activeDocument.size
    ) {
      return
    }

    activeDocument = updatedDocument
    mainWindow?.webContents.send('document:updated', updatedDocument)
  } catch (error) {
    sendDocumentError(userFacingFileError(error))
  }
}

function watchActiveDocument(filePath: string): void {
  disposeWatcher()

  try {
    activeWatcher = watch(filePath, { persistent: false }, () => {
      if (watcherTimer) {
        clearTimeout(watcherTimer)
      }
      watcherTimer = setTimeout(() => {
        watcherTimer = null
        void refreshActiveDocument(filePath)
      }, 180)
    })
    activeWatcher.on('error', (error) => {
      console.error('Markdown watcher error:', error)
    })
  } catch (error) {
    console.error('Unable to watch Markdown document:', error)
  }
}

async function activateDocument(filePath: string): Promise<OpenDocumentResult> {
  try {
    const document = await readMarkdownDocument(filePath)
    activeDocument = document
    allowedAssetRoots.clear()
    allowedAssetRoots.add(normalizedKey(dirname(document.filePath)))
    watchActiveDocument(document.filePath)
    await addRecentFile(document.filePath)
    return { ok: true, document }
  } catch (error) {
    return { ok: false, message: userFacingFileError(error) }
  }
}

function dispatchOpenedDocument(result: OpenDocumentResult, anchor?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (result.ok) {
    mainWindow.webContents.send('document:opened', result.document, anchor)
  } else {
    mainWindow.webContents.send('document:error', result.message)
  }
}

async function openAndDispatch(filePath: string, anchor?: string): Promise<void> {
  const result = await activateDocument(filePath)
  dispatchOpenedDocument(result, anchor)
}

async function chooseMarkdownFile(): Promise<OpenDocumentResult | null> {
  if (!mainWindow) {
    return null
  }

  const selection = await dialog.showOpenDialog(mainWindow, {
    title: '打开 Markdown 文件',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown 文档', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })

  if (selection.canceled || selection.filePaths.length === 0) {
    return null
  }

  return activateDocument(selection.filePaths[0])
}

function focusMainWindow(): void {
  if (!mainWindow) {
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function openDocumentLink(href: string, currentFilePath: string): Promise<OpenLinkResult> {
  const trimmedHref = href.trim()
  if (!trimmedHref) {
    return { ok: false, message: '链接地址为空。' }
  }

  if (trimmedHref.startsWith('#')) {
    return { ok: true, kind: 'anchor', anchor: safeDecodeUriComponent(trimmedHref.slice(1)) }
  }

  try {
    const externalUrl = new URL(trimmedHref)
    if (['https:', 'http:', 'mailto:'].includes(externalUrl.protocol)) {
      await shell.openExternal(externalUrl.toString())
      return { ok: true, kind: 'external' }
    }
  } catch {
    // Relative links are handled below.
  }

  const hashIndex = trimmedHref.indexOf('#')
  const pathPart = hashIndex >= 0 ? trimmedHref.slice(0, hashIndex) : trimmedHref
  const anchor =
    hashIndex >= 0 ? safeDecodeUriComponent(trimmedHref.slice(hashIndex + 1)) : undefined
  const queryIndex = pathPart.indexOf('?')
  const cleanPathPart = safeDecodeUriComponent(
    queryIndex >= 0 ? pathPart.slice(0, queryIndex) : pathPart
  )

  let linkedPath: string
  try {
    linkedPath = cleanPathPart.startsWith('file:')
      ? fileURLToPath(cleanPathPart)
      : isAbsolute(cleanPathPart)
        ? cleanPathPart
        : resolve(dirname(currentFilePath), cleanPathPart)
  } catch {
    return { ok: false, message: '链接路径格式无效。' }
  }

  if (!isMarkdownFile(linkedPath)) {
    return { ok: false, message: '出于安全考虑，仅在应用内打开 Markdown 链接。' }
  }

  const result = await activateDocument(linkedPath)
  return result.ok ? { ok: true, kind: 'document', document: result.document, anchor } : result
}

function createApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开 Markdown…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await chooseMarkdownFile()
            if (result) {
              dispatchOpenedDocument(result)
            }
          }
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新载入' },
        { role: 'toggleDevTools', label: '开发者工具', visible: !app.isPackaged },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: '#f5f3ee',
    autoHideMenuBar: true,
    title: '墨阅 Markdown 阅读器',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f5f3ee',
      symbolColor: '#242622',
      height: 48
    },
    webPreferences: {
      preload: join(currentDirectory, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
      disposeWatcher()
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
        void shell.openExternal(parsed.toString())
      }
    } catch {
      // Invalid URLs are ignored.
    }
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL()
    if (url !== currentUrl) {
      event.preventDefault()
    }
  })
  window.webContents.on('found-in-page', (_event, result) => {
    window.webContents.send('window:find-result', {
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
      finalUpdate: result.finalUpdate
    })
  })
  window.webContents.once('did-finish-load', () => {
    if (startupFilePath) {
      void openAndDispatch(startupFilePath)
      startupFilePath = undefined
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(currentDirectory, '../renderer/index.html'))
  }

  return window
}

function registerIpcHandlers(): void {
  ipcMain.handle('document:open-dialog', () => chooseMarkdownFile())
  ipcMain.handle('document:open-path', (_event, filePath: string) => activateDocument(filePath))
  ipcMain.handle('document:open-link', (_event, href: string, currentFilePath: string) =>
    openDocumentLink(href, currentFilePath)
  )
  ipcMain.handle('document:get-current', () => activeDocument)
  ipcMain.handle('document:reveal', (_event, filePath: string) => {
    if (activeDocument && normalizedKey(activeDocument.filePath) === normalizedKey(filePath)) {
      shell.showItemInFolder(activeDocument.filePath)
    }
  })
  ipcMain.handle('recent:list', () => readRecentFiles())
  ipcMain.handle('recent:remove', async (_event, filePath: string) => {
    const files = await readRecentFiles()
    const nextFiles = files.filter((file) => normalizedKey(file.path) !== normalizedKey(filePath))
    await writeRecentFiles(nextFiles)
    return nextFiles
  })
  ipcMain.handle('recent:clear', async () => {
    await writeRecentFiles([])
  })
  ipcMain.on('window:set-theme', (event, theme: 'light' | 'dark') => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.setTitleBarOverlay({
      color: theme === 'dark' ? '#191b19' : '#f5f3ee',
      symbolColor: theme === 'dark' ? '#f1f0ea' : '#242622',
      height: 48
    })
  })
  ipcMain.on(
    'window:find',
    (event, options: { text: string; forward: boolean; startNewSearch: boolean }) => {
      if (!options.text) {
        event.sender.stopFindInPage('clearSelection')
        return
      }
      event.sender.findInPage(options.text, {
        forward: options.forward,
        findNext: options.startNewSearch,
        matchCase: false
      })
    }
  )
  ipcMain.on('window:stop-find', (event) => {
    event.sender.stopFindInPage('clearSelection')
  })
}

async function registerAssetProtocol(): Promise<void> {
  await protocol.handle('moyu-file', async (request) => {
    try {
      const requestUrl = new URL(request.url)
      if (requestUrl.hostname !== 'asset') {
        return new Response('Not found', { status: 404 })
      }

      const segments = requestUrl.pathname.split('/').filter(Boolean)
      const token = segments.shift()
      if (!token) {
        return new Response('Not found', { status: 404 })
      }

      const rootPath = Buffer.from(token, 'base64url').toString('utf8')
      if (!allowedAssetRoots.has(normalizedKey(rootPath))) {
        return new Response('Forbidden', { status: 403 })
      }

      const relativePath = segments.map(safeDecodeUriComponent).join('/')
      const resolvedPath = resolve(rootPath, relativePath)
      if (
        !isInsideDirectory(rootPath, resolvedPath) ||
        !IMAGE_EXTENSIONS.has(extname(resolvedPath).toLowerCase())
      ) {
        return new Response('Forbidden', { status: 403 })
      }

      await access(resolvedPath)
      return net.fetch(pathToFileURL(resolvedPath).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    focusMainWindow()
    const filePath = pickMarkdownArgument(argv)
    if (filePath) {
      void openAndDispatch(filePath)
    }
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (mainWindow) {
      void openAndDispatch(filePath)
    } else {
      startupFilePath = filePath
    }
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.moyu.reader')
    await registerAssetProtocol()
    registerIpcHandlers()
    createApplicationMenu()
    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      } else {
        focusMainWindow()
      }
    })
  })

  app.on('before-quit', () => {
    disposeWatcher()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
