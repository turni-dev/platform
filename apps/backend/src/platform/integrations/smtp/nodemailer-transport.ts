import { createTransport } from 'nodemailer';
import type { MailMessage, MailTransportPort } from './smtp-owner-auth-notifier.js';

export interface SmtpConnection {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly password: string;
}

/** The vendor surface this integration uses, kept narrow on purpose. */
interface VendorTransportOptions {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly auth: { readonly user: string; readonly pass: string };
}

interface VendorTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

export interface NodemailerTransportOptions {
  readonly create?: (options: VendorTransportOptions) => VendorTransport;
}

/**
 * The single place nodemailer is allowed to appear. Callers see only
 * `MailTransportPort`, so a different provider swaps in without touching them.
 */
export function createNodemailerTransport(
  connection: SmtpConnection,
  options?: NodemailerTransportOptions
): MailTransportPort {
  const create =
    options?.create ??
    ((vendorOptions: VendorTransportOptions) => createTransport(vendorOptions));
  const vendor = create({
    host: connection.host,
    port: connection.port,
    secure: connection.secure,
    auth: { user: connection.user, pass: connection.password }
  });

  return {
    sendMail: async (message: MailMessage): Promise<void> => {
      await vendor.sendMail(message);
    }
  };
}
