import type { Settings } from './types';

export const SCHEMA_VERSION = 1;

export function defaultSettings(now: number): Settings {
  return {
    id: 'singleton',
    weekStartsOn: 1,
    dayRolloverHour: 0,
    theme: 'system',
    displayUnits: { weight: 'kg', distance: 'km', duration: 'min', currency: 'USD' },
    lastBackupAt: null,
    backupReminderDays: 14,
    onboardedAt: null,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}
