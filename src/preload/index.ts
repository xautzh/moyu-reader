import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  FindResult,
  MarkdownDocument,
  MoyuApi,
  OpenDocumentResult,
  OpenLinkResult,
  RecentFile
} from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T, extra?: string) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T, extra?: string): void => {
    listener(payload, extra)
  }
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: MoyuApi = {
  platform: process.platform,
  openDialog: () =>
    ipcRenderer.invoke('document:open-dialog') as Promise<OpenDocumentResult | null>,
  openPath: (filePath) =>
    ipcRenderer.invoke('document:open-path', filePath) as Promise<OpenDocumentResult>,
  openLink: (href, currentFilePath) =>
    ipcRenderer.invoke('document:open-link', href, currentFilePath) as Promise<OpenLinkResult>,
  getCurrentDocument: () =>
    ipcRenderer.invoke('document:get-current') as Promise<MarkdownDocument | null>,
  getRecentFiles: () => ipcRenderer.invoke('recent:list') as Promise<RecentFile[]>,
  removeRecentFile: (filePath) =>
    ipcRenderer.invoke('recent:remove', filePath) as Promise<RecentFile[]>,
  clearRecentFiles: () => ipcRenderer.invoke('recent:clear') as Promise<void>,
  revealFile: (filePath) => ipcRenderer.invoke('document:reveal', filePath) as Promise<void>,
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
  onDocumentError: (listener) => subscribe<string>('document:error', listener),
  onFindResult: (listener) => subscribe<FindResult>('window:find-result', listener)
}

contextBridge.exposeInMainWorld('moyu', api)
