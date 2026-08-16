import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CaseCards } from '../case-cards/case-cards';
import { FaqAccordion } from '../faq/faq';
import { FeatureGrid } from '../feature-grid/feature-grid';
import { Hero } from '../hero/hero';
import { LeadForm } from '../lead-form/lead-form';
import type { LeadFormBlock } from '../lead-form/schema';
import { SecurityList } from '../security-list/security-list';
import { Steps } from '../steps/steps';

describe('Hero', () => {
  it('carries the page heading and both calls to action', () => {
    const markup = renderToStaticMarkup(
      <Hero
        __component="blocks.hero"
        heading="Заголовок"
        subheading="Подзаголовок"
        primaryCta={{ label: 'Обсудить задачу', href: '/brief' }}
        secondaryCta={{ label: 'Как это работает', href: '#steps' }}
      />
    );

    expect(markup).toContain('<h1');
    expect(markup).toContain('Обсудить задачу');
    expect(markup).toContain('href="#steps"');
  });

  it('omits the illustration when the block has no media', () => {
    const markup = renderToStaticMarkup(
      <Hero
        __component="blocks.hero"
        heading="Заголовок"
        subheading="Подзаголовок"
        primaryCta={{ label: 'Обсудить задачу', href: '/brief' }}
      />
    );

    expect(markup).not.toContain('<img');
  });

  it('describes the illustration for screen readers when it is present', () => {
    const markup = renderToStaticMarkup(
      <Hero
        __component="blocks.hero"
        heading="Заголовок"
        subheading="Подзаголовок"
        primaryCta={{ label: 'Обсудить задачу', href: '/brief' }}
        media={{ src: '/chat.png', alt: 'Переписка с агентом', width: 640, height: 480 }}
      />
    );

    expect(markup).toContain('alt="Переписка с агентом"');
    // Явные размеры держат макет от прыжка, а первый экран не откладывается:
    // это изображение и есть LCP-элемент страницы.
    expect(markup).toMatch(/<img[^>]+width="640"[^>]+height="480"/);
    expect(markup).not.toContain('loading="lazy"');
  });
});

describe('FeatureGrid', () => {
  it('lists every item and reports the requested column count', () => {
    const markup = renderToStaticMarkup(
      <FeatureGrid
        __component="blocks.feature-grid"
        heading="Что умеет агент"
        columns={2}
        items={[{ title: 'Отвечает' }, { title: 'Фиксирует', body: 'Заявки' }]}
      />
    );

    expect(markup).toContain('data-columns="2"');
    expect(markup).toContain('Отвечает');
    expect(markup).toContain('Заявки');
  });
});

describe('Steps', () => {
  it('numbers the steps as an ordered list', () => {
    const markup = renderToStaticMarkup(
      <Steps
        __component="blocks.steps"
        heading="Как работает"
        steps={[
          { title: 'Бриф', body: 'Разбираем процессы' },
          { title: 'Сборка', body: 'Роль и правила' }
        ]}
        note="Запуск за две недели"
      />
    );

    expect(markup).toContain('<ol');
    expect(markup).toContain('Разбираем процессы');
    expect(markup).toContain('Запуск за две недели');
  });
});

describe('SecurityList', () => {
  it('hides decorative icons from assistive technology', () => {
    const markup = renderToStaticMarkup(
      <SecurityList
        __component="blocks.security-list"
        heading="Безопасность"
        items={[{ title: 'На вашей инфраструктуре', icon: 'server' }]}
      />
    );

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('На вашей инфраструктуре');
  });
});

describe('CaseCards', () => {
  it('shows the empty state instead of inventing cases', () => {
    const markup = renderToStaticMarkup(
      <CaseCards
        __component="blocks.case-cards"
        heading="Кейсы"
        emptyState={{
          body: 'Первые проекты в работе',
          cta: { label: 'Расскажите задачу', href: '/brief' }
        }}
        cases={[]}
      />
    );

    expect(markup).toContain('Первые проекты в работе');
    expect(markup).not.toContain('<article');
  });

  it('prefers real cases over the empty state once they exist', () => {
    const markup = renderToStaticMarkup(
      <CaseCards
        __component="blocks.case-cards"
        heading="Кейсы"
        emptyState={{
          body: 'Первые проекты в работе',
          cta: { label: 'Расскажите задачу', href: '/brief' }
        }}
        cases={[
          { title: 'Кофейня', task: 'Ночные вопросы', built: 'Агент в VK', result: 'Ответ за минуту' }
        ]}
      />
    );

    expect(markup).toContain('<article');
    expect(markup).not.toContain('Первые проекты в работе');
  });
});

