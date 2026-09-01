interface BrandMarkProps {
  size?: 'small' | 'large'
}

export function BrandMark({ size = 'small' }: BrandMarkProps): React.JSX.Element {
  return (
    <span className={`brand-mark brand-mark-${size}`} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <title>墨阅标志</title>
        <path d="M8.5 10.5c4.2 0 7.8 1.2 11.5 4.1v17c-3.7-2.7-7.3-3.9-11.5-3.9V10.5Z" />
        <path d="M31.5 10.5c-4.2 0-7.8 1.2-11.5 4.1v17c3.7-2.7 7.3-3.9 11.5-3.9V10.5Z" />
        <path className="brand-mark-accent" d="m17.2 8 2.8-2.8L22.8 8 20 10.8 17.2 8Z" />
      </svg>
    </span>
  )
}
