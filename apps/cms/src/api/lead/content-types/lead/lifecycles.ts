import type { Core } from '@strapi/strapi';

declare const strapi: Core.Strapi;

/**
 * Заявка бесполезна, если о ней никто не узнал. Письмо уходит рядом с записью:
 * если заявка сохранилась, уведомление гарантированно поставлено в отправку.
 * В письмо попадает контакт и текст задачи — это и есть его смысл, — но в логи
 * не пишется ничего, кроме факта отправки.
 */
export default {
  async afterCreate(event: { result: Record<string, unknown> }): Promise<void> {
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
      ['Время звонка', lead['slotLabel']]
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