describe('FaqAccordion', () => {
  it('uses native disclosure so it works without javascript', () => {
    const markup = renderToStaticMarkup(
      <FaqAccordion
        __component="blocks.faq"
        heading="Вопросы"
        items={[{ question: 'Где данные?', answer: 'На вашем сервере.' }]}
      />
    );

    expect(markup).toContain('<details');
    expect(markup).toContain('<summary');
    expect(markup).toContain('Где данные?');
  });
});

const leadForm: LeadFormBlock = {
  __component: 'blocks.lead-form',
  heading: 'Расскажите задачу',
  submitLabel: 'Отправить',
  labels: {
    name: 'Имя',
    contact: 'Контакт',
    company: 'Компания',
    task: 'Что поручить агенту'
  },
  groups: {
    channels: { legend: 'Где общаетесь', options: ['Сайт'] },
    hasServer: { legend: 'Есть ли сервер', options: ['Да', 'Нет'] },
    timeline: { legend: 'Срок', options: ['Горит'] }
  },
  consent: { label: 'Согласен на обработку данных', href: '/legal/privacy' }
};

describe('LeadForm', () => {
  it('submits to the site route handler even without javascript', () => {
    const markup = renderToStaticMarkup(
      <LeadForm {...leadForm} />
    );

    expect(markup).toContain('method="post"');
    expect(markup).toContain('action="/api/leads"');
  });

  it('carries a fresh idempotency key so a resubmit does not duplicate the lead', () => {
    const first = renderToStaticMarkup(<LeadForm {...leadForm} />);
    const second = renderToStaticMarkup(<LeadForm {...leadForm} />);
    const key = (markup: string): string | undefined =>
      /name="idempotencyKey" value="([^"]+)"/.exec(markup)?.[1];

    expect(key(first)).toBeDefined();
    expect(key(first)).not.toBe(key(second));
  });

  it('requires the contact and the personal data consent', () => {
    const markup = renderToStaticMarkup(
      <LeadForm {...leadForm} />
    );

    expect(markup).toMatch(/<input(?=[^>]*name="contact")(?=[^>]*required)[^>]*>/);
    expect(markup).toMatch(/<input(?=[^>]*name="consent")(?=[^>]*required)[^>]*>/);
    expect(markup).not.toMatch(/<input(?=[^>]*name="name")(?=[^>]*required)[^>]*>/);
  });

  it('labels every field and keeps the honeypot away from real visitors', () => {
    const markup = renderToStaticMarkup(
      <LeadForm {...leadForm} />
    );

    for (const field of ['name', 'contact', 'company', 'task']) {
      expect(markup).toContain(`for="lead-${field}"`);
      expect(markup).toContain(`id="lead-${field}"`);
    }
    // Выбор из нескольких вариантов — группа с легендой, а не поле с подписью.
    for (const group of ['channels', 'hasServer', 'timeline']) {
      expect(markup).toMatch(new RegExp(`<fieldset[^>]*>\\s*<legend`));
      expect(markup).toContain(`name="${group}"`);
    }
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('renders no time picker when no slots are offered', () => {
    const markup = renderToStaticMarkup(<LeadForm {...leadForm} />);

    expect(markup).not.toContain('name="slotId"');
  });

  it('offers a slot as one radio carrying both its id and its label', () => {
    const markup = renderToStaticMarkup(
      <LeadForm
        {...leadForm}
        slots={[{ id: '5', startsAt: '2026-08-16T11:00:00.000Z', durationMinutes: 30, label: '16 августа, 14:00 МСК' }]}
      />
    );

    expect(markup).toContain('name="slotId"');
    expect(markup).toContain('value="5|16 августа, 14:00 МСК"');
    expect(markup).toContain('16 августа, 14:00 МСК');
  });
});

