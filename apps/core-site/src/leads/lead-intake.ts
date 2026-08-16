import { z } from 'zod';

export type LeadFetch = (
  url: string,
  init: Readonly<{
    method: 'GET' | 'POST';
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
  readonly apiToken?: string | undefined;
  readonly fetch: LeadFetch;
  readonly onWarning?: (message: string) => void;
}

const trimmed = z.string().trim().min(1);

const LeadSchema = z.object({
  name: trimmed.optional(),
  contact: trimmed,
  company: trimmed.optional(),
  task: trimmed.optional(),
  channels: z.array(trimmed),
  hasServer: trimmed.optional(),
  timeline: trimmed.optional(),
  /** Согласие обязательно: без него заявку принимать нельзя (152-ФЗ). */
  consent: z.literal('yes'),
  idempotencyKey: trimmed,
  /** Id слота, если посетитель выбрал время звонка. Необязательное поле. */
  slotId: trimmed.optional(),
  /** Читаемая подпись того же слота — форма прислала её сама, без запроса к CMS. */
  slotLabel: trimmed.optional()
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
 */
export async function handleLeadRequest(
  request: Request,
  options: LeadIntakeOptions
): Promise<Response> {
  const form = await request.formData();
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');

  // Ловушка сработала — отвечаем как при успехе, чтобы не подсказывать боту.
  if (field(form, 'companySite') !== undefined) {
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
    consent: field(form, 'consent') ?? '',
    idempotencyKey: field(form, 'idempotencyKey') ?? '',
    slotId: slotChoice.id,
    slotLabel: slotChoice.label
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

  try {
    if (await alreadyStored(baseUrl, lead.data.idempotencyKey, headers, options.fetch)) {
      return accepted(wantsJson);
    }

    // Бронь пробуем один раз за реальную заявку: alreadyStored выше уже
    // отсеял повтор одной и той же попытки, так что до сюда мы доходим
    // ровно один раз для каждого идемпотентного ключа.
    if (lead.data.slotId !== undefined) {
      const reservation = await reserveSlot(baseUrl, lead.data.slotId, headers, options.fetch);
      if (reservation === 'conflict') {
        return problem(409, 'Этот слот уже заняли, выберите другое время', wantsJson);
      }
      if (reservation === 'failed') {
        options.onWarning?.('Slot reservation could not be completed');

        return problem(502, 'Не отправилось, попробуйте ещё раз', wantsJson);
      }
    }

    // Список полей перечислен явно: в CMS уезжает только то, что мы собираем.
    const response = await options.fetch(`${baseUrl}/api/leads`, {
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
          idempotencyKey: lead.data.idempotencyKey,
          consentAt: new Date().toISOString(),
          ...(lead.data.slotId === undefined ? {} : { bookedSlot: lead.data.slotId }),
          ...(lead.data.slotLabel === undefined ? {} : { slotLabel: lead.data.slotLabel })
        }
      })
    });
    if (!response.ok) {
      // Уникальный индекс по ключу — вторая линия защиты от повтора: она
      // срабатывает и тогда, когда две отправки идут одновременно.
      if (await isDuplicate(response)) {
        return accepted(wantsJson);
      }

      options.onWarning?.(`Lead was refused by the CMS with status ${String(response.status)}`);

      return problem(502, 'Не отправилось, попробуйте ещё раз', wantsJson);
    }
  } catch {
    options.onWarning?.('Lead could not be delivered to the CMS');

    return problem(502, 'Не отправилось, попробуйте ещё раз', wantsJson);
  }

  return accepted(wantsJson);
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

async function alreadyStored(
  baseUrl: string,
  idempotencyKey: string,
  headers: Readonly<Record<string, string>>,
  fetch: LeadFetch
): Promise<boolean> {
  const query = new URLSearchParams({ 'filters[idempotencyKey][$eq]': idempotencyKey });
  const response = await fetch(`${baseUrl}/api/leads?${query.toString()}`, {
    method: 'GET',
    headers
  });
  if (!response.ok) {
    return false;
  }

  const parsed: unknown = JSON.parse(await response.text());

  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    'data' in parsed &&
    Array.isArray(parsed.data) &&
    parsed.data.length > 0
  );
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
