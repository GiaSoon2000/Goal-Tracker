import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import s from './Toast.module.css';

interface ToastOptions {
  undo?: () => void;
}
interface ToastState {
  id: number;
  message: string;
  undo?: (() => void) | undefined;
}
interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef(0);
  const nextId = useRef(0);

  const show = useCallback((message: string, options?: ToastOptions) => {
    window.clearTimeout(timerRef.current);
    const id = nextId.current++;
    setToast({ id, message, undo: options?.undo });
    timerRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4_000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div className={s.toast} role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className={s.action}
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
