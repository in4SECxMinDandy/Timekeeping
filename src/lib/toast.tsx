import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type Tone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastValue {
  push: (message: string, tone?: Tone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = ++seq.current;
      setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
      const timer = window.setTimeout(() => remove(id), tone === 'error' ? 6000 : 3800);
      timers.current.push(timer);
    },
    [remove],
  );

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  const value: ToastValue = {
    push,
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" role="status" aria-live="polite">
        {items.map((t) => (
          <div className={`toast toast-${t.tone}`} key={t.id}>
            {t.tone === 'success' ? (
              <CheckCircle2 size={18} />
            ) : t.tone === 'error' ? (
              <AlertCircle size={18} />
            ) : (
              <Info size={18} />
            )}
            <span>{t.message}</span>
            <button className="toast-close" onClick={() => remove(t.id)} aria-label="Đóng thông báo">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
