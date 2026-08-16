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
  idempotencyKey: trimmed
});

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

  const lead = LeadSchema.safeParse({
    name: field(form, 'name'),
    contact: field(form, 'contact') ?? '',
    company: field(form, 'company'),
    task: field(form, 'task'),
    channels: form.getAll('channels').filter((value) => typeof value === 'string'),
    hasServer: field(form, 'hasServer'),
    timeline: field(form, 'timeline'),
    consent: field(form, 'consent') ?? '',
    idempotencyKey: field(form, 'idempotencyKey') ?? ''
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
          channels: lead.data.channels,
          hasServer: lead.data.hasServer,
          timeline: lead.data.timeline,
          idempotencyKey: lead.data.idempotencyKey,
          consentAt: new Date().toISOString()
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
