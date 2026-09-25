import { Component, type ErrorInfo, type ReactNode } from 'react';
import { exportBackupFile } from '../repo/backupRepo';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * A crash in a local-first app with no server copy is the worst failure mode.
 * Never trap the user's data behind a white screen — always offer a backup download.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error', error, info.componentStack);
  }

  private handleDownload = () => {
    void exportBackupFile();
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Something went wrong</h1>
        <p style={{ color: 'var(--fg-muted)', marginBottom: 16 }}>{this.state.error.message}</p>
        <button type="button" onClick={this.handleDownload} style={{ display: 'block', width: '100%', padding: 12, marginBottom: 8, background: 'var(--accent)', color: 'var(--accent-fg)', borderRadius: 8 }}>
          Download backup (JSON)
        </button>
        <button type="button" onClick={() => window.location.reload()} style={{ display: 'block', width: '100%', padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
          Reload
        </button>
      </div>
    );
  }
}
