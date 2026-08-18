import { describe, expect, it } from 'vitest';
import { deriveLeadAnalytics } from '../lead-analytics';

describe('deriveLeadAnalytics', () => {
  it('falls back to "unknown"/"direct" when there is no referer', () => {
    const request = new Request('http://localhost/api/leads', { method: 'POST' });

    expect(deriveLeadAnalytics(request)).toEqual({ page: 'unknown', source: 'direct' });
  });

  it('reads the page from the referer path and marks same-site traffic as "site"', () => {
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { referer: 'http://localhost/#lead' }
    });

    expect(deriveLeadAnalytics(request)).toEqual({ page: '/', source: 'site' });
  });

  it('keeps the referer path as the page for a deep link', () => {
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { referer: 'http://localhost/uslugi/#lead' }
    });

    expect(deriveLeadAnalytics(request).page).toBe('/uslugi/');
  });

  it('prefers an explicit utm_source over the referer host', () => {
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { referer: 'http://localhost/?utm_source=telegram' }
    });

    expect(deriveLeadAnalytics(request).source).toBe('telegram');
  });

  it('uses the referring host as the source for external, non-utm traffic', () => {
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { referer: 'https://yandex.ru/search/?text=turni' }
    });

    expect(deriveLeadAnalytics(request).source).toBe('yandex.ru');
  });

  it('falls back to "unknown" when the referer header is not a valid url', () => {
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { referer: 'not-a-url' }
    });

    expect(deriveLeadAnalytics(request)).toEqual({ page: 'unknown', source: 'direct' });
  });

  it('never returns anything containing the request body', () => {
    // The analytics fields come only from headers; nothing derived from the
    // form body should ever leak in here — there is no form access at all.
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { referer: 'http://localhost/' }
    });

    const analytics = deriveLeadAnalytics(request);

    expect(Object.keys(analytics)).toEqual(['page', 'source']);
  });
});
