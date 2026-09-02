import { type FSWatcher, watch } from 'node:fs'
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep
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
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type {
  AppCommand,
  AppUpdateState,
  DraftRecord,
  ExportResult,
  MarkdownDocument,
  OpenDocumentResult,
  OpenLinkResult,
  RecentFile,
  SaveDocumentRequest,
  SaveDocumentResult,
  SavedAsset,
  WorkspaceFile,
  WorkspaceSnapshot
} from '../shared/types'
import {
  collectRelativeImageSources,
  ensureMarkdownExtension,
  hasExternalChange,
  nextAvailableAssetName,
  rewriteMarkdownImageSources
} from './editor-utils'
import { isMarkdownFile, pickMarkdownArgument, sanitizeRecentFiles } from './file-utils'
import {
  createInitialUpdateState,
  normalizeUpdateProgress,
  readableUpdateError,
  updateSupport
} from './update-utils'

const currentDirectory = __dirname
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_IMAGE_SIZE = 15 * 1024 * 1024
const RECENT_FILE_LIMIT = 12
const DRAFT_LIMIT = 20
const WORKSPACE_FILE_LIMIT = 500
const WORKSPACE_DEPTH_LIMIT = 8
const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000
const UPDATE_STARTUP_DELAY = 15 * 1000
const IGNORED_WORKSPACE_DIRECTORIES = new Set([
  '.git',
  '.idea',
  '.vscode',
  'build',
  'dist',
  'node_modules',
  'out'
])
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
let rendererDirty = false
let allowWindowClose = false
let quitRequested = false
let pendingUpdateInstall = false
let lastObservedModifiedAt = 0
let lastObservedSize = 0
let updaterInitialized = false
let updateCheckManual = false
let updateTimer: NodeJS.Timeout | null = null
let updateState = createInitialUpdateState(app.getVersion(), app.isPackaged, process.platform)
const allowedAssetRoots = new Set<string>()
const allowedWorkspaceRoots = new Set<string>()

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

function draftStorePath(): string {
  return join(app.getPath('userData'), 'drafts.json')
}

function draftKey(filePath: string): string {
  return filePath ? normalizedKey(resolve(filePath)) : '__untitled__'
}

function isDraftRecord(value: unknown): value is DraftRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const draft = value as Partial<DraftRecord>
  return (
    typeof draft.filePath === 'string' &&
    typeof draft.fileName === 'string' &&
    typeof draft.content === 'string' &&
    typeof draft.baseModifiedAt === 'number' &&
    typeof draft.updatedAt === 'number' &&
    typeof draft.assetBaseUrl === 'string' &&
    Buffer.byteLength(draft.content, 'utf8') <= MAX_FILE_SIZE
  )
}

async function readDrafts(): Promise<DraftRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(draftStorePath(), 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter(isDraftRecord)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, DRAFT_LIMIT)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Unable to read drafts:', error)
    }
    return []
  }
}

