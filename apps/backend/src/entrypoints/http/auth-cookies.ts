import { ownerAccessTokenLifetimeMs } from '../../modules/tenancy/application/owner-access-token.js';

/**
 * Browser-facing session transport. Both credentials stay in HttpOnly cookies so
 * no script can read them. The access token covers the whole site because the
 * cabinet renders on the server and authenticates a plain page load; the refresh
 * credential stays on the auth path so it never travels with anything else.
 */
export const AuthCookieName = {
  Access: 'turni_access',
  Refresh: 'turni_refresh'
} as const;

export const AuthCookiePath = {
  Access: '/',
  Refresh: '/api/v1/auth'
} as const;

export interface AuthCookieOptions {
  readonly secure: boolean;
  readonly accessPath: string;
  readonly refreshPath: string;
}

export interface IssuedAuthCookieSession {
  readonly accessToken: string;
  readonly refreshCredential: string;
  readonly idleExpiresAt: Date;
}

export interface TrustedOriginInput {
  readonly origin?: string | undefined;
  readonly referer?: string | undefined;
  readonly allowedOrigins: readonly string[];
}

const cookieValuePattern = /^[\w!#$%&'()*+./:<=>?@[\]^`{|}~-]*$/;

export function authCookieOptions(
  overrides: Readonly<{ secure: boolean; accessPath?: string; refreshPath?: string }>
): AuthCookieOptions {
  return {
    secure: overrides.secure,
    accessPath: overrides.accessPath ?? AuthCookiePath.Access,
    refreshPath: overrides.refreshPath ?? AuthCookiePath.Refresh
  };
}

export function issuedAuthCookies(
  session: IssuedAuthCookieSession,
  options: AuthCookieOptions,
  now = new Date()
): readonly string[] {
  return [
    serializeAuthCookie({
      name: AuthCookieName.Access,
      value: session.accessToken,
      path: options.accessPath,
      maxAgeSeconds: Math.floor(ownerAccessTokenLifetimeMs / 1_000),
      secure: options.secure
    }),
    serializeAuthCookie({
      name: AuthCookieName.Refresh,
      value: session.refreshCredential,
      path: options.refreshPath,
      maxAgeSeconds: remainingSeconds(session.idleExpiresAt, now),
      secure: options.secure
    })
  ];
}

export function clearedAuthCookies(options: AuthCookieOptions): readonly string[] {
  return [
    serializeAuthCookie({
      name: AuthCookieName.Access,
      value: '',
      path: options.accessPath,
      maxAgeSeconds: 0,
      secure: options.secure
    }),
    serializeAuthCookie({
      name: AuthCookieName.Refresh,
      value: '',
      path: options.refreshPath,
      maxAgeSeconds: 0,
      secure: options.secure
    })
  ];
}

export function readCookie(
  header: string | undefined,
  name: string
): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) {
      continue;
    }

    if (pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }

  return undefined;
}

/** Fails closed: a mutation without a recognizable browser origin is not trusted. */
export function isTrustedOrigin(input: TrustedOriginInput): boolean {
  const origin = input.origin ?? originOf(input.referer);
  if (origin === undefined) {
    return false;
  }

  return input.allowedOrigins.includes(origin);
}

function serializeAuthCookie(
  input: Readonly<{
    name: string;
    value: string;
    path: string;
    maxAgeSeconds: number;
    secure: boolean;
  }>
): string {
  if (!cookieValuePattern.test(input.value)) {
    throw new Error('Invalid cookie value');
  }

  const attributes = [
    `${input.name}=${input.value}`,
    `Path=${input.path}`,
    `Max-Age=${input.maxAgeSeconds}`,
    'HttpOnly'
  ];
  if (input.secure) {
    attributes.push('Secure');
  }
  attributes.push('SameSite=Strict');

  return attributes.join('; ');
}

function remainingSeconds(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1_000));
}

function originOf(referer: string | undefined): string | undefined {
  if (referer === undefined) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
