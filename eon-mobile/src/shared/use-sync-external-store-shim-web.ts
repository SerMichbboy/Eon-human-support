import { useSyncExternalStore } from 'react';

/**
 * Web replacement for `use-sync-external-store/shim` (base hook).
 *
 * zustand's CJS entry (`node_modules/zustand/index.js`) unconditionally
 * requires `use-sync-external-store/shim`, which — regardless of the real
 * React version — always uses its own bundled polyfill implementation
 * rather than detecting and delegating to React's real, built-in
 * `useSyncExternalStore` (confirmed separately: calling
 * `React.useSyncExternalStore` directly works fine on web here). That
 * polyfill is what hangs on web in this project's exact bundle (isolated
 * with a minimal `create<{n:number}>(() => ({n:42}))` repro, no app code
 * involved) — native is presumably unaffected since it's the same code
 * path everywhere, so this is scoped to web via Metro's resolver (see
 * `metro.config.js`) rather than changing zustand's version, which would
 * touch native too.
 */
export { useSyncExternalStore };