async function writeDrafts(drafts: DraftRecord[]): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  const targetPath = draftStorePath()
  const temporaryPath = `${targetPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, JSON.stringify(drafts.slice(0, DRAFT_LIMIT), null, 2), 'utf8')
  try {
    await rename(temporaryPath, targetPath)
  } catch {
    await writeFile(targetPath, JSON.stringify(drafts.slice(0, DRAFT_LIMIT), null, 2), 'utf8')
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

async function getDraft(filePath: string): Promise<DraftRecord | null> {
  const key = draftKey(filePath)
  return (await readDrafts()).find((draft) => draftKey(draft.filePath) === key) ?? null
}

async function saveDraft(draft: DraftRecord): Promise<void> {
  if (!isDraftRecord(draft)) {
    throw new Error('草稿内容无效或超过 20 MB。')
  }
  const key = draftKey(draft.filePath)
  const drafts = (await readDrafts()).filter((item) => draftKey(item.filePath) !== key)
  await writeDrafts([{ ...draft, updatedAt: Date.now() }, ...drafts])
}

async function clearDraft(filePath: string): Promise<void> {
  const key = draftKey(filePath)
  const drafts = await readDrafts()
  const nextDrafts = drafts.filter((item) => draftKey(item.filePath) !== key)
  if (nextDrafts.length !== drafts.length) {
    await writeDrafts(nextDrafts)
  }
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

function userFacingWriteError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'EACCES' || code === 'EPERM') {
    return '没有权限写入这个位置，请选择其他目录或检查文件权限。'
  }
  if (code === 'EBUSY') {
    return '文件正被其他程序占用，请关闭占用程序后重试。'
  }
  if (code === 'ENOSPC') {
    return '磁盘空间不足，无法保存文件。'
  }
  console.error('Unable to write document:', error)
  return '保存失败，请检查磁盘空间和文件权限后重试。'
}

function validateMarkdownContent(content: unknown): string | null {
  if (typeof content !== 'string') {
    return '文档内容格式无效。'
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE) {
    return '文档超过 20 MB，为避免应用卡顿暂不支持保存。'
  }
  return null
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

async function writeMarkdownDocument(request: SaveDocumentRequest): Promise<SaveDocumentResult> {
  const contentError = validateMarkdownContent(request.content)
  if (contentError) {
    return { ok: false, kind: 'validation', message: contentError }
  }

  if (!request.filePath || !activeDocument) {
    return { ok: false, kind: 'validation', message: '请先使用“另存为”选择保存位置。' }
  }

  const resolvedPath = resolve(request.filePath)
  if (
    normalizedKey(resolvedPath) !== normalizedKey(activeDocument.filePath) ||
    !isMarkdownFile(resolvedPath)
  ) {
    return { ok: false, kind: 'validation', message: '当前文件路径无效，请使用“另存为”。' }
  }

  try {
    const diskStat = await stat(resolvedPath)
    if (!request.force && hasExternalChange(request.expectedModifiedAt, diskStat.mtimeMs)) {
      return {
        ok: false,
        kind: 'conflict',
        message: '文件已被其他程序修改。请选择重新载入或覆盖保存。',
        diskDocument: await readMarkdownDocument(resolvedPath)
      }
    }

    await writeFile(resolvedPath, request.content, 'utf8')
    const document = await readMarkdownDocument(resolvedPath)
    activeDocument = document
    lastObservedModifiedAt = document.modifiedAt
    lastObservedSize = document.size
    rendererDirty = false
    await addRecentFile(document.filePath)
    return { ok: true, document }
  } catch (error) {
    return { ok: false, kind: 'io', message: userFacingWriteError(error) }
  }
}

async function relocateImagesForSaveAs(
  content: string,
  sourceDocumentPath: string,
  targetDocumentPath: string
): Promise<string> {
  const sourceRoot = dirname(sourceDocumentPath)
  const targetRoot = dirname(targetDocumentPath)
  if (normalizedKey(sourceRoot) === normalizedKey(targetRoot)) {
    return content
  }

  const replacements = new Map<string, string>()
  let existingNames: Set<string> | null = null
  const targetAssets = join(targetRoot, 'assets')

  for (const source of collectRelativeImageSources(content)) {
    const suffixIndex = source.search(/[?#]/)
    const sourcePathPart = suffixIndex >= 0 ? source.slice(0, suffixIndex) : source
    const suffix = suffixIndex >= 0 ? source.slice(suffixIndex) : ''
    let decodedSource: string
    try {
      decodedSource = decodeURIComponent(sourcePathPart).replace(/\//g, sep)
    } catch {
      continue
    }

    const absoluteSource = resolve(sourceRoot, decodedSource)
    if (
      !isInsideDirectory(sourceRoot, absoluteSource) ||
      !IMAGE_EXTENSIONS.has(extname(absoluteSource).toLocaleLowerCase('en-US'))
    ) {
      continue
    }

    try {
      const sourceStat = await stat(absoluteSource)
      if (!sourceStat.isFile() || sourceStat.size > MAX_IMAGE_SIZE) {
        continue
      }
      if (!existingNames) {
        await mkdir(targetAssets, { recursive: true })
        existingNames = new Set(await readdir(targetAssets))
      }
      const targetName = nextAvailableAssetName(basename(absoluteSource), existingNames)
      await copyFile(absoluteSource, join(targetAssets, targetName))
      existingNames.add(targetName)
      replacements.set(source, `assets/${targetName}${suffix}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  return rewriteMarkdownImageSources(content, replacements)
}

