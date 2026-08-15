import { describe, expect, it } from 'vitest';
import { parseVkCallback } from '../vk-callback.js';

const confirmation = {
  type: 'confirmation',
  group_id: 1234,
  secret: 's3cret'
};

const messageNew = {
  type: 'message_new',
  event_id: 'e1b2c3',
  group_id: 1234,
  secret: 's3cret',
  object: {
    message: { from_id: 777, peer_id: 777, text: 'Когда вы работаете?' }
  }
};

function omitSecret(callback: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const { secret, ...rest } = callback;
  void secret;

  return rest;
}

describe('parseVkCallback', () => {
  it('reads a confirmation request', () => {
    expect(parseVkCallback(confirmation)).toEqual({
      type: 'confirmation',
      groupId: 1234,
      secret: 's3cret'
    });
  });

  it('reads a new message and keeps only the fields we use', () => {
    expect(parseVkCallback(messageNew)).toEqual({
      type: 'message_new',
      eventId: 'e1b2c3',
      groupId: 1234,
      secret: 's3cret',
      senderId: '777',
      peerId: '777',
      text: 'Когда вы работаете?'
    });
  });

  it('refuses an event we do not handle', () => {
    expect(() => parseVkCallback({ type: 'wall_post_new', group_id: 1 })).toThrow();
  });

  it('refuses a message without text', () => {
    expect(() =>
      parseVkCallback({ ...messageNew, object: { message: { from_id: 7, peer_id: 7 } } })
    ).toThrow();
  });

  it('refuses a message that carries no secret: we always register one', () => {
    const withoutSecret = omitSecret(messageNew);

    expect(() => parseVkCallback(withoutSecret)).toThrow();
  });

  it('accepts a confirmation without a secret, which VK may send before one exists', () => {
    const withoutSecret = omitSecret(confirmation);

    expect(parseVkCallback(withoutSecret)).toEqual({ type: 'confirmation', groupId: 1234 });
  });
});
