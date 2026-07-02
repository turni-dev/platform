import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AvailabilityRequestSchema,
  type BookingSystemPort,
  type BotProvisionerPort,
  CalendarEventRequestSchema,
  type CalendarPort,
  SpeechToTextRequestSchema,
  type SpeechPort
} from './operations.js';

describe('operational port contracts', () => {
  it('requires positive booking party size', () => {
    expect(
      AvailabilityRequestSchema.parse({
        tenantId: '01900000-0000-7000-8000-000000000001',
        locationId: '01900000-0000-7000-8000-000000000002',
        at: '2026-07-02T12:00:00.000Z',
        partySize: 4
      }).partySize
    ).toBe(4);
    expect(() =>
      AvailabilityRequestSchema.parse({
        tenantId: '01900000-0000-7000-8000-000000000001',
        locationId: '01900000-0000-7000-8000-000000000002',
        at: '2026-07-02T12:00:00.000Z',
        partySize: 0
      })
    ).toThrow();
  });

  it('defines booking and knowledge sync methods', () => {
    expectTypeOf<BookingSystemPort>().toHaveProperty('checkAvailability');
    expectTypeOf<BookingSystemPort>().toHaveProperty('createBooking');
    expectTypeOf<BookingSystemPort>().toHaveProperty('syncMenu');
    expectTypeOf<BookingSystemPort>().toHaveProperty('syncStopList');
  });

  it('keeps bot provisioning vendor-neutral', () => {
    expectTypeOf<BotProvisionerPort>().toHaveProperty('provision');
  });

  it('validates calendar event boundaries', () => {
    expect(
      CalendarEventRequestSchema.parse({
        calendarId: 'restaurant-main',
        title: 'Банкет',
        startsAt: '2026-07-02T12:00:00.000Z',
        endsAt: '2026-07-02T15:00:00.000Z'
      }).title
    ).toBe('Банкет');
    expectTypeOf<CalendarPort>().toHaveProperty('freeBusy');
  });

  it('keeps speech audio binary', () => {
    expect(
      SpeechToTextRequestSchema.parse({
        audio: new Uint8Array([1, 2]),
        contentType: 'audio/ogg'
      }).audio
    ).toBeInstanceOf(Uint8Array);
    expectTypeOf<SpeechPort>().toHaveProperty('textToSpeech');
  });
});
