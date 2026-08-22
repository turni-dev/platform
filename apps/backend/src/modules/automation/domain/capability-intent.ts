/**
 * The first, deliberately narrow intent this vertical slice understands: a
 * guest asking to be booked in ("запишите меня на завтра в 18:00"). Real NLU
 * is a separate card — this is a keyword-plus-time-token detector, exactly as
 * blunt as `frontline-workflow.ts`'s FAQ matcher was before an LLM classifier
 * replaced it. Swapping this for an LLM-backed detector later does not touch
 * anything downstream of {@link CapabilityIntent}.
 */
export type CapabilityIntent =
  | Readonly<{ type: 'none' }>
  | Readonly<{
      type: 'calendar_booking';
      /** Guest-authored text kept only as the Calendar event's own summary —
       * never forwarded to the audit trail (see `capability-automation-service.ts`). */
      summary: string;
      startsAt: string;
      endsAt: string;
    }>;

const NONE_INTENT: CapabilityIntent = Object.freeze({ type: 'none' });

const BOOKING_KEYWORDS = /запиш\S*|забронир\S*|встреч\S*|созвон\S*/iu;
const TIME_TOKEN = /(\d{1,2}):(\d{2})/;
const TOMORROW_TOKEN = /завтра/iu;

const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic keyword match: a booking keyword plus a recognizable time
 * token ("18:00" or "завтра") is required, so idle chatter ("встретимся
 * как-нибудь") never fires an external write. `occurredAt` anchors "завтра"
 * and a bare "HH:MM" to a concrete calendar day.
 */
export function detectCapabilityIntent(text: string, occurredAt: Date): CapabilityIntent {
  const trimmed = text.trim();
  if (trimmed.length === 0 || !BOOKING_KEYWORDS.test(trimmed)) {
    return NONE_INTENT;
  }

  const timeMatch = TIME_TOKEN.exec(trimmed);
  if (timeMatch === null) {
    return NONE_INTENT;
  }

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (hours > 23 || minutes > 59) {
    return NONE_INTENT;
  }

  const dayOffset = TOMORROW_TOKEN.test(trimmed) ? DAY_MS : 0;
  const startsAt = new Date(
    Math.floor((occurredAt.getTime() + dayOffset) / DAY_MS) * DAY_MS +
      hours * 60 * 60 * 1000 +
      minutes * 60 * 1000
  );
  const endsAt = new Date(startsAt.getTime() + DEFAULT_DURATION_MS);

  return Object.freeze({
    type: 'calendar_booking',
    summary: trimmed.slice(0, 500),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString()
  });
}
