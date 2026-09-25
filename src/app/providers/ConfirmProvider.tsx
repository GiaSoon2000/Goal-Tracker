import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import s from './Confirm.module.css';

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
}
type ConfirmApi = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmApi | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmApi>(
    (options) =>
      new Promise((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  const close = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className={s.overlay} role="presentation" onClick={() => close(false)}>
          <div className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title" className={s.title}>
              {pending.title}
            </h2>
            {pending.description && <p className={s.description}>{pending.description}</p>}
            <div className={s.actions}>
              <button type="button" className={s.cancel} onClick={() => close(false)}>
                Cancel
              </button>
              <button type="button" className={pending.danger ? s.danger : s.confirm} onClick={() => close(true)}>
                {pending.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