async function saveMarkdownDocumentAs(
  content: string,
  suggestedName: string
): Promise<SaveDocumentResult | null> {
  const contentError = validateMarkdownContent(content)
  if (contentError) {
    return { ok: false, kind: 'validation', message: contentError }
  }
  if (!mainWindow) {
    return { ok: false, kind: 'io', message: '应用窗口尚未准备好。' }
  }

  const defaultName = ensureMarkdownExtension(basename(suggestedName || '未命名.md'))
  const selection = await dialog.showSaveDialog(mainWindow, {
    title: '保存 Markdown 文档',
    defaultPath: activeDocument ? join(dirname(activeDocument.filePath), defaultName) : defaultName,
    filters: [{ name: 'Markdown 文档', extensions: ['md', 'markdown', 'mdown', 'mkd'] }]
  })
  if (selection.canceled || !selection.filePath) {
    return null
  }

  const targetPath = ensureMarkdownExtension(selection.filePath)
  let contentToSave = content
  try {
    if (activeDocument) {
      contentToSave = await relocateImagesForSaveAs(content, activeDocument.filePath, targetPath)
    }
    await writeFile(targetPath, contentToSave, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      return { ok: false, kind: 'io', message: userFacingWriteError(error) }
    }
    try {
      await writeFile(targetPath, contentToSave, 'utf8')
    } catch (writeError) {
      return { ok: false, kind: 'io', message: userFacingWriteError(writeError) }
    }
  }

  const result = await activateDocument(targetPath)
  if (!result.ok) {
    return { ok: false, kind: 'io', message: result.message }
  }
  rendererDirty = false
  return { ok: true, document: result.document }
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
      updatedDocument.modifiedAt === lastObservedModifiedAt &&
      updatedDocument.size === lastObservedSize
    ) {
      return
    }

    lastObservedModifiedAt = updatedDocument.modifiedAt
    lastObservedSize = updatedDocument.size
    if (rendererDirty) {
      mainWindow?.webContents.send('document:external-change', updatedDocument)
    } else {
      activeDocument = updatedDocument
      mainWindow?.webContents.send('document:updated', updatedDocument)
    }
  } catch (error) {
    sendDocumentError(userFacingFileError(error))
  }
}

function watchActiveDocument(filePath: string): void {
  disposeWatcher()

  try {
    const watchedName = basename(filePath).toLocaleLowerCase('en-US')
    activeWatcher = watch(dirname(filePath), { persistent: false }, (_eventType, changedName) => {
      if (changedName && String(changedName).toLocaleLowerCase('en-US') !== watchedName) {
        return
      }
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
    lastObservedModifiedAt = document.modifiedAt
    lastObservedSize = document.size
    rendererDirty = false
    allowedAssetRoots.clear()
    allowedAssetRoots.add(normalizedKey(dirname(document.filePath)))
    allowedWorkspaceRoots.add(normalizedKey(dirname(document.filePath)))
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
  if (rendererDirty && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('document:open-requested', filePath)
    focusMainWindow()
    return
  }
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

async function scanWorkspaceDirectory(rootPath: string): Promise<WorkspaceSnapshot> {
  const resolvedRoot = resolve(rootPath)
  const rootStat = await stat(resolvedRoot)
  if (!rootStat.isDirectory()) {
    throw new Error('所选路径不是文件夹。')
  }

  const files: WorkspaceFile[] = []
  let truncated = false

  async function visit(directoryPath: string, depth: number): Promise<void> {
    if (truncated || depth > WORKSPACE_DEPTH_LIMIT) {
      if (depth > WORKSPACE_DEPTH_LIMIT) {
        truncated = true
      }
      return
    }

    let entries = await readdir(directoryPath, { withFileTypes: true })
    entries = entries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1
      }
      return left.name.localeCompare(right.name, 'zh-CN', { numeric: true })
    })

    for (const entry of entries) {
      if (files.length >= WORKSPACE_FILE_LIMIT) {
        truncated = true
        return
      }
      if (entry.isSymbolicLink()) {
        continue
      }
      const entryPath = join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_WORKSPACE_DIRECTORIES.has(entry.name.toLocaleLowerCase('en-US'))) {
          continue
        }
        await visit(entryPath, depth + 1)
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        const relativePath = relative(resolvedRoot, entryPath)
        files.push({
          path: entryPath,
          name: entry.name,
          relativePath,
          depth: Math.max(0, relativePath.split(sep).length - 1)
        })
      }
    }
  }

  await visit(resolvedRoot, 0)
  return {
    rootPath: resolvedRoot,
    name: basename(resolvedRoot) || resolvedRoot,
    files,
    truncated
  }
}

