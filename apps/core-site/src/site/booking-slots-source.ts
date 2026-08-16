import { z } from 'zod';
import type { SiteFetch } from '../content/cms-page-source';

/** Тот же вид id, что уже приходит от Strapi в других источниках: число или строка — снаружи всегда строка. */
const BookingSlotEntrySchema = z.object({
  id: z.union([z.number(), z.string()]).transform((id) => String(id)),
  startsAt: z.string().min(1),
  durationMinutes: z.number().int().positive()
});

export interface BookingSlotOption {
  readonly id: string;
  readonly startsAt: string;
  readonly durationMinutes: number;
  /** Готовая подпись для радио-кнопки — время с явной зоной. */
  readonly label: string;
}

export interface BookingSlotsSourceOptions {
  readonly baseUrl?: string | undefined;
  readonly apiToken?: string | undefined;
  readonly fetch: SiteFetch;
  readonly onWarning?: (message: string) => void;
}

const TIME_ZONE = 'Europe/Moscow';
const TIME_ZONE_LABEL = 'МСК';

/**
 * Аудитория сайта — русскоязычная, поэтому зона захардкожена, а не настраивается:
 * «16 августа в 14:00 МСК» читается однозначно независимо от того, где сидит
 * посетитель и что показывает его браузер.
 */
export function formatSlotLabel(startsAtIso: string): string {
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(startsAtIso));

  return `${formatted} ${TIME_ZONE_LABEL}`;
}

/**
 * Список доступных слотов для формы заявки. Как и остальные источники сайта,
 * на любой сбой CMS отвечает пустым списком — форма обязана работать и без
 * выбора времени, поэтому здесь нет семени, только тихая деградация.
 */
export function createBookingSlotsSource(
  options: BookingSlotsSourceOptions
): { get(): Promise<readonly BookingSlotOption[]> } {
  return {
    async get(): Promise<readonly BookingSlotOption[]> {
      const baseUrl = options.baseUrl?.replace(/\/+$/, '');
      if (baseUrl === undefined || baseUrl.length === 0) {
        return [];
      }

      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.apiToken !== undefined && options.apiToken.length > 0) {
          headers['Authorization'] = `Bearer ${options.apiToken}`;
        }

        const response = await options.fetch(`${baseUrl}/api/booking-slots/available`, {
          headers
        });
        if (!response.ok) {
          return warn(options, `status ${String(response.status)}`);
        }

        const body: unknown = JSON.parse(await response.text());
        const data =
          typeof body === 'object' && body !== null && 'data' in body ? body.data : undefined;
        const parsed = z.array(BookingSlotEntrySchema).safeParse(data);
        if (!parsed.success) {
          return warn(options, 'answer did not match the slot shape');
        }

        return parsed.data.map((slot) => ({ ...slot, label: formatSlotLabel(slot.startsAt) }));
      } catch {
        return warn(options, 'request failed');
      }
    }
  };
}

function warn(options: BookingSlotsSourceOptions, reason: string): readonly BookingSlotOption[] {
  options.onWarning?.(`Booking slots are unavailable (${reason}); hiding the time picker`);

  return [];
}
