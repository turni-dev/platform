import { describe, expect, it } from 'vitest';
import {
  SmtpOwnerAuthNotifier,
  type MailMessage,
  type MailTransportPort
} from '../smtp-owner-auth-notifier.js';

const now = new Date('2026-08-14T10:00:00.000Z');
const message = {
  email: 'owner@turni.ru',
  code: '424242',
  expiresAt: new Date(now.getTime() + 5 * 60 * 1000)
};

class RecordingTransport implements MailTransportPort {
  public readonly sent: MailMessage[] = [];
  public failure: Error | undefined;

  public sendMail(mail: MailMessage): Promise<void> {
    if (this.failure !== undefined) {
      return Promise.reject(this.failure);
    }

    this.sent.push(mail);
    return Promise.resolve();
  }
}

function build(): {
  readonly transport: RecordingTransport;
  readonly notifier: SmtpOwnerAuthNotifier;
} {
  const transport = new RecordingTransport();

  return {
    transport,
    notifier: new SmtpOwnerAuthNotifier(transport, {
      from: 'Turni <no-reply@turni.ru>',
      clock: () => now
    })
  };
}

describe('SmtpOwnerAuthNotifier', () => {
  it('sends the code to the owner with its lifetime spelled out', async () => {
    const context = build();

    await context.notifier.sendCode(message);

    const sent = context.transport.sent[0];
    expect(sent?.to).toBe('owner@turni.ru');
    expect(sent?.from).toBe('Turni <no-reply@turni.ru>');
    expect(sent?.subject).toContain('Turni');
    expect(sent?.text).toContain('424242');
    expect(sent?.text).toContain('5');
  });

  it('refuses to send a message that failed validation', async () => {
    const context = build();

    await expect(
      context.notifier.sendCode({ ...message, code: '42' })
    ).rejects.toThrow();
    expect(context.transport.sent).toHaveLength(0);
  });

  it('surfaces a transport failure without leaking the code', async () => {
    const context = build();
    context.transport.failure = new Error('smtp 421 service unavailable');

    await expect(context.notifier.sendCode(message)).rejects.toThrow(
      'Owner auth code delivery failed'
    );
    await expect(context.notifier.sendCode(message)).rejects.not.toThrow('424242');
  });

  it('rounds a lifetime shorter than a minute up to one', async () => {
    const context = build();

    await context.notifier.sendCode({
      ...message,
      expiresAt: new Date(now.getTime() + 20_000)
    });

    expect(context.transport.sent[0]?.text).toContain('1 минуту');
  });

  it('agrees the noun with the number of minutes', async () => {
    const cases: ReadonlyArray<readonly [number, string]> = [
      [1, '1 минуту'],
      [2, '2 минуты'],
      [4, '4 минуты'],
      [5, '5 минут'],
      [11, '11 минут'],
      [21, '21 минуту']
    ];

    for (const [minutes, expected] of cases) {
      const context = build();

      await context.notifier.sendCode({
        ...message,
        expiresAt: new Date(now.getTime() + minutes * 60_000)
      });

      expect(context.transport.sent[0]?.text).toContain(expected);
    }
  });
});
