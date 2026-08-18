import type { Core } from '@strapi/strapi';
import {
  buildIntegrationRequestEventPayload,
  buildLeadEventPayload
} from '../../../event/build-event-payload';

declare const strapi: Core.Strapi;

/**
 * Заявка бесполезна, если о ней никто не узнал. Письмо уходит рядом с записью:
 * если заявка сохранилась, уведомление гарантированно поставлено в отправку.
 * В письмо попадает контакт и текст задачи — это и есть его смысл, — но в логи
 * не пишется ничего, кроме факта отправки.
 */
export default {
  async afterCreate(event: { result: Record<string, unknown> }): Promise<void> {
    await recordLeadEvent(event.result);
    await recordIntegrationRequestEvent(event.result);

    const settings = (await strapi
      .documents('api::site-setting.site-setting')
      .findFirst({ fields: ['leadRecipient'] })) as { leadRecipient?: string } | null;

    const to = settings?.leadRecipient;
    if (!to) {
      strapi.log.warn('Lead notification skipped: no recipient configured in site settings');

      return;
    }

    const lead = event.result;
    const lines = [
      ['Контакт', lead['contact']],
      ['Имя', lead['name']],
      ['Компания', lead['company']],
      ['Задача', lead['task']],
      ['Каналы', lead['channels']],
      ['Свой сервер', lead['hasServer']],
      ['Срок', lead['timeline']],
      ['Зарубежные серверы', lead['foreignHosting']],
      ['Время звонка', lead['slotLabel']],
      ['Запрошенная интеграция', lead['requestedIntegration']]
    ]
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([label, value]) => `${String(label)}: ${String(value)}`);

    try {
      await strapi.plugin('email').service('email').send({
        to,
        subject: 'Новая заявка с сайта',
        text: lines.join('\n')
      });
    } catch {
      // Заявка уже сохранена: её видно в админке, даже если письмо не ушло.
      strapi.log.error('Lead notification could not be sent');
    }
  }
};

/**
 * Пишет одно метаданное-событие в общую таблицу `events` для каждой реально
 * созданной заявки. `afterCreate` срабатывает ровно один раз на настоящую
 * запись — повтор той же попытки (идемпотентный ключ) до `create` не
 * доходит, так что дублей здесь не бывает.
 *
 * Решение сделать это здесь, а не в route handler'е сайта: у сайта нет
 * доступа ни к какой продуктовой базе — только к этому же HTTP API CMS,
 * которым он и создал заявку. Через event.result здесь под рукой уже есть
 * id только что созданной записи и время создания — без второго сетевого
 * запроса и без риска, что лид сохранится, а событие потеряется при обрыве
 * между двумя отдельными HTTP-вызовами. Продуктовый бэкенд (apps/backend)
 * в этом не участвует и не должен: это таблица CMS, а не он.
 */
async function recordLeadEvent(lead: Record<string, unknown>): Promise<void> {
  const id = lead['id'];
  if (typeof id !== 'number') {
    strapi.log.error('Lead analytics event skipped: created lead has no numeric id');

    return;
  }

  try {
    await strapi.documents('api::event.event').create(buildLeadEventPayload({ ...lead, id }));
  } catch {
    // Заявка уже сохранена и письмо владельцу уже поставлено в очередь —
    // потерянное аналитическое событие не должно ронять приём заявки.
    strapi.log.error('Lead analytics event could not be recorded');
  }
}

/**
 * Второе метаданное-событие для той же заявки: спека §4 требует знать спрос
 * на интеграции, которых ещё нет. Пишется рядом с событием заявки и тем же
 * механизмом — отдельной системы аналитики у сайта нет. Заявка без запроса
 * интеграции события не порождает, а сорванное событие не роняет приём
 * заявки, ровно как и у `recordLeadEvent`.
 */
async function recordIntegrationRequestEvent(lead: Record<string, unknown>): Promise<void> {
  const id = lead['id'];
  if (typeof id !== 'number') {
    return;
  }

  const payload = buildIntegrationRequestEventPayload({ ...lead, id });
  if (payload === undefined) {
    return;
  }

  try {
    await strapi.documents('api::event.event').create(payload);
  } catch {
    strapi.log.error('Integration request analytics event could not be recorded');
  }
}
