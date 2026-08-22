import { describe, expect, it } from 'vitest';
import { detectCapabilityIntent } from '../capability-intent.js';

const occurredAt = new Date('2026-08-22T10:00:00.000Z');

describe('detectCapabilityIntent', () => {
  it('detects no intent in ordinary chatter', () => {
    expect(detectCapabilityIntent('Здравствуйте, у вас открыто сегодня?', occurredAt)).toEqual({
      type: 'none'
    });
  });

  it('requires a recognizable time token even with a booking keyword', () => {
    expect(detectCapabilityIntent('Запишите меня как-нибудь на этой неделе', occurredAt)).toEqual(
      { type: 'none' }
    );
  });

  it('detects a same-day booking with an explicit time', () => {
    const intent = detectCapabilityIntent('Запишите меня на встречу в 18:30', occurredAt);

    expect(intent).toEqual({
      type: 'calendar_booking',
      summary: 'Запишите меня на встречу в 18:30',
      startsAt: '2026-08-22T18:30:00.000Z',
      endsAt: '2026-08-22T19:30:00.000Z'
    });
  });

  it('rolls the booking to the next day for "завтра"', () => {
    const intent = detectCapabilityIntent('Забронируйте столик завтра в 09:15', occurredAt);

    expect(intent).toEqual({
      type: 'calendar_booking',
      summary: 'Забронируйте столик завтра в 09:15',
      startsAt: '2026-08-23T09:15:00.000Z',
      endsAt: '2026-08-23T10:15:00.000Z'
    });
  });

  it('rejects an out-of-range time token', () => {
    expect(detectCapabilityIntent('Запишите меня в 99:99', occurredAt)).toEqual({ type: 'none' });
  });

  it('rejects blank text', () => {
    expect(detectCapabilityIntent('   ', occurredAt)).toEqual({ type: 'none' });
  });
});
