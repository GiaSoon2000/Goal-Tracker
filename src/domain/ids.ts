/**
 * UUIDv4. `crypto.randomUUID` exists in every secure context (a PWA service worker
 * requires HTTPS or localhost); the fallback covers plain-http LAN testing on a phone.
 */
export function newId<T extends string = string>(): T {
  const c: Crypto | undefined = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID() as T;
  if (!c) throw new Error('crypto is unavailable in this environment');
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40; // version 4
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // variant 10
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as T;
}