async function chooseWorkspace(): Promise<WorkspaceSnapshot | null> {
  if (!mainWindow) {
    return null
  }
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: '打开 Markdown 文件夹',
    properties: ['openDirectory']
  })
  if (selection.canceled || selection.filePaths.length === 0) {
    return null
  }
  const rootPath = resolve(selection.filePaths[0])
  allowedWorkspaceRoots.add(normalizedKey(rootPath))
  return scanWorkspaceDirectory(rootPath)
}

async function workspaceForDocument(filePath: string): Promise<WorkspaceSnapshot> {
  if (!filePath) {
    throw new Error('未保存的文档还没有所属文件夹。')
  }
  const rootPath = dirname(resolve(filePath))
  allowedWorkspaceRoots.add(normalizedKey(rootPath))
  return scanWorkspaceDirectory(rootPath)
}

async function rescanWorkspace(rootPath: string): Promise<WorkspaceSnapshot> {
  const resolvedRoot = resolve(rootPath)
  if (!allowedWorkspaceRoots.has(normalizedKey(resolvedRoot))) {
    throw new Error('请先通过“打开文件夹”选择工作区。')
  }
  return scanWorkspaceDirectory(resolvedRoot)
}

function assertCurrentDocumentPath(currentFilePath: string): string {
  if (
    !currentFilePath ||
    !activeDocument ||
    normalizedKey(currentFilePath) !== normalizedKey(activeDocument.filePath)
  ) {
    throw new Error('请先保存文档，再插入本地图片。')
  }
  return activeDocument.filePath
}

async function createAssetTarget(
  currentFilePath: string,
  requestedName: string
): Promise<{ targetPath: string; result: SavedAsset }> {
  const documentPath = assertCurrentDocumentPath(currentFilePath)
  const extension = extname(requestedName).toLocaleLowerCase('en-US')
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new Error('请选择 PNG、JPEG、GIF、WebP、AVIF、BMP、ICO 或 SVG 图片。')
  }

  const assetsDirectory = join(dirname(documentPath), 'assets')
  await mkdir(assetsDirectory, { recursive: true })
  const existingNames = new Set(await readdir(assetsDirectory))
  const fileName = nextAvailableAssetName(requestedName, existingNames)
  const relativePath = `assets/${fileName}`
  return {
    targetPath: join(assetsDirectory, fileName),
    result: {
      relativePath,
      editorUrl: `${assetBaseUrl(documentPath)}assets/${encodeURIComponent(fileName)}`
    }
  }
}

async function chooseAndSaveImage(currentFilePath: string): Promise<SavedAsset | null> {
  const documentPath = assertCurrentDocumentPath(currentFilePath)
  if (!mainWindow) {
    return null
  }
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: '插入图片',
    defaultPath: dirname(documentPath),
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: Array.from(IMAGE_EXTENSIONS, (value) => value.slice(1)) }]
  })
  if (selection.canceled || selection.filePaths.length === 0) {
    return null
  }

  const sourcePath = selection.filePaths[0]
  const sourceStat = await stat(sourcePath)
  if (!sourceStat.isFile() || sourceStat.size > MAX_IMAGE_SIZE) {
    throw new Error('图片无效或超过 15 MB。')
  }
  const target = await createAssetTarget(documentPath, basename(sourcePath))
  await copyFile(sourcePath, target.targetPath)
  return target.result
}

async function saveImageData(
  currentFilePath: string,
  fileName: string,
  data: ArrayBuffer
): Promise<SavedAsset> {
  const bytes = Buffer.from(data)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_SIZE) {
    throw new Error('图片无效或超过 15 MB。')
  }
  const target = await createAssetTarget(currentFilePath, fileName)
  await writeFile(target.targetPath, bytes)
  return target.result
}

function exportDefaultPath(suggestedName: string, extension: '.html' | '.pdf'): string {
  const rawName = basename(suggestedName || `未命名${extension}`)
  const fileName =
    extname(rawName).toLocaleLowerCase('en-US') === extension
      ? rawName
      : `${rawName.replace(/\.[^.]+$/, '')}${extension}`
  return activeDocument ? join(dirname(activeDocument.filePath), fileName) : fileName
}

