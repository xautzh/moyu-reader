import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AppCommand,
  AppUpdateState,
  DraftRecord,
  ExportResult,
  FindResult,
  MarkdownDocument,
  MoyuApi,
  OpenDocumentResult,
  OpenLinkResult,
  RecentFile,
  SaveDocumentRequest,
  SaveDocumentResult,
  SavedAsset,
  WorkspaceSnapshot
} from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T, extra?: string) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T, extra?: string): void => {
    listener(payload, extra)
  }
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

function subscribeWithoutPayload(channel: string, listener: () => void): () => void {
  const handler = (): void => listener()
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: MoyuApi = {
  platform: process.platform,
  newDocument: () => ipcRenderer.invoke('document:new') as Promise<void>,
  openDialog: () =>
    ipcRenderer.invoke('document:open-dialog') as Promise<OpenDocumentResult | null>,
  openPath: (filePath) =>
    ipcRenderer.invoke('document:open-path', filePath) as Promise<OpenDocumentResult>,
  saveDocument: (request: SaveDocumentRequest) =>
    ipcRenderer.invoke('document:save', request) as Promise<SaveDocumentResult>,
  saveDocumentAs: (content, suggestedName) =>
    ipcRenderer.invoke(
      'document:save-as',
      content,
      suggestedName
    ) as Promise<SaveDocumentResult | null>,
  openLink: (href, currentFilePath) =>
    ipcRenderer.invoke('document:open-link', href, currentFilePath) as Promise<OpenLinkResult>,
  getCurrentDocument: () =>
    ipcRenderer.invoke('document:get-current') as Promise<MarkdownDocument | null>,
  getRecentFiles: () => ipcRenderer.invoke('recent:list') as Promise<RecentFile[]>,
  removeRecentFile: (filePath) =>
    ipcRenderer.invoke('recent:remove', filePath) as Promise<RecentFile[]>,
  clearRecentFiles: () => ipcRenderer.invoke('recent:clear') as Promise<void>,
  revealFile: (filePath) => ipcRenderer.invoke('document:reveal', filePath) as Promise<void>,
  chooseImage: (currentFilePath) =>
    ipcRenderer.invoke('asset:choose-image', currentFilePath) as Promise<SavedAsset | null>,
  saveImageData: (currentFilePath, fileName, data) =>
    ipcRenderer.invoke('asset:save-data', currentFilePath, fileName, data) as Promise<SavedAsset>,
  openWorkspace: () => ipcRenderer.invoke('workspace:open') as Promise<WorkspaceSnapshot | null>,
  scanWorkspace: (rootPath) =>
    ipcRenderer.invoke('workspace:scan', rootPath) as Promise<WorkspaceSnapshot>,
  workspaceForDocument: (filePath) =>
    ipcRenderer.invoke('workspace:for-document', filePath) as Promise<WorkspaceSnapshot>,
  getDraft: (filePath) => ipcRenderer.invoke('draft:get', filePath) as Promise<DraftRecord | null>,
  saveDraft: (draft) => ipcRenderer.invoke('draft:save', draft) as Promise<void>,
  clearDraft: (filePath) => ipcRenderer.invoke('draft:clear', filePath) as Promise<void>,
  exportHtml: (html, suggestedName) =>
    ipcRenderer.invoke('export:html', html, suggestedName) as Promise<ExportResult | null>,
  exportPdf: (suggestedName) =>
    ipcRenderer.invoke('export:pdf', suggestedName) as Promise<ExportResult | null>,
  printDocument: () => ipcRenderer.invoke('document:print') as Promise<ExportResult>,
  getUpdateState: () => ipcRenderer.invoke('update:get-state') as Promise<AppUpdateState>,
  checkForUpdates: () => ipcRenderer.invoke('update:check') as Promise<AppUpdateState>,
  downloadUpdate: () => ipcRenderer.invoke('update:download') as Promise<AppUpdateState>,
  installUpdate: () => ipcRenderer.invoke('update:install') as Promise<void>,
  setDirty: (dirty) => ipcRenderer.send('document:set-dirty', dirty),
  confirmClose: () => ipcRenderer.send('window:confirm-close'),
  cancelClose: () => ipcRenderer.send('window:cancel-close'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  setTitlebarTheme: (theme) => ipcRenderer.send('window:set-theme', theme),
  findInPage: (text, forward, startNewSearch) =>
    ipcRenderer.send('window:find', { text, forward, startNewSearch }),
  stopFindInPage: () => ipcRenderer.send('window:stop-find'),
  onDocumentOpened: (listener) =>
    subscribe<MarkdownDocument>('document:opened', (document, anchor) =>
      listener(document, anchor)
    ),
  onDocumentUpdated: (listener) => subscribe<MarkdownDocument>('document:updated', listener),
  onExternalChange: (listener) => subscribe<MarkdownDocument>('document:external-change', listener),
  onOpenRequested: (listener) => subscribe<string>('document:open-requested', listener),
  onDocumentError: (listener) => subscribe<string>('document:error', listener),
  onFindResult: (listener) => subscribe<FindResult>('window:find-result', listener),
  onCloseRequested: (listener) => subscribeWithoutPayload('window:close-requested', listener),
  onAppCommand: (listener) => subscribe<AppCommand>('app-command', listener),
  onUpdateState: (listener) => subscribe<AppUpdateState>('update:state', listener)
}

contextBridge.exposeInMainWorld('moyu', api)
