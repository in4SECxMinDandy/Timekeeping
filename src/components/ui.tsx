import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { avatarTone, initials } from '../lib/format';

/* ------------------------------- Button ------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'soft';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon: Icon,
  iconRight: IconRight,
  block,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} btn-${size} ${block ? 'btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={size === 'sm' ? 15 : 16} /> : null}
      {children ? <span>{children}</span> : null}
      {IconRight ? <IconRight size={size === 'sm' ? 15 : 16} /> : null}
    </button>
  );
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/* ------------------------------- Badge -------------------------------- */

export type BadgeTone =
  | 'slate'
  | 'brand'
  | 'success'
  | 'warn'
  | 'danger'
  | 'violet'
  | 'sky'
  | 'outline';

export function Badge({
  tone = 'slate',
  dot,
  children,
  className = '',
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  );
}

/* ------------------------------- Avatar ------------------------------- */

export function Avatar({
  name,
  size = 36,
  toneKey,
  className = '',
}: {
  name: string;
  size?: number;
  toneKey?: string;
  className?: string;
}) {
  return (
    <span
      className={`avatar avatar-${avatarTone(toneKey || name)} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/* -------------------------------- Form -------------------------------- */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
  className = '',
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={`field ${className}`}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="req">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...rest} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`select-wrap ${className}`}>
      <select className="select" {...rest}>
        {children}
      </select>
      <ChevronDown size={15} className="select-caret" />
    </span>
  );
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`} {...rest} />;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`switch-row ${disabled ? 'is-disabled' : ''}`}>
      <span className="switch-copy">
        <span className="switch-label">{label}</span>
        {description ? <span className="switch-desc">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : 'Bật tắt'}
        className={`switch ${checked ? 'is-on' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className="switch-thumb" />
      </button>
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`check-row ${disabled ? 'is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="check-box" aria-hidden="true">
        {checked ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      <span className="check-copy">
        <span>{label}</span>
        {description ? <span className="check-desc">{description}</span> : null}
      </span>
    </label>
  );
}

/* ------------------------------ Segmented ----------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined ? <span className="seg-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: string; label: ReactNode; count?: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          className={`tab ${value === t.value ? 'is-active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined ? <span className="tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- Dialog ------------------------------- */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass inline arrows; keeping the callback in a ref stops every parent
  // re-render (one per keystroke) from re-running the dialog lifecycle below.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const node = ref.current;
      const items = [...(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const field = items.find((el) => /^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName));
      (field ?? items[0] ?? node)?.focus();
    }, 20);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  return ref;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className = '',
  hideClose,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  hideClose?: boolean;
}) {
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal modal-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Hộp thoại'}
        ref={ref}
        tabIndex={-1}
      >
        {title || !hideClose ? (
          <div className="modal-head">
            <div>
              {title ? <h2 className="modal-title">{title}</h2> : null}
              {description ? <p className="modal-desc">{description}</p> : null}
            </div>
            {hideClose ? null : (
              <IconButton label="Đóng" onClick={onClose}>
                <X size={18} />
              </IconButton>
            )}
          </div>
        ) : null}
        {children ? <div className="modal-body">{children}</div> : null}
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  full,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  full?: boolean;
}) {
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay-sheet" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`m-sheet ${full ? 'm-sheet-full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Bảng thông tin'}
        ref={ref}
        tabIndex={-1}
      >
        <div className="m-sheet-grip" aria-hidden="true" />
        <div className="m-sheet-head">
          <div>
            {title ? <h2 className="m-sheet-title">{title}</h2> : null}
            {description ? <p className="m-sheet-desc">{description}</p> : null}
          </div>
          <IconButton label="Đóng" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="m-sheet-body">{children}</div>
        {footer ? <div className="m-sheet-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay-drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`drawer drawer-${size}`} role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
        <div className="drawer-head">
          <div>
            {title ? <h2 className="drawer-title">{title}</h2> : null}
            {description ? <p className="drawer-desc">{description}</p> : null}
          </div>
          <IconButton label="Đóng" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------- Dropdown ----------------------------- */

export function Dropdown({
  trigger,
  children,
  align = 'right',
  width = 220,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !menuRef.current) return;
    const anchor = wrapRef.current.getBoundingClientRect();
    const height = menuRef.current.offsetHeight;
    setUp(anchor.bottom + 6 + height > window.innerHeight - 8 && anchor.top - height - 6 > 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={wrapRef}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div
          ref={menuRef}
          className={`dropdown-menu dropdown-${align}${up ? ' is-up' : ''}`}
          style={{ minWidth: width }}
          role="menu"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
  disabled,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`dropdown-item ${danger ? 'is-danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon ? <Icon size={15} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="dropdown-label">{children}</div>;
}

/* ------------------------------- States ------------------------------- */

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-label="Đang tải" />;
}

export function LoadingBlock({ rows = 3, label = 'Đang tải dữ liệu' }: { rows?: number; label?: string }) {
  return (
    <div className="loading-block" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-line" key={i} style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? 'empty-compact' : ''}`}>
      {Icon ? (
        <span className="empty-icon">
          <Icon size={compact ? 20 : 24} />
        </span>
      ) : null}
      <p className="empty-title">{title}</p>
      {description ? <p className="empty-desc">{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <span className="error-state-icon">
        <AlertTriangle size={20} />
      </span>
      <div>
        <p className="error-state-title">Không tải được dữ liệu</p>
        <p className="error-state-desc">{message}</p>
      </div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------- Layout ------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-copy">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
      {children}
    </header>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'slate',
  hint,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: 'slate' | 'brand' | 'success' | 'warn' | 'danger' | 'violet' | 'sky';
  hint?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat-card stat-${tone} ${onClick ? 'is-clickable' : ''}`} onClick={onClick}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon ? (
          <span className="stat-icon">
            <Icon size={17} />
          </span>
        ) : null}
      </div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </Tag>
  );
}

export function Progress({
  value,
  max = 100,
  tone = 'brand',
  height = 6,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'success' | 'warn' | 'danger' | 'violet';
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className={`progress progress-${tone}`} style={{ height }}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CopyButton({ text, label = 'Sao chép' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={copied ? Check : Copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? 'Đã chép' : label}
    </Button>
  );
}

export function KV({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="kv">
      <span className="kv-label">{label}</span>
      <span className="kv-value">{children}</span>
    </div>
  );
}

export function useSearchFilter<T>(items: T[], query: string, pick: (item: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => pick(item).toLowerCase().includes(q));
}

export function useInputId(prefix = 'f'): string {
  const id = useId();
  return `${prefix}-${id}`;
}
