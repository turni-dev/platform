import type { OwnerAuthClientErrorCode } from './owner-auth-client';

const keys = {
  invalid: 'errorInvalid',
  rate_limited: 'errorRateLimited',
  unauthorized: 'errorCodeRejected',
  unavailable: 'errorUnavailable'
} as const satisfies Record<OwnerAuthClientErrorCode, string>;

export type AuthErrorMessageKey = (typeof keys)[OwnerAuthClientErrorCode];

/** Maps a client outcome to a catalog key; none of the texts names an account. */
export function authErrorMessageKey(
  code: OwnerAuthClientErrorCode
): AuthErrorMessageKey {
  return keys[code];
}
