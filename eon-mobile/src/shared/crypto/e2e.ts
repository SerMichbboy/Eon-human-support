// @ts-ignore — @noble packages use .js exports; Metro resolves them at runtime
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
// @ts-ignore
import { sha256 } from '@noble/hashes/sha256.js';
// @ts-ignore
import { gcm } from '@noble/ciphers/aes.js';

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  (globalThis.crypto ?? require('crypto')).getRandomValues(buf);
  return buf;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export interface E2EKeyPair {
  rawKey: Uint8Array;     // 32-byte AES key (stored in SecureStore)
  salt: string;           // base64 PBKDF2 salt (sent to server)
  encryptedKey: string;   // base64 AES-GCM(rawKey, derived_key) (sent to server)
}

/** Derives an AES-256 key from password + salt via PBKDF2-HMAC-SHA256, 100k iterations. */
function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  return pbkdf2(sha256, enc.encode(password), salt, { c: 100_000, dkLen: 32 });
}

/** Generates a new random raw key and wraps it with the password-derived key. */
export function generateE2EKeyPair(password: string): E2EKeyPair {
  const salt = randomBytes(16);
  const rawKey = randomBytes(32);
  const derivedKey = deriveKey(password, salt);

  // AES-GCM encrypt rawKey with derivedKey (nonce is prepended by @noble/ciphers)
  const nonce = randomBytes(12);
  const cipher = gcm(derivedKey, nonce);
  const ciphertext = cipher.encrypt(rawKey);

  // Pack as nonce + ciphertext
  const blob = new Uint8Array(nonce.length + ciphertext.length);
  blob.set(nonce);
  blob.set(ciphertext, nonce.length);

  return {
    rawKey,
    salt: toBase64(salt),
    encryptedKey: toBase64(blob),
  };
}

/** Decrypts the raw key from server-returned salt + encryptedKey using the password. */
export function unlockE2EKey(password: string, saltB64: string, encryptedKeyB64: string): Uint8Array {
  const salt = fromBase64(saltB64);
  const blob = fromBase64(encryptedKeyB64);
  const nonce = blob.slice(0, 12);
  const ciphertext = blob.slice(12);
  const derivedKey = deriveKey(password, salt);
  const cipher = gcm(derivedKey, nonce);
  return cipher.decrypt(ciphertext);
}

/** Returns the base64-encoded raw key for use in the X-User-Key header. */
export function rawKeyToHeader(rawKey: Uint8Array): string {
  return toBase64(rawKey);
}

/** Returns the base64-encoded raw key for use in the WebSocket init message. */
export function rawKeyToWsKey(rawKey: Uint8Array): string {
  return toBase64(rawKey);
}
