import { useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';

/** Applies Settings.theme ('system' | 'light' | 'dark') to the document root. */
export function ThemeEffect() {
  const settings = useSettings();
  useEffect(() => {
    if (settings.theme === 'system') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings.theme]);
  return null;
}
