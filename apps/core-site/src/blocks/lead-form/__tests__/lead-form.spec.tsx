import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LeadForm } from '../lead-form';
import type { LeadFormBlock } from '../schema';

const block: LeadFormBlock = {
  __component: 'blocks.lead-form',
  heading: 'Оставьте заявку',
  submitLabel: 'Отправить',
  labels: { name: 'Имя', contact: 'Контакт', company: 'Компания', task: 'Задача' },
  groups: {
    channels: { legend: 'Каналы', options: ['Сайт'] },
    hasServer: { legend: 'Свой сервер', options: ['Да'] },
    timeline: { legend: 'Срок', options: ['Горит'] }
  },
  consent: { label: 'Согласие', href: '/legal/consent' }
};

describe('LeadForm requested integration', () => {
  it('carries the requested integration in a hidden field, so a plain POST delivers it', () => {
    const markup = renderToStaticMarkup(
      <LeadForm {...block} requestedIntegration="google-calendar" />
    );

    expect(markup).toContain('name="requestedIntegration"');
    expect(markup).toContain('value="google-calendar"');
    // Скрытое поле — часть обычной формы, а не что-то, что дорисовывает
    // javascript: без него заявка уходит тем же POST.
    expect(markup).toContain('type="hidden"');
  });

  it('renders no such field when the visitor came without the parameter', () => {
    const markup = renderToStaticMarkup(<LeadForm {...block} />);

    expect(markup).not.toContain('name="requestedIntegration"');
  });
});
