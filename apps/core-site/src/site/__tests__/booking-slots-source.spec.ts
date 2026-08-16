import { describe, expect, it, vi } from 'vitest';
import type { SiteFetch } from '../../content/cms-page-source';
import { createBookingSlotsSource, formatSlotLabel } from '../booking-slots-source';

function respondWith(body: unknown, ok = true): SiteFetch {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      text: () => Promise.resolve(JSON.stringify(body))
    })
  );
}

describe('formatSlotLabel', () => {
  it('spells the time out with an explicit timezone', () => {
    // 11:00 UTC — лето, Москва без переходов на летнее время: +3 часа.
    expect(formatSlotLabel('2026-08-16T11:00:00.000Z')).toBe('16 августа в 14:00 МСК');
  });
});

describe('createBookingSlotsSource', () => {
  it('turns the CMS list into options with a ready-made label', async () => {
    const source = createBookingSlotsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({
        data: [{ id: 5, startsAt: '2026-08-16T11:00:00.000Z', durationMinutes: 30 }]
      })
    });

    await expect(source.get()).resolves.toEqual([
      {
        id: '5',
        startsAt: '2026-08-16T11:00:00.000Z',
        durationMinutes: 30,
        label: '16 августа в 14:00 МСК'
      }
    ]);
  });

  it('asks the dedicated public endpoint, not the core collection route', async () => {
    const fetch = respondWith({ data: [] });

    await createBookingSlotsSource({ baseUrl: 'http://cms:1337', fetch }).get();

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://cms:1337/api/booking-slots/available'
    );
  });

  it('hides the time picker instead of failing when the CMS is unreachable', async () => {
    const source = createBookingSlotsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ error: 'boom' }, false)
    });

    await expect(source.get()).resolves.toEqual([]);
  });

  it('hides the time picker when the answer does not match the expected shape', async () => {
    const source = createBookingSlotsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: 'нет' })
    });

    await expect(source.get()).resolves.toEqual([]);
  });

  it('never calls the CMS when no address is configured, and offers no slots', async () => {
    const fetch = respondWith({ data: [] });

    await expect(createBookingSlotsSource({ fetch }).get()).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
