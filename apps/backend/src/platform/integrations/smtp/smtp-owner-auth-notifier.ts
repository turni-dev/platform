import {
  OwnerAuthCodeMessageSchema,
  type OwnerAuthCodeMessage,
  type OwnerAuthNotifierPort
} from '../../../modules/tenancy/application/owner-auth-notifier.port.js';

export interface MailMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** The only shape of a mail client this platform knows; vendors stay behind it. */
export interface MailTransportPort {
  sendMail(message: MailMessage): Promise<void>;
}

export interface SmtpOwnerAuthNotifierOptions {
  readonly from: string;
  readonly clock?: () => Date;
}

/**
 * Sends the one-time code over SMTP. The failure it raises carries no code and
 * no address, so a delivery error can be logged as-is.
 */
export class SmtpOwnerAuthNotifier implements OwnerAuthNotifierPort {
  public constructor(
    private readonly transport: MailTransportPort,
    private readonly options: SmtpOwnerAuthNotifierOptions
  ) {}

  private now(): Date {
    return (this.options.clock ?? (() => new Date()))();
  }

  public async sendCode(message: OwnerAuthCodeMessage): Promise<void> {
    const parsed = OwnerAuthCodeMessageSchema.parse(message);
    const minutes = Math.max(
      1,
      Math.round((parsed.expiresAt.getTime() - this.now().getTime()) / 60_000)
    );

    try {
      await this.transport.sendMail({
        from: this.options.from,
        to: parsed.email,
        subject: 'Код входа в Turni',
        text:
          `Код для входа: ${parsed.code}\n\n` +
          `Он действует ${minutes} ${minuteNoun(minutes)} и подходит только для одного входа. ` +
          'Если вы его не запрашивали, просто удалите это письмо.\n'
      });
    } catch {
      throw new Error('Owner auth code delivery failed');
    }
  }
}

/** Russian counts the noun with the number: 1 минуту, 2 минуты, 5 минут. */
function minuteNoun(minutes: number): string {
  const tens = minutes % 100;
  const ones = minutes % 10;

  if (tens >= 11 && tens <= 14) {
    return 'минут';
  }
  if (ones === 1) {
    return 'минуту';
  }
  if (ones >= 2 && ones <= 4) {
    return 'минуты';
  }

  return 'минут';
}
