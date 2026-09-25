import type { ReactNode } from 'react';
import { ConfirmProvider } from './ConfirmProvider';
import { ToastProvider } from './ToastProvider';
import { UpdateProvider } from './UpdateProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <UpdateProvider>{children}</UpdateProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
