import type { ReactNode } from 'react';
import { ConfirmProvider } from './ConfirmProvider';
import { ToastProvider } from './ToastProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
