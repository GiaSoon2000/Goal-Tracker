import { getSettingsSnapshot } from '../repo/settingsRepo';
import { defaultSettings } from '../domain/defaults';
import type { Settings } from '../domain/types';
import { useLive } from './useLive';

const FALLBACK = defaultSettings(0);

/**
 * Falls back to defaults until `ensureSettings()` (called once at boot, see
 * main.tsx) has written the real row — the live query then re-fires automatically.
 */
export function useSettings(): Settings {
  return useLive(async () => (await getSettingsSnapshot()) ?? FALLBACK, [], FALLBACK).data;
}
