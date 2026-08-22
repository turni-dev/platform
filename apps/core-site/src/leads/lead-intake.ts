import { z } from 'zod';
import { isHoneypotTripped } from '../anti-abuse/honeypot';
import {
  runIdempotently,
  type IdempotencyGuard,
  type IdempotencyKeyStore
} from '../anti-abuse/idempotency';
import { resolveRequestIdentity } from '../anti-abuse/identity';
import { decideRateLimit, type RateLimiters } from '../anti-abuse/rate-limit';
import { parseRequestedIntegration } from '../integrations/integration-catalog';
import { IntegrationSlugSchema } from '../integrations/integration-schema';
import { deriveLeadAnalytics } from './lead-analytics';

export type LeadFetch = (
  url: string,
  init: Readonly<{
    method: 'POST';
    headers: Readonly<Record<string, string>>;
    body?: string;
  }>
) => Promise<
  Readonly<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
  }>
>;

export interface LeadIntakeOptions {
  readonly baseUrl?: string | undefined;
  /**
   * The CMS token used for this request. Must be write-only in Strapi
   * (create on `lead`/`feedback` and the booking-slot `reserve` action) —
   * never grant it find/findOne on `lead`, or a leaked site token would let
   * an attacker read every visitor's submission. See `apps/cms/README.md`.
   */
  readonly apiToken?: string | undefined;
  readonly fetch: LeadFetch;
  readonly onWarning?: (message: string) => void;
  /**
   * Per-ip and per-session limiters shared across requests handled by the
   * same process (the caller must construct these once, at module scope,
   * and pass the same instances on every call — a fresh instance per call
   * would never see more than one request and could never block anything).
   * Omitting this disables rate limiting; production wiring must always
   * supply it, tests may opt out explicitly.
   */
  readonly rateLimit?: RateLimiters | undefined;
  /**
   * Process-local record of idempotency keys already delivered to the CMS.
   * Stands in for a CMS read: the write token has no find/findOne on `lead`,
   * so this pre-check cannot ask the CMS "have I seen this key". Omitting it
   * disables the pre-check — a resubmission still cannot create a second
   * record, because the CMS unique-index violation (`isConcurrentDuplicate`
   * below) is the real safety net; production wiring must always supply it,
   * tests may opt out explicitly.
   */
  readonly idempotencyStore?: IdempotencyKeyStore | undefined;
}

class SlotConflictError extends Error {}
class SlotUnavailableError extends Error {}

const trimmed = z.string().trim().min(1);

const LeadSchema = z.object({
  name: trimmed.optional(),
  contact: trimmed,
  company: trimmed.optional(),
  task: trimmed.optional(),
  channels: z.array(trimmed),
  hasServer: trimmed.optional(),
  timeline: trimmed.optional(),
  /** Необязательный вопрос — отдельный от согласия на обработку ПДн. */
  foreignHosting: trimmed.optional(),
  /** Согласие обязательно: без него заявку принимать нельзя (152-ФЗ). */
  consent: z.literal('yes'),
  idempotencyKey: trimmed,
  /** Id слота, если посетитель выбрал время звонка. Необязательное поле. */
  slotId: trimmed.optional(),
  /** Читаемая подпись того же слота — форма прислала её сама, без запроса к CMS. */
  slotLabel: trimmed.optional(),
  /** Какую интеграцию просили из каталога. Только слаг: в заявку не должен
   * попадать произвольный текст из адресной строки. */
  requestedIntegration: IntegrationSlugSchema.optional()
});

/**
 * Форма кодирует выбранный слот одним полем `id|label` — без javascript
 * негде было бы синхронизировать два отдельных инпута с одним и тем же
 * выбором. Здесь это значение расходится обратно на id и подпись.
 */
function parseSlotChoice(raw: string | undefined): { id?: string; label?: string } {
  if (raw === undefined) {
    return {};
  }

  const separator = raw.indexOf('|');
  if (separator <= 0) {
    return {};
  }

  return { id: raw.slice(0, separator), label: raw.slice(separator + 1) };
}

