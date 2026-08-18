export interface LeadAnalytics {
  /** Path of the page the form was submitted from. Never the query string or hash. */
  readonly page: string;
  /** Best-effort traffic source: an explicit utm_source, the referring host, or "direct"/"site". */
  readonly source: string;
}

/**
 * Derives metadata-only attribution for the lead analytics event: which page
 * the form lived on and where the visitor came from. Reads only the
 * `Referer` header and the request's own URL — never the form body, so it
 * cannot accidentally carry the name, contact or task text.
 */
export function deriveLeadAnalytics(request: Request): LeadAnalytics {
  const referer = request.headers.get('referer');
  if (referer === null) {
    return { page: 'unknown', source: 'direct' };
  }

  let refererUrl: URL;
  try {
    refererUrl = new URL(referer);
  } catch {
    return { page: 'unknown', source: 'direct' };
  }

  const requestUrl = new URL(request.url);
  const utmSource = refererUrl.searchParams.get('utm_source');
  const source =
    utmSource !== null && utmSource.trim().length > 0
      ? utmSource
      : refererUrl.host === requestUrl.host
        ? 'site'
        : refererUrl.host;

  return { page: refererUrl.pathname, source };
}
