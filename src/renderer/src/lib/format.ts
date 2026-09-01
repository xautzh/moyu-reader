export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatRecentTime(timestamp: number): string {
  const elapsed = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (elapsed < minute) {
    return '刚刚'
  }
  if (elapsed < hour) {
    return `${Math.floor(elapsed / minute)} 分钟前`
  }
  if (elapsed < day) {
    return `${Math.floor(elapsed / hour)} 小时前`
  }
  if (elapsed < 7 * day) {
    return `${Math.floor(elapsed / day)} 天前`
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric'
  }).format(timestamp)
}

export function displayPath(filePath: string): string {
  const segments = filePath.split(/[\\/]/)
  if (segments.length <= 3) {
    return filePath
  }
  return `…\\${segments.slice(-3).join('\\')}`
}
