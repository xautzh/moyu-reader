export function formatShortcut(platform: NodeJS.Platform, key: string): string {
  return platform === 'darwin' ? `⌘${key}` : `Ctrl+${key}`
}

export function revealInFolderLabel(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? '在 Finder 中显示' : '在资源管理器中显示'
}
