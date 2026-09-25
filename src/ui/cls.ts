/**
 * Joins CSS Module class names, filtering out falsy values. Needed because
 * `noUncheckedIndexedAccess` types every `styles.foo` access as `string | undefined`
 * (there is no per-file codegen for CSS Modules in this project — ARCHITECTURE.md
 * keeps the dependency budget minimal), so a raw `styles.foo` cannot be passed
 * directly into a strictly-typed `className?: string` prop under `exactOptionalPropertyTypes`.
 */
export function cls(...names: (string | undefined | false | null)[]): string {
  return names.filter((n): n is string => Boolean(n)).join(' ');
}
