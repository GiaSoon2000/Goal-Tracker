import { useRef, useState } from 'react';
import { useConfirm } from '../../app/providers/ConfirmProvider';
import { useToast } from '../../app/providers/ToastProvider';
import { applyImportWithSafetyExport, exportBackupFile, validateImportDoc, type ImportSummary } from '../../repo/backupRepo';
import type { ExportDoc } from '../../domain/types';
import { Button } from '../../ui/Button';

type ImportState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'ready'; doc: ExportDoc; summary: ImportSummary };

export function MoreScreen() {
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const toast = useToast();

  async function handleExport() {
    await exportBackupFile();
    setExportStatus('Backup downloaded.');
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const MAX_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setImportState({ status: 'error', message: 'This file is too large (over 25 MB).' });
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setImportState({ status: 'error', message: "The file isn't valid JSON." });
      return;
    }

    const result = validateImportDoc(raw);
    if (!result.ok) {
      setImportState({ status: 'error', message: result.error });
      return;
    }
    setImportState({ status: 'ready', doc: result.doc, summary: result.summary });
  }

  async function handleApply(mode: 'replace' | 'merge') {
    if (importState.status !== 'ready') return;
    if (mode === 'replace') {
      const ok = await confirm({
        title: 'Replace everything?',
        description: 'This removes all current data on this device. A backup of your current data is downloaded first, automatically.',
        confirmLabel: 'Replace',
        danger: true,
      });
      if (!ok) return;
    }
    const { inserted, updated } = await applyImportWithSafetyExport(importState.doc, mode);
    setImportState({ status: 'idle' });
    toast.show(mode === 'replace' ? `Imported ${inserted} records` : `${inserted} new, ${updated} updated`);
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, paddingBlock: 16 }}>More</h1>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Backup</h2>
        <p style={{ color: 'var(--fg-muted)', marginBottom: 12 }}>Your data lives only on this device. Export a backup regularly.</p>
        <Button variant="primary" onClick={() => void handleExport()} style={{ marginBottom: 8 }}>
          Export backup (JSON)
        </Button>
        {exportStatus && <p style={{ marginTop: 8, marginBottom: 12, color: 'var(--on-track)' }}>{exportStatus}</p>}

        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => void handleFileSelected(e)} />
        <Button onClick={() => fileInputRef.current?.click()}>Import backup (JSON)</Button>

        {importState.status === 'error' && <p style={{ marginTop: 8, color: 'var(--danger)' }}>{importState.message}</p>}

        {importState.status === 'ready' && (
          <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Review import</p>
            <p style={{ color: 'var(--fg-muted)', fontSize: 13, marginBottom: 8 }}>
              {importState.summary.goals} goals · {importState.summary.milestones} milestones · {importState.summary.weeklyPlans} weekly plans · {importState.summary.tasks} tasks · {importState.summary.entries} entries
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => void handleApply('merge')} style={{ flex: 1 }}>
                Merge
              </Button>
              <Button variant="danger" onClick={() => void handleApply('replace')} style={{ flex: 1 }}>
                Replace
              </Button>
              <Button onClick={() => setImportState({ status: 'idle' })}>Cancel</Button>
            </div>
            <p style={{ color: 'var(--fg-muted)', fontSize: 12, marginTop: 8 }}>
              Merge keeps your current data and adds/updates from this file. Replace erases current data first (a backup is downloaded automatically before it does).
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Privacy</h2>
        <p style={{ color: 'var(--fg-muted)' }}>Stored on this device only. No account, no analytics, no external data collection.</p>
      </section>
    </div>
  );
}
