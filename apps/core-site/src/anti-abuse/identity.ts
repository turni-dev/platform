export const SESSION_COOKIE_NAME = 'ca_sid';

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface RequestIdentity {
  readonly ip: string;
  readonly sessionId: string;
  /** Set only when a fresh session id was minted; the caller must attach it as a response header. */
  readonly setCookie?: string;
}

/** First address in `x-forwarded-for` is the client closest to the origin request. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor !== null) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp !== null && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return 'unknown';
}

function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie');
  if (header === null) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name === SESSION_COOKIE_NAME) {
      const value = part.slice(separator + 1).trim();

      return value.length > 0 ? value : undefined;
    }
  }

  return undefined;
}

/**
 * Resolves a per-visitor identity for rate limiting: the client IP plus a
 * long-lived, non-JS session id carried in a cookie (the site works without
 * JavaScript, so this cannot rely on any client-side script). When the
 * request has no session cookie yet, a fresh id is minted and returned as a
 * `setCookie` value the caller must attach to its response.
 */
export function resolveRequestIdentity(request: Request): RequestIdentity {
  const ip = getClientIp(request);
  const existing = readSessionCookie(request);
  if (existing !== undefined) {
    return { ip, sessionId: existing };
  }

  const sessionId = crypto.randomUUID();
  const setCookie = `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${String(
    SESSION_COOKIE_MAX_AGE_SECONDS
  )}; HttpOnly; SameSite=Lax`;

  return { ip, sessionId, setCookie };
}
