/**
 * Web replacement for `expo-secure-store`.
 *
 * Its actual web implementation
 * (`node_modules/expo-secure-store/src/ExpoSecureStore.web.ts`) is a bare
 * `export default {}` — every method called through it (`getValueWithKeyAsync`
 * etc.) is `undefined`, so calling it throws `"... is not a function"`
 * (surfaced live via the register flow: "ExpoSecureStore.default.
 * getValueWithKeyAsync is not a function"). Backed by `localStorage` instead
 * so auth tokens and the E2E `raw_key` (see `shared/store/auth.ts`) actually
 * persist on web.
 *
 * Security note: this is a real, deliberate downgrade from native — iOS/
 * Android Keychain-backed storage vs. plain `localStorage`, which any XSS on
 * this origin could read unencrypted. Native is unaffected (this file is
 * only wired in for `platform === 'web'`, see `metro.config.js`).
 */
export async function getItemAsync(key: string): Promise<string | null> {
  return window.localStorage.getItem(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  window.localStorage.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  window.localStorage.removeItem(key);
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}
