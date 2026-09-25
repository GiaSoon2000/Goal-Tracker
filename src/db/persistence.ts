export type PersistState = 'persisted' | 'denied' | 'unsupported';

/**
 * Called after the user's first successful goal creation, not at boot — browsers
 * weigh engagement, so the grant rate is far higher there (EDGE-CASES.md EC-S03).
 */
export async function ensurePersistence(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported'; // Safari/WebKit today
  if (await navigator.storage.persisted()) return 'persisted';
  return (await navigator.storage.persist()) ? 'persisted' : 'denied';
}

export async function storageEstimate(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usageBytes: e.usage ?? 0, quotaBytes: e.quota ?? 0 };
}
