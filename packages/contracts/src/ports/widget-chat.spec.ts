import { describe, expect, it } from 'vitest';
import {
  CabinetStreamEventSchema,
  GuestSessionRequestSchema,
  WidgetClientEventSchema,
  WidgetServerEventSchema
} from './widget-chat.js';

describe('widget chat transport contracts', () => {
  it('accepts a widget session request without vendor-specific fields', () => {
    expect(
      GuestSessionRequestSchema.parse({
        widgetKey: 'widget_public_demo'
      })
    ).toEqual({ widgetKey: 'widget_public_demo' });
  });

  it('rejects an empty message.send payload before it enters the adapter', () => {
    expect(() =>
      WidgetClientEventSchema.parse({
        type: 'message.send',
        clientMsgId: '01900000-0000-7000-8000-000000000001',
        text: '   '
      })
    ).toThrow();
  });

  it('accepts a complete guest-visible message but no draft delta', () => {
    expect(
      WidgetServerEventSchema.parse({
        type: 'message.new',
        id: '01900000-0000-7000-8000-000000000002',
        role: 'agent',
        text: 'Я ИИ-администратор. Проверю и отвечу.',
        ts: '2026-07-12T12:00:00.000Z'
      })
    ).toMatchObject({ type: 'message.new' });

    expect(() =>
      WidgetServerEventSchema.parse({
        type: 'draft.delta',
        chunk: 'partial'
      })
    ).toThrow();
  });

  it('accepts a resumed guest session acknowledgement', () => {
    expect(
      WidgetServerEventSchema.parse({
        type: 'session.ok',
        token: 'a'.repeat(32)
      })
    ).toEqual({ type: 'session.ok', token: 'a'.repeat(32) });
  });

  it('keeps internal draft deltas on the cabinet stream', () => {
    expect(
      CabinetStreamEventSchema.parse({
        type: 'draft.delta',
        runId: '01900000-0000-7000-8000-000000000003',
        chunk: 'Черновик для ревью'
      })
    ).toEqual({
      type: 'draft.delta',
      runId: '01900000-0000-7000-8000-000000000003',
      chunk: 'Черновик для ревью'
    });
  });
});
