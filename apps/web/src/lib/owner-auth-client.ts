import {
  OwnerAuthChallengeSchema,
  OwnerAuthRequestSchema,
  OwnerAuthVerifyRequestSchema,
  OwnerIdentitySchema,
  type OwnerAuthChallenge,
  type OwnerIdentity
} from '@turni/contracts';
import type { ZodType } from 'zod';

export type OwnerAuthFlow = 'register' | 'login';

/** Every refusal collapses into one of these; none of them names an account. */
export type OwnerAuthClientErrorCode =
  | 'invalid'
  | 'rate_limited'
  | 'unauthorized'
  | 'unavailable';

export type OwnerAuthOutcome<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'error'; readonly code: OwnerAuthClientErrorCode };

export interface OwnerAuthClientOptions {
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
  readonly cookie?: string;
}

export async function requestOwnerCode(
  flow: OwnerAuthFlow,
  email: string,
  options?: OwnerAuthClientOptions
): Promise<OwnerAuthOutcome<OwnerAuthChallenge>> {
  const body = OwnerAuthRequestSchema.safeParse({ email });
  if (!body.success) {
    return invalid();
  }

  return post(`/api/v1/auth/${flow}/request`, body.data, OwnerAuthChallengeSchema, options);
}

export async function verifyOwnerCode(
  flow: OwnerAuthFlow,
  email: string,
  code: string,
  options?: OwnerAuthClientOptions
): Promise<OwnerAuthOutcome<OwnerIdentity>> {
  const body = OwnerAuthVerifyRequestSchema.safeParse({ email, code });
  if (!body.success) {
    return invalid();
  }

  return post(`/api/v1/auth/${flow}/verify`, body.data, OwnerIdentitySchema, options);
}

/**
 * Ends the session. It never reports a failure: the browser is leaving the
 * cabinet either way, and the server clears the cookies when it can.
 */
export async function signOutOwner(options?: OwnerAuthClientOptions): Promise<void> {
  const call = options?.fetch ?? fetch;

  try {
    await call(`${options?.baseUrl ?? ''}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store'
    });
  } catch {
    // Nothing to recover: the next request without a session lands on /login.
  }
}

/** Resolves the signed-in owner, or nothing when the session is gone. */
export async function fetchOwnerIdentity(
  options?: OwnerAuthClientOptions
): Promise<OwnerIdentity | undefined> {
  const call = options?.fetch ?? fetch;
  const cookie = options?.cookie;

  try {
    const response = await call(`${options?.baseUrl ?? ''}/api/v1/auth/me`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      ...(cookie === undefined ? {} : { headers: { cookie } })
    });
    if (!response.ok) {
      return undefined;
    }

    const parsed = OwnerIdentitySchema.safeParse(await response.json());

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function post<T>(
  path: string,
  body: unknown,
  schema: ZodType<T>,
  options?: OwnerAuthClientOptions
): Promise<OwnerAuthOutcome<T>> {
  const call = options?.fetch ?? fetch;

  let response: Response;
  try {
    response = await call(`${options?.baseUrl ?? ''}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    return { status: 'error', code: 'unavailable' };
  }

  if (!response.ok) {
    return { status: 'error', code: outcomeFor(response.status) };
  }

  try {
    const parsed = schema.safeParse(await response.json());

    return parsed.success
      ? { status: 'ok', value: parsed.data }
      : { status: 'error', code: 'unavailable' };
  } catch {
    return { status: 'error', code: 'unavailable' };
  }
}

function outcomeFor(status: number): OwnerAuthClientErrorCode {
  if (status === 429) {
    return 'rate_limited';
  }
  if (status === 400) {
    return 'invalid';
  }
  if (status === 401 || status === 403) {
    return 'unauthorized';
  }

  return 'unavailable';
}

function invalid<T>(): OwnerAuthOutcome<T> {
  return { status: 'error', code: 'invalid' };
}
