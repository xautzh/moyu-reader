import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

export interface DialogAction {
  label: string
  tone?: 'primary' | 'danger' | 'neutral'
  disabled?: boolean
  onClick: () => void
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  detail?: string
  actions: DialogAction[]
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  actions,
  onCancel
}: ConfirmDialogProps): React.JSX.Element | null {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    dialogRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, open])

  if (!open) {
    return null
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="confirm-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <button className="dialog-close" type="button" onClick={onCancel} aria-label="取消">
          <X size={17} />
        </button>
        <div className="dialog-icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </div>
        <div className="dialog-copy">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
          {detail && <small>{detail}</small>}
        </div>
        <div className="dialog-actions">
          {actions.map((action) => (
            <button
              className={`dialog-button tone-${action.tone ?? 'neutral'}`}
              type="button"
              key={action.label}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