/**
 * Единственная дверь для заявок. Ключ записи в CMS остаётся на сервере, тело
 * заявки не попадает ни в логи, ни в ответ, а повтор той же попытки не создаёт
 * вторую запись.
 *
 * Антиабуз (rate limit, honeypot, идемпотентность) живёт единым переиспользуемым
 * слоем в `../anti-abuse/*`: эта функция только применяет его к заявке и не
 * переизобретает ни одну из трёх проверок.
 */
export async function handleLeadRequest(
  request: Request,
  options: LeadIntakeOptions
): Promise<Response> {
  const identity = resolveRequestIdentity(request);
  const response = await process(request, options, identity);

  if (identity.setCookie === undefined) {
    return response;
  }

  const withCookie = new Response(response.body, response);
  withCookie.headers.set('Set-Cookie', identity.setCookie);

  return withCookie;
}

async function process(
  request: Request,
  options: LeadIntakeOptions,
  identity: Readonly<{ ip: string; sessionId: string }>
): Promise<Response> {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');

  if (options.rateLimit !== undefined) {
    const decision = decideRateLimit(options.rateLimit, {
      formName: 'lead',
      ip: identity.ip,
      sessionId: identity.sessionId
    });
    if (!decision.allowed) {
      return problem(429, 'Слишком много попыток, подождите немного', wantsJson);
    }
  }

  const form = await request.formData();

  // Ловушка сработала — отвечаем как при успехе, чтобы не подсказывать боту.
  if (isHoneypotTripped(form, 'companySite')) {
    return accepted(wantsJson);
  }

  const slotChoice = parseSlotChoice(field(form, 'slotId'));

  const lead = LeadSchema.safeParse({
    name: field(form, 'name'),
    contact: field(form, 'contact') ?? '',
    company: field(form, 'company'),
    task: field(form, 'task'),
    channels: form.getAll('channels').filter((value) => typeof value === 'string'),
    hasServer: field(form, 'hasServer'),
    timeline: field(form, 'timeline'),
    foreignHosting: field(form, 'foreignHosting'),
    consent: field(form, 'consent') ?? '',
    idempotencyKey: field(form, 'idempotencyKey') ?? '',
    slotId: slotChoice.id,
    slotLabel: slotChoice.label,
    // Скрытое поле формы приходит от посетителя так же, как и остальные: всё,
    // что не слаг, отбрасываем, а не отказываем в приёме заявки — терять
    // настоящего клиента из-за испорченной ссылки нельзя.
    requestedIntegration: parseRequestedIntegration(field(form, 'requestedIntegration'))
  });
  if (!lead.success) {
    return problem(422, 'Проверьте контакт и согласие на обработку данных', wantsJson);
  }

  const baseUrl = options.baseUrl?.replace(/\/+$/, '');
  if (baseUrl === undefined || baseUrl.length === 0) {
    options.onWarning?.('Lead intake is not configured: CMS_BASE_URL is missing');

    return problem(503, 'Форма временно недоступна, напишите нам напрямую', wantsJson);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
  if (options.apiToken !== undefined && options.apiToken.length > 0) {
    headers['Authorization'] = `Bearer ${options.apiToken}`;
  }

  // Метаданные без ПДн: страница и источник читаются только из заголовков
  // запроса, тело формы сюда не заглядывает.
  const analytics = deriveLeadAnalytics(request);

  const idempotencyStore = options.idempotencyStore;
  const guard: IdempotencyGuard<Awaited<ReturnType<LeadFetch>>> = {
    // Не читаем CMS: у write-токена нет find/findOne на lead (см. комментарий
    // к `idempotencyStore` в LeadIntakeOptions). Пре-чек — только память
    // процесса; настоящую защиту от гонки даёт isConcurrentDuplicate ниже.
    alreadyHandled: (key) => Promise.resolve(idempotencyStore?.has(key) ?? false),
    isConcurrentDuplicate: async (response) => !response.ok && (await isDuplicate(response))
  };

  try {
    const outcome = await runIdempotently(lead.data.idempotencyKey, guard, async () => {
      // Бронь пробуем один раз за реальную заявку: alreadyHandled внутри
      // runIdempotently уже отсеял повтор одной и той же попытки, так что до
      // сюда мы доходим ровно один раз для каждого идемпотентного ключа.
      if (lead.data.slotId !== undefined) {
        const reservation = await reserveSlot(baseUrl, lead.data.slotId, headers, options.fetch);
        if (reservation === 'conflict') {
          throw new SlotConflictError();
        }
        if (reservation === 'failed') {
          throw new SlotUnavailableError();
        }
      }

      // Список полей перечислен явно: в CMS уезжает только то, что мы собираем.
      return options.fetch(`${baseUrl}/api/leads`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: {
            name: lead.data.name,
            contact: lead.data.contact,
            company: lead.data.company,
            task: lead.data.task,
            // В CMS это обычное текстовое поле: редактор читает заявку глазами,
            // а json-редактор в админке для этого не нужен.
            channels: lead.data.channels.join(', '),
            hasServer: lead.data.hasServer,
            timeline: lead.data.timeline,
            foreignHosting: lead.data.foreignHosting,
            requestedIntegration: lead.data.requestedIntegration,
            idempotencyKey: lead.data.idempotencyKey,
            consentAt: new Date().toISOString(),
            // Метаданные для события в аналитике — не путать с ПДн заявки.
            page: analytics.page,
            source: analytics.source,
            bookedSlot: lead.data.slotId,
            slotLabel: lead.data.slotLabel
          }
        })
      });
    });

    if (outcome.kind === 'duplicate') {
      return accepted(wantsJson);
    }

    if (!outcome.result.ok) {
      // Уникальный индекс по ключу уже отловлен в isConcurrentDuplicate выше;
      // сюда попадает только настоящий отказ CMS.
      options.onWarning?.(
        `Lead was refused by the CMS with status ${String(outcome.result.status)}`
      );

      return problem(502, 'Не отправилось, попробуйте ещё раз', wantsJson);
    }

    // Запоминаем ключ только после настоящего успеха: неудачная попытка
    // (не связанная с гонкой по уникальному ключу) должна остаться
    // повторяемой.
    idempotencyStore?.remember(lead.data.idempotencyKey);

    return accepted(wantsJson);
  } catch (error) {
    if (error instanceof SlotConflictError) {
      return problem(409, 'Этот слот уже заняли, выберите другое время', wantsJson);
    }
    if (error instanceof SlotUnavailableError) {
      options.onWarning?.('Slot reservation could not be completed');

      return problem(502, 'Не отправилось, попробуйте ещё раз', wantsJson);
    }

    options.onWarning?.('Lead could not be delivered to the CMS');

    return problem(502, 'Не отправилось, попробуйте ещё раз', wantsJson);
  }
}

