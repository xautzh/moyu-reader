import { CheckCircle2, Download, RefreshCw, RotateCw, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { AppUpdateState } from '../../../shared/types'

interface UpdateDialogProps {
  open: boolean
  state: AppUpdateState
  onClose: () => void
  onCheck: () => void
  onDownload: () => void
  onInstall: () => void
}

function updateCopy(state: AppUpdateState): {
  title: string
  description: string
  detail?: string
} {
  switch (state.status) {
    case 'checking':
      return { title: '正在检查更新', description: '正在连接 GitHub 获取最新版本信息。' }
    case 'available':
      return {
        title: `发现新版本 v${state.version ?? ''}`,
        description: '更新将在后台下载，完成后可以直接重启安装。',
        detail: `当前版本：v${state.currentVersion}`
      }
    case 'downloading':
      return {
        title: `正在下载 v${state.version ?? ''}`,
        description: '可以继续编辑文档，下载完成后墨阅会提醒你重启。',
        detail: `下载进度：${Math.round(state.percent ?? 0)}%`
      }
    case 'downloaded':
      return {
        title: `v${state.version ?? ''} 已准备好`,
        description: '重启后将自动完成安装。未保存的文档会先提示保存。',
        detail: '建议保存当前工作后立即更新。'
      }
    case 'up-to-date':
      return {
        title: '已经是最新版本',
        description: `当前版本 v${state.currentVersion} 暂无可用更新。`
      }
    case 'error':
      return {
        title: '检查更新失败',
        description: '暂时无法连接更新服务，请检查网络后重试。',
        detail: state.message
      }
    case 'unsupported':
      return {
        title: '当前环境暂不支持自动更新',
        description: state.message ?? '请前往项目主页手动下载最新版本。',
        detail: `当前版本：v${state.currentVersion}`
      }
    default:
      return {
        title: '软件更新',
        description: `当前版本：v${state.currentVersion}`
      }
  }
}

export function UpdateDialog({
  open,
  state,
  onClose,
  onCheck,
  onDownload,
  onInstall
}: UpdateDialogProps): React.JSX.Element | null {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const copy = updateCopy(state)

  useEffect(() => {
    if (!open) {
      return
    }
    dialogRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && state.status !== 'downloading') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open, state.status])

  if (!open) {
    return null
  }

  const busy = state.status === 'checking' || state.status === 'downloading'

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="confirm-dialog update-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <button
          className="dialog-close"
          type="button"
          onClick={onClose}
          disabled={state.status === 'downloading'}
          aria-label="关闭"
        >
          <X size={17} />
        </button>
        <div className="dialog-icon update-dialog-icon" aria-hidden="true">
          {state.status === 'downloaded' || state.status === 'up-to-date' ? (
            <CheckCircle2 size={22} />
          ) : busy ? (
            <RefreshCw className="spin-icon" size={22} />
          ) : (
            <Download size={22} />
          )}
        </div>
        <div className="dialog-copy">
          <h2 id={titleId}>{copy.title}</h2>
          <p id={descriptionId}>{copy.description}</p>
          {copy.detail && <small>{copy.detail}</small>}
          {state.status === 'downloading' && (
            <div
              className="update-progress"
              role="progressbar"
              aria-label="更新下载进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={state.percent ?? 0}
            >
              <span style={{ width: `${state.percent ?? 0}%` }} />
            </div>
          )}
        </div>
        <div className="dialog-actions">
          {state.status === 'available' && (
            <button className="dialog-button tone-primary" type="button" onClick={onDownload}>
              下载更新
            </button>
          )}
          {state.status === 'downloaded' && (
            <button className="dialog-button tone-primary" type="button" onClick={onInstall}>
              <RotateCw size={15} />
              立即重启更新
            </button>
          )}
          {(state.status === 'error' || state.status === 'idle') && (
            <button className="dialog-button tone-primary" type="button" onClick={onCheck}>
              重新检查
            </button>
          )}
          {!busy && (
            <button className="dialog-button" type="button" onClick={onClose}>
              {state.status === 'downloaded' ? '稍后' : '关闭'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
