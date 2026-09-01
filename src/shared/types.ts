export interface MarkdownDocument {
  filePath: string
  fileName: string
  content: string
  modifiedAt: number
  size: number
  assetBaseUrl: string
}

export interface RecentFile {
  path: string
  name: string
  lastOpenedAt: number
}

export type OpenDocumentResult =
  | { ok: true; document: MarkdownDocument; anchor?: string }
  | { ok: false; message: string }

export type OpenLinkResult =
  | { ok: true; kind: 'document'; document: MarkdownDocument; anchor?: string }
  | { ok: true; kind: 'external' }
  | { ok: true; kind: 'anchor'; anchor: string }
  | { ok: false; message: string }

export interface FindResult {
  activeMatchOrdinal: number
  matches: number
  finalUpdate: boolean
}

export interface MoyuApi {
  openDialog: () => Promise<OpenDocumentResult | null>
  openPath: (filePath: string) => Promise<OpenDocumentResult>
  openLink: (href: string, currentFilePath: string) => Promise<OpenLinkResult>
  getCurrentDocument: () => Promise<MarkdownDocument | null>
  getRecentFiles: () => Promise<RecentFile[]>
  removeRecentFile: (filePath: string) => Promise<RecentFile[]>
  clearRecentFiles: () => Promise<void>
  revealFile: (filePath: string) => Promise<void>
  getPathForFile: (file: File) => string
  setTitlebarTheme: (theme: 'light' | 'dark') => void
  findInPage: (text: string, forward: boolean, startNewSearch: boolean) => void
  stopFindInPage: () => void
  onDocumentOpened: (listener: (document: MarkdownDocument, anchor?: string) => void) => () => void
  onDocumentUpdated: (listener: (document: MarkdownDocument) => void) => () => void
  onDocumentError: (listener: (message: string) => void) => () => void
  onFindResult: (listener: (result: FindResult) => void) => () => void
}