/**
 * Просит CMS атомарно занять слот и переводит её ответ в решение для формы:
 * `conflict` — слот уже забрали, заявку создавать не нужно; `failed` — CMS
 * недоступна или ответила ошибкой, тоже без создания заявки.
 */
async function reserveSlot(
  baseUrl: string,
  slotId: string,
  headers: Readonly<Record<string, string>>,
  fetch: LeadFetch
): Promise<'ok' | 'conflict' | 'failed'> {
  try {
    const response = await fetch(`${baseUrl}/api/booking-slots/${slotId}/reserve`, {
      method: 'POST',
      headers
    });
    if (response.status === 409) {
      return 'conflict';
    }

    return response.ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

async function isDuplicate(
  response: Readonly<{ status: number; text: () => Promise<string> }>
): Promise<boolean> {
  if (response.status !== 400) {
    return false;
  }

  return (await response.text()).includes('must be unique');
}

function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

function accepted(wantsJson: boolean): Response {
  if (wantsJson) {
    return Response.json({ status: 'accepted' }, { status: 201 });
  }

  // Без javascript браузер возвращается на страницу обычным редиректом.
  return new Response(null, { status: 303, headers: { Location: '/#lead' } });
}

function problem(status: number, message: string, wantsJson: boolean): Response {
  if (wantsJson) {
    return Response.json({ status: 'rejected', message }, { status });
  }

  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
