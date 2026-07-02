import { describe, expect, it } from 'vitest';
import {
  FakeBookingSystem,
  FakeBotProvisioner,
  FakeCalendar,
  FakeSpeech
} from './operation-fakes.js';

describe('operational fake adapters', () => {
  it('provisions deterministic fake bot connections', async () => {
    const fake = new FakeBotProvisioner();
    const result = await fake.provision({
      tenantId: '01900000-0000-7000-8000-000000000001',
      agentId: '01900000-0000-7000-8000-000000000002'
    });

    expect(result.status).toBe('active');
    expect(result.connectionId).toBe('01900000-0000-7000-8000-000000000001');
  });

  it('confirms fake bookings and serves configured knowledge', async () => {
    const fake = new FakeBookingSystem({
      menu: [{ path: 'menu.md', content: '# Меню', sourceVersion: 'v1' }]
    });
    const request = {
      tenantId: '01900000-0000-7000-8000-000000000001',
      locationId: '01900000-0000-7000-8000-000000000002',
      at: '2026-07-02T12:00:00.000Z',
      partySize: 2
    };

    expect((await fake.checkAvailability(request)).available).toBe(true);
    expect(
      (
        await fake.createBooking({
          ...request,
          idempotencyKey: 'booking-1',
          guestId: '01900000-0000-7000-8000-000000000003'
        })
      ).status
    ).toBe('confirmed');
    expect(
      await fake.syncMenu({
        tenantId: request.tenantId,
        locationId: request.locationId
      })
    ).toHaveLength(1);
  });

  it('records deterministic calendar events', async () => {
    const fake = new FakeCalendar();
    const event = await fake.createEvent({
      calendarId: 'main',
      title: 'Банкет',
      startsAt: '2026-07-02T12:00:00.000Z',
      endsAt: '2026-07-02T15:00:00.000Z'
    });

    expect(event.id).toBe('fake-event-1');
    expect(await fake.freeBusy({
      calendarId: 'main',
      startsAt: '2026-07-02T10:00:00.000Z',
      endsAt: '2026-07-02T18:00:00.000Z'
    })).toEqual([]);
  });

  it('transcribes and synthesizes without external services', async () => {
    const fake = new FakeSpeech('Тестовая расшифровка');

    expect(
      (
        await fake.speechToText({
          audio: new Uint8Array([1]),
          contentType: 'audio/ogg'
        })
      ).text
    ).toBe('Тестовая расшифровка');
    expect(
      (
        await fake.textToSpeech({ text: 'Привет', language: 'ru' })
      ).audio.byteLength
    ).toBeGreaterThan(0);
  });
});
