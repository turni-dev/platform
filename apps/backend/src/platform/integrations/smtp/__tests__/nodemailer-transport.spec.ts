import { describe, expect, it } from 'vitest';
import { createNodemailerTransport } from '../nodemailer-transport.js';

const message = {
  from: 'Turni <no-reply@turni.ru>',
  to: 'owner@turni.ru',
  subject: 'Код входа в Turni',
  text: 'Код для входа: 424242\n'
};

describe('createNodemailerTransport', () => {
  it('hands the connection url to the vendor client once', () => {
    const created: unknown[] = [];
    createNodemailerTransport('smtps://user:secret@smtp.turni.ru:465', {
      create: (options) => {
        created.push(options);
        return { sendMail: () => Promise.resolve({}) };
      }
    });

    expect(created).toEqual(['smtps://user:secret@smtp.turni.ru:465']);
  });

  it('delegates a send and hides the vendor result', async () => {
    const sent: unknown[] = [];
    const transport = createNodemailerTransport('smtps://smtp.turni.ru', {
      create: () => ({
        sendMail: (mail) => {
          sent.push(mail);
          return Promise.resolve({ messageId: 'vendor-id' });
        }
      })
    });

    await expect(transport.sendMail(message)).resolves.toBeUndefined();
    expect(sent).toEqual([message]);
  });

  it('propagates a vendor failure to the caller', async () => {
    const transport = createNodemailerTransport('smtps://smtp.turni.ru', {
      create: () => ({
        sendMail: () => Promise.reject(new Error('421 service unavailable'))
      })
    });

    await expect(transport.sendMail(message)).rejects.toThrow(
      '421 service unavailable'
    );
  });
});
