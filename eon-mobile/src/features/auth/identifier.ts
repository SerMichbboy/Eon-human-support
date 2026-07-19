/** Mirrors the server's classify_identifier() (src/application/auth/identifier.py)
 * closely enough for display purposes (which icon/label to show) — the server
 * is the actual source of truth for validation, this is not re-validated here. */
export type IdentifierType = 'email' | 'phone';

export function identifierType(value: string): IdentifierType {
  return value.includes('@') ? 'email' : 'phone';
}