async function exportHtml(html: string, suggestedName: string): Promise<ExportResult | null> {
  if (!mainWindow) {
    return { ok: false, message: '应用窗口尚未准备好。' }
  }
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > MAX_FILE_SIZE * 2) {
    return { ok: false, message: '导出内容无效或过大。' }
  }
  const selection = await dialog.showSaveDialog(mainWindow, {
    title: '导出 HTML',
    defaultPath: exportDefaultPath(suggestedName, '.html'),
    filters: [{ name: 'HTML 网页', extensions: ['html'] }]
  })
  if (selection.canceled || !selection.filePath) {
    return null
  }
  const filePath =
    extname(selection.filePath).toLocaleLowerCase('en-US') === '.html'
      ? selection.filePath
      : `${selection.filePath}.html`
  try {
    await writeFile(filePath, html, 'utf8')
    return { ok: true, filePath }
  } catch (error) {
    return { ok: false, message: userFacingWriteError(error) }
  }
}

async function exportPdf(suggestedName: string): Promise<ExportResult | null> {
  if (!mainWindow) {
    return { ok: false, message: '应用窗口尚未准备好。' }
  }
  const selection = await dialog.showSaveDialog(mainWindow, {
    title: '导出 PDF',
    defaultPath: exportDefaultPath(suggestedName, '.pdf'),
    filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
  })
  if (selection.canceled || !selection.filePath) {
    return null
  }
  const filePath =
    extname(selection.filePath).toLocaleLowerCase('en-US') === '.pdf'
      ? selection.filePath
      : `${selection.filePath}.pdf`
  try {
    const pdf = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.55, bottom: 0.55, left: 0.6, right: 0.6 }
    })
    await writeFile(filePath, pdf)
    return { ok: true, filePath }
  } catch (error) {
    return { ok: false, message: userFacingWriteError(error) }
  }
}

async function printDocument(): Promise<ExportResult> {
  if (!mainWindow) {
    return { ok: false, message: '应用窗口尚未准备好。' }
  }
  return new Promise((resolvePrint) => {
    mainWindow?.webContents.print({ printBackground: true }, (success, failureReason) => {
      resolvePrint(
        success ? { ok: true } : { ok: false, message: failureReason || '打印任务未能启动。' }
      )
    })
  })
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

function sendAppCommand(command: AppCommand): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-command', command)
  }
}

function publishUpdateState(nextState: AppUpdateState): AppUpdateState {
  updateState = nextState
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:state', updateState)
  }
  return updateState
}

async function checkForAppUpdates(manual: boolean): Promise<AppUpdateState> {
  const support = updateSupport(app.isPackaged, process.platform)
  if (!support.enabled) {
    return publishUpdateState({
      status: 'unsupported',
      currentVersion: app.getVersion(),
      message: support.reason,
      manual
    })
  }
  if (updateState.status === 'checking' || updateState.status === 'downloading') {
    return updateState
  }

  updateCheckManual = manual
  publishUpdateState({ status: 'checking', currentVersion: app.getVersion(), manual })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    console.error('[updater] check failed', error)
    publishUpdateState({
      status: 'error',
      currentVersion: app.getVersion(),
      message: readableUpdateError(error),
      manual
    })
  }
  return updateState
}

async function downloadAppUpdate(): Promise<AppUpdateState> {
  if (updateState.status !== 'available') {
    return updateState
  }
  const version = updateState.version
  publishUpdateState({
    status: 'downloading',
    currentVersion: app.getVersion(),
    version,
    percent: 0,
    manual: true
  })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    console.error('[updater] download failed', error)
    publishUpdateState({
      status: 'error',
      currentVersion: app.getVersion(),
      version,
      message: readableUpdateError(error),
      manual: true
    })
  }
  return updateState
}

function installDownloadedUpdate(): void {
  if (updateState.status !== 'downloaded') {
    return
  }
  pendingUpdateInstall = true
  if (rendererDirty && !allowWindowClose && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window:close-requested')
    focusMainWindow()
    return
  }
  allowWindowClose = true
  pendingUpdateInstall = false
  autoUpdater.quitAndInstall(false, true)
}

