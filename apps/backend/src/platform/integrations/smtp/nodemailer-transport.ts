import { createTransport } from 'nodemailer';
import type { MailMessage, MailTransportPort } from './smtp-owner-auth-notifier.js';

/** The vendor surface this integration uses, kept narrow on purpose. */
interface VendorTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

export interface NodemailerTransportOptions {
  readonly create?: (connectionUrl: string) => VendorTransport;
}

/**
 * The single place nodemailer is allowed to appear. Callers see only
 * `MailTransportPort`, so a different provider swaps in without touching them.
 */
export function createNodemailerTransport(
  connectionUrl: string,
  options?: NodemailerTransportOptions
): MailTransportPort {
  const create = options?.create ?? ((url: string) => createTransport(url));
  const vendor = create(connectionUrl);

  return {
    sendMail: async (message: MailMessage): Promise<void> => {
      await vendor.sendMail(message);
    }
  };
}
