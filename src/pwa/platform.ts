/** ARCHITECTURE.md §6.6 — iOS has no `beforeinstallprompt` and no back button in
 *  standalone mode, both of which change what the UI must do. */

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
