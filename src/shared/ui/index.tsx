import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { STATUS_LABEL } from '@/domain/statuses'
import { initials } from '@/domain/format'
import type { AppointmentStatus } from '@/domain/types'

/* ---------- Button ---------- */
type ButtonVariant = 'default' | 'book' | 'primary' | 'ghost' | 'danger'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  loading?: boolean
  icon?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', block, loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    variant !== 'default' && `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    block && 'btn--block',
    icon && 'btn--icon',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  )
})

/* ---------- Field ---------- */
interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
  className?: string
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={`${id}-err`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return <input ref={ref} className="input" {...props} />
})
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return <select ref={ref} className="select" {...props} />
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  return <textarea ref={ref} className="textarea" {...props} />
})

export function Checkbox({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: string }) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span>
        {label}
        {hint && <span className="field__hint" style={{ display: 'block' }}>{hint}</span>}
      </span>
    </label>
  )
}

/* ---------- Status badge ---------- */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABEL[status]}</span>
}

/* ---------- Empty state ---------- */
export function EmptyState({
  title,
  text,
  action,
  center,
}: {
  title: string
  text?: ReactNode
  action?: ReactNode
  center?: boolean
}) {
  return (
    <div className={`empty${center ? ' empty--center' : ''}`}>
      <p className="empty__title">{title}</p>
      {text && <p className="empty__text">{text}</p>}
      {action}
    </div>
  )
}

/* ---------- Avatar ---------- */
export function Avatar({ name, photo, size = 48 }: { name: string; photo: string | null; size?: number }) {
  return (
    <span className="avatar" style={{ ['--size' as string]: `${size}px` }} aria-hidden={!photo}>
      {photo ? <img src={photo} alt={name} /> : initials(name)}
    </span>
  )
}

/* ---------- Modal ---------- */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const node = ref.current
    node?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      // Простая ловушка фокуса внутри модалки
      if (e.key === 'Tab' && node) {
        const items = node.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prevFocus?.focus()
    }
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <Button variant="ghost" icon size="sm" onClick={onClose} aria-label="Закрыть" data-close>
            <Icon name="close" />
          </Button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- Confirm dialog ---------- */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  danger,
  withReason,
  onConfirm,
  onClose,
}: {
  title: string
  text: ReactNode
  confirmLabel: string
  danger?: boolean
  withReason?: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Не сейчас</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p>{text}</p>
        {withReason && (
          <Field label="Причина" hint="Необязательно. Сохранится в истории записи">
            {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}
          </Field>
        )}
      </div>
    </Modal>
  )
}

/* ---------- Toasts ---------- */
interface ToastItem {
  id: number
  text: string
  kind: 'ok' | 'error'
}
const ToastCtx = createContext<(text: string, kind?: ToastItem['kind']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((text: string, kind: ToastItem['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, text, kind }])
    window.setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast${t.kind === 'error' ? ' toast--error' : ''}`}>
            <span>{t.text}</span>
            <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} aria-label="Скрыть">
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/* ---------- Stars ---------- */
export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-label={`Оценка ${value} из 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden style={{ opacity: n <= value ? 1 : 0.25 }}>
          ★
        </span>
      ))}
    </span>
  )
}

export function StarsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="stars stars--input" role="group" aria-label="Оценка">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-pressed={n <= value} aria-label={`${n} из 5`} onClick={() => onChange(n)}>
          ★
        </button>
      ))}
    </div>
  )
}

/* ---------- Icons (inline, без зависимостей) ---------- */
const ICONS = {
  close: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zM10 21h4',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  scissors: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM8.5 7.5L20 18M8.5 16.5L20 6',
  tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7.5M22 21a7 7 0 00-4.5-6.5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 4.1V4a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  home: 'M4 11l8-7 8 7v9H4zM10 20v-6h4v6',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
} as const
export type IconName = keyof typeof ICONS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={ICONS[name]} />
    </svg>
  )
}

/* ---------- Photo input ---------- */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Пока нет Supabase Storage, фото читается в data URL и уменьшается до 800px,
 * чтобы не переполнить localStorage. Ограничения по формату и размеру — из плана.
 */
export function PhotoInput({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label: string }) {
  const [error, setError] = useState('')
  const id = useId()

  const onFile = (file: File | undefined) => {
    setError('')
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) return setError('Подходят только JPG, PNG или WebP')
    if (file.size > MAX_PHOTO_BYTES) return setError('Файл больше 5 МБ')
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      onChange(canvas.toDataURL('image/webp', 0.82))
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      setError('Не удалось прочитать изображение')
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="row">
        {value ? (
          <img src={value} alt="" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 'var(--r-sm)' }} />
        ) : (
          <div className="photo-empty" style={{ width: 88, height: 88, borderRadius: 'var(--r-sm)' }}>
            Нет фото
          </div>
        )}
        <div className="row">
          <label className="btn btn--sm" htmlFor={id}>
            {value ? 'Заменить' : 'Загрузить'}
          </label>
          <input id={id} type="file" accept={PHOTO_TYPES.join(',')} className="visually-hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              Удалить
            </Button>
          )}
        </div>
      </div>
      {error ? <span className="field__error">{error}</span> : <span className="field__hint">JPG, PNG или WebP до 5 МБ</span>}
    </div>
  )
}