function initializeAutoUpdater(): void {
  if (updaterInitialized) {
    return
  }
  updaterInitialized = true
  const support = updateSupport(app.isPackaged, process.platform)
  if (!support.enabled) {
    publishUpdateState({
      status: 'unsupported',
      currentVersion: app.getVersion(),
      message: support.reason
    })
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.on('checking-for-update', () => {
    publishUpdateState({
      status: 'checking',
      currentVersion: app.getVersion(),
      manual: updateCheckManual
    })
  })
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    publishUpdateState({
      status: 'available',
      currentVersion: app.getVersion(),
      version: info.version,
      manual: updateCheckManual
    })
  })
  autoUpdater.on('update-not-available', () => {
    publishUpdateState({
      status: 'up-to-date',
      currentVersion: app.getVersion(),
      manual: updateCheckManual
    })
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    publishUpdateState({
      status: 'downloading',
      currentVersion: app.getVersion(),
      version: updateState.version,
      percent: normalizeUpdateProgress(progress.percent),
      manual: true
    })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    publishUpdateState({
      status: 'downloaded',
      currentVersion: app.getVersion(),
      version: info.version,
      percent: 100,
      manual: true
    })
  })
  autoUpdater.on('error', (error: Error) => {
    console.error('[updater] error', error)
    publishUpdateState({
      status: 'error',
      currentVersion: app.getVersion(),
      version: updateState.version,
      message: readableUpdateError(error),
      manual: updateCheckManual
    })
  })

  const startupTimer = setTimeout(() => {
    void checkForAppUpdates(false)
  }, UPDATE_STARTUP_DELAY)
  startupTimer.unref()
  updateTimer = setInterval(() => {
    void checkForAppUpdates(false)
  }, UPDATE_CHECK_INTERVAL)
  updateTimer.unref()
}

function createApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      label: '新建文档',
      accelerator: 'CmdOrCtrl+N',
      click: () => sendAppCommand('new')
    },
    {
      label: '打开 Markdown…',
      accelerator: 'CmdOrCtrl+O',
      click: () => sendAppCommand('open')
    },
    { type: 'separator' },
    {
      label: '保存',
      accelerator: 'CmdOrCtrl+S',
      click: () => sendAppCommand('save')
    },
    {
      label: '另存为…',
      accelerator: 'CmdOrCtrl+Shift+S',
      click: () => sendAppCommand('save-as')
    },
    { type: 'separator' },
    {
      label: '导出 HTML…',
      click: () => sendAppCommand('export-html')
    },
    {
      label: '导出 PDF…',
      click: () => sendAppCommand('export-pdf')
    },
    {
      label: '打印…',
      accelerator: 'CmdOrCtrl+P',
      click: () => sendAppCommand('print')
    }
  ]

  if (!isMac) {
    fileSubmenu.push({ type: 'separator' }, { role: 'quit', label: '退出' })
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: fileSubmenu
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '所见即所得',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendAppCommand('mode-wysiwyg')
        },
        {
          label: '源码模式',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendAppCommand('mode-source')
        },
        {
          label: '分屏模式',
          accelerator: 'CmdOrCtrl+3',
          click: () => sendAppCommand('mode-split')
        },
        {
          label: '阅读预览',
          accelerator: 'CmdOrCtrl+4',
          click: () => sendAppCommand('mode-preview')
        },
        { type: 'separator' },
        {
          label: '专注模式',
          accelerator: 'F8',
          click: () => sendAppCommand('toggle-focus')
        },
        {
          label: '打字机模式',
          accelerator: 'F9',
          click: () => sendAppCommand('toggle-typewriter')
        },
        { type: 'separator' },
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
        { role: 'close', label: '关闭' },
        ...(isMac
          ? ([
              { type: 'separator' },
              { role: 'front', label: '前置所有窗口' }
            ] as MenuItemConstructorOptions[])
          : [])
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          id: 'check-for-updates',
          label: '检查更新…',
          click: () => sendAppCommand('check-update')
        },
        {
          label: `当前版本 ${app.getVersion()}`,
          enabled: false
        },
        { type: 'separator' },
        {
          label: '项目主页',
          click: () => {
            void shell.openExternal('https://github.com/xautzh/moyu-reader')
          }
        }
      ]
    }
  ]

  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about', label: '关于墨阅' },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏墨阅' },
        { role: 'hideOthers', label: '隐藏其他应用' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出墨阅' }
      ]
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: '#f6f6f6',
    autoHideMenuBar: !isMac,
    title: '墨阅',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? {}
      : {
          titleBarOverlay: {
            color: '#f6f6f6',
            symbolColor: '#242622',
            height: 48
          }
        }),
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
  window.on('close', (event) => {
    if (rendererDirty && !allowWindowClose) {
      event.preventDefault()
      window.webContents.send('window:close-requested')
    }
  })
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
      disposeWatcher()
      rendererDirty = false
      allowWindowClose = false
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
  ipcMain.handle('document:new', () => {
    disposeWatcher()
    activeDocument = null
    lastObservedModifiedAt = 0
    lastObservedSize = 0
    rendererDirty = false
    allowedAssetRoots.clear()
  })
  ipcMain.handle('document:open-dialog', () => chooseMarkdownFile())
  ipcMain.handle('document:open-path', (_event, filePath: string) => activateDocument(filePath))
  ipcMain.handle('document:save', (_event, request: SaveDocumentRequest) =>
    writeMarkdownDocument(request)
  )
  ipcMain.handle('document:save-as', (_event, content: string, suggestedName: string) =>
    saveMarkdownDocumentAs(content, suggestedName)
  )
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
  ipcMain.handle('asset:choose-image', (_event, currentFilePath: string) =>
    chooseAndSaveImage(currentFilePath)
  )
  ipcMain.handle(
    'asset:save-data',
    (_event, currentFilePath: string, fileName: string, data: ArrayBuffer) =>
      saveImageData(currentFilePath, fileName, data)
  )
  ipcMain.handle('workspace:open', () => chooseWorkspace())
  ipcMain.handle('workspace:scan', (_event, rootPath: string) => rescanWorkspace(rootPath))
  ipcMain.handle('workspace:for-document', (_event, filePath: string) =>
    workspaceForDocument(filePath)
  )
  ipcMain.handle('draft:get', (_event, filePath: string) => getDraft(filePath))
  ipcMain.handle('draft:save', (_event, draft: DraftRecord) => saveDraft(draft))
  ipcMain.handle('draft:clear', (_event, filePath: string) => clearDraft(filePath))
  ipcMain.handle('export:html', (_event, html: string, suggestedName: string) =>
    exportHtml(html, suggestedName)
  )
  ipcMain.handle('export:pdf', (_event, suggestedName: string) => exportPdf(suggestedName))
  ipcMain.handle('document:print', () => printDocument())
  ipcMain.handle('update:get-state', () => updateState)
  ipcMain.handle('update:check', () => checkForAppUpdates(true))
  ipcMain.handle('update:download', () => downloadAppUpdate())
  ipcMain.handle('update:install', () => installDownloadedUpdate())
  ipcMain.on('document:set-dirty', (event, dirty: boolean) => {
    if (BrowserWindow.fromWebContents(event.sender) === mainWindow) {
      rendererDirty = Boolean(dirty)
    }
  })
  ipcMain.on('window:confirm-close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window !== mainWindow) {
      return
    }
    rendererDirty = false
    allowWindowClose = true
    if (pendingUpdateInstall) {
      pendingUpdateInstall = false
      autoUpdater.quitAndInstall(false, true)
      return
    }
    if (quitRequested) {
      app.quit()
    } else {
      window.close()
    }
  })
  ipcMain.on('window:cancel-close', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) === mainWindow) {
      quitRequested = false
      allowWindowClose = false
      pendingUpdateInstall = false
    }
  })
  ipcMain.on('window:set-theme', (event, theme: 'light' | 'dark') => {
    if (process.platform === 'darwin') {
      return
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.setTitleBarOverlay({
      color: theme === 'dark' ? '#191b19' : '#f6f6f6',
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
    initializeAutoUpdater()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      } else {
        focusMainWindow()
      }
    })
  })

  app.on('before-quit', (event) => {
    quitRequested = true
    if (rendererDirty && !allowWindowClose && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault()
      mainWindow.webContents.send('window:close-requested')
      focusMainWindow()
      return
    }
    if (updateTimer) {
      clearInterval(updateTimer)
      updateTimer = null
    }
    disposeWatcher()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
