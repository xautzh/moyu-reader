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

export type EditorMode = 'wysiwyg' | 'source' | 'split' | 'preview'

export interface SaveDocumentRequest {
  filePath: string
  content: string
  expectedModifiedAt: number
  force?: boolean
}

export type SaveDocumentResult =
  | { ok: true; document: MarkdownDocument }
  | {
      ok: false
      kind: 'conflict' | 'validation' | 'io'
      message: string
      diskDocument?: MarkdownDocument
    }

export interface DraftRecord {
  filePath: string
  fileName: string
  content: string
  baseModifiedAt: number
  updatedAt: number
  assetBaseUrl: string
}

export interface WorkspaceFile {
  path: string
  name: string
  relativePath: string
  depth: number
}

export interface WorkspaceSnapshot {
  rootPath: string
  name: string
  files: WorkspaceFile[]
  truncated: boolean
}

export interface SavedAsset {
  relativePath: string
  editorUrl: string
}

export type ExportResult = { ok: true; filePath?: string } | { ok: false; message: string }

export type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'

export interface AppUpdateState {
  status: UpdateStatus
  currentVersion: string
  version?: string
  percent?: number
  message?: string
  manual?: boolean
}

export type AppCommand =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'export-html'
  | 'export-pdf'
  | 'print'
  | 'mode-wysiwyg'
  | 'mode-source'
  | 'mode-split'
  | 'mode-preview'
  | 'toggle-focus'
  | 'toggle-typewriter'
  | 'check-update'

export interface MoyuApi {
  readonly platform: NodeJS.Platform
  newDocument: () => Promise<void>
  openDialog: () => Promise<OpenDocumentResult | null>
  openPath: (filePath: string) => Promise<OpenDocumentResult>
  saveDocument: (request: SaveDocumentRequest) => Promise<SaveDocumentResult>
  saveDocumentAs: (content: string, suggestedName: string) => Promise<SaveDocumentResult | null>
  openLink: (href: string, currentFilePath: string) => Promise<OpenLinkResult>
  getCurrentDocument: () => Promise<MarkdownDocument | null>
  getRecentFiles: () => Promise<RecentFile[]>
  removeRecentFile: (filePath: string) => Promise<RecentFile[]>
  clearRecentFiles: () => Promise<void>
  revealFile: (filePath: string) => Promise<void>
  chooseImage: (currentFilePath: string) => Promise<SavedAsset | null>
  saveImageData: (
    currentFilePath: string,
    fileName: string,
    data: ArrayBuffer
  ) => Promise<SavedAsset>
  openWorkspace: () => Promise<WorkspaceSnapshot | null>
  scanWorkspace: (rootPath: string) => Promise<WorkspaceSnapshot>
  workspaceForDocument: (filePath: string) => Promise<WorkspaceSnapshot>
  getDraft: (filePath: string) => Promise<DraftRecord | null>
  saveDraft: (draft: DraftRecord) => Promise<void>
  clearDraft: (filePath: string) => Promise<void>
  exportHtml: (html: string, suggestedName: string) => Promise<ExportResult | null>
  exportPdf: (suggestedName: string) => Promise<ExportResult | null>
  printDocument: () => Promise<ExportResult>
  getUpdateState: () => Promise<AppUpdateState>
  checkForUpdates: () => Promise<AppUpdateState>
  downloadUpdate: () => Promise<AppUpdateState>
  installUpdate: () => Promise<void>
  setDirty: (dirty: boolean) => void
  confirmClose: () => void
  cancelClose: () => void
  getPathForFile: (file: File) => string
  setTitlebarTheme: (theme: 'light' | 'dark') => void
  findInPage: (text: string, forward: boolean, startNewSearch: boolean) => void
  stopFindInPage: () => void
  onDocumentOpened: (listener: (document: MarkdownDocument, anchor?: string) => void) => () => void
  onDocumentUpdated: (listener: (document: MarkdownDocument) => void) => () => void
  onExternalChange: (listener: (document: MarkdownDocument) => void) => () => void
  onOpenRequested: (listener: (filePath: string) => void) => () => void
  onDocumentError: (listener: (message: string) => void) => () => void
  onFindResult: (listener: (result: FindResult) => void) => () => void
  onCloseRequested: (listener: () => void) => () => void
  onAppCommand: (listener: (command: AppCommand) => void) => () => void
  onUpdateState: (listener: (state: AppUpdateState) => void) => () => void
}
