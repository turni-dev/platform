import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Bento } from '../bento/bento';
import { CaseCards } from '../case-cards/case-cards';
import { ChangelogItem } from '../changelog-item/changelog-item';
import { ChangelogItemBlockSchema } from '../changelog-item/schema';
import { FaqAccordion } from '../faq/faq';
import { FeatureGrid } from '../feature-grid/feature-grid';
import { Hero } from '../hero/hero';
import { LeadForm } from '../lead-form/lead-form';
import type { LeadFormBlock } from '../lead-form/schema';
import { NumberedSteps } from '../numbered-steps/numbered-steps';
import { SecurityList } from '../security-list/security-list';
import { StatCard } from '../stat-card/stat-card';
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
  it('omits the foreign hosting question when the block has none', () => {
    const markup = renderToStaticMarkup(<LeadForm {...leadForm} />);

    expect(markup).not.toContain('name="foreignHosting"');
  });

  it('offers the foreign hosting question as an optional group when the block has one', () => {
    const withForeignHosting: LeadFormBlock = {
      ...leadForm,
      groups: {
        ...leadForm.groups,
        foreignHosting: {
          legend: 'Готовы ли к размещению на зарубежных серверах?',
          options: ['Да', 'Нет', 'Не знаю']
        }
      }
    };
    const markup = renderToStaticMarkup(<LeadForm {...withForeignHosting} />);

    expect(markup).toContain('name="foreignHosting"');
    expect(markup).toContain('Готовы ли к размещению на зарубежных серверах?');
    // Вопрос необязательный: ни один вариант не отмечен required.
    expect(markup).not.toMatch(/<input(?=[^>]*name="foreignHosting")(?=[^>]*required)[^>]*>/);
  });

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


describe('Bento', () => {
  it('reports the size of every tile so the row of equal cards is broken', () => {
    const markup = renderToStaticMarkup(
      <Bento
        __component="blocks.bento"
        heading="Что внутри"
        tiles={[
          { title: 'Диалог', body: 'Агент отвечает сам', size: 'wide' },
          { title: 'Правила', size: 'tall' },
          { title: 'Отчёт' }
        ]}
      />
    );

    expect(markup).toContain('data-size="wide"');
    expect(markup).toContain('data-size="tall"');
    // Плитка без явного размера остаётся обычной, а не ломает сетку.
    expect(markup).toContain('data-size="standard"');
    expect(markup).toContain('Агент отвечает сам');
  });

  it('carries the tile call to action as a link', () => {
    const markup = renderToStaticMarkup(
      <Bento
        __component="blocks.bento"
        tiles={[{ title: 'Интеграции', cta: { label: 'Смотреть', href: '/integrations' } }]}
      />
    );

    expect(markup).toContain('href="/integrations"');
    expect(markup).toContain('Смотреть');
  });
});

describe('NumberedSteps', () => {
  it('numbers the steps as an ordered list and keeps the optional caption', () => {
    const markup = renderToStaticMarkup(
      <NumberedSteps
        __component="blocks.numbered-steps"
        heading="Как это работает"
        intro="Три шага до запуска"
        steps={[
          { title: 'Бриф', body: 'Разбираем процессы', caption: '30 минут' },
          { title: 'Сборка', body: 'Роль и правила' }
        ]}
        note="Запуск за две недели"
      />
    );

    expect(markup).toContain('<ol');
    expect(markup).toContain('Три шага до запуска');
    expect(markup).toContain('30 минут');
    expect(markup).toContain('Запуск за две недели');
  });

  it('renders no markup for a caption the editor left empty', () => {
    const markup = renderToStaticMarkup(
      <NumberedSteps
        __component="blocks.numbered-steps"
        heading="Как это работает"
        steps={[{ title: 'Бриф', body: 'Разбираем процессы' }]}
      />
    );

    expect(markup).not.toContain('<figcaption');
  });
});

describe('StatCard', () => {
  it('pairs every number with what it measures', () => {
    const markup = renderToStaticMarkup(
      <StatCard
        __component="blocks.stat-card"
        heading="Цифры"
        stats={[
          { value: '10 с', label: 'Ответ гостю', note: 'p95' },
          { value: '24/7', label: 'Смена агента' }
        ]}
        source="Данные пилота"
      />
    );

    expect(markup).toContain('10 с');
    expect(markup).toContain('Ответ гостю');
    expect(markup).toContain('p95');
    expect(markup).toContain('Данные пилота');
  });
});

describe('ChangelogItem', () => {
  it('marks the date up as machine readable time', () => {
    const markup = renderToStaticMarkup(
      <ChangelogItem
        __component="blocks.changelog-item"
        date="2026-08-18"
        version="0.4.0"
        title="Слоты консультации"
        body="Лид выбирает время прямо в форме"
        tags={['Сайт', 'Формы']}
        link={{ label: 'Подробнее', href: '/changelog/0-4-0' }}
      />
    );

    expect(markup).toMatch(/datetime="2026-08-18"/i);
    expect(markup).toContain('0.4.0');
    expect(markup).toContain('Формы');
    expect(markup).toContain('href="/changelog/0-4-0"');
  });

  it('keeps an entry without version, tags or link readable', () => {
    const markup = renderToStaticMarkup(
      <ChangelogItem
        __component="blocks.changelog-item"
        date="2026-08-18"
        title="Слоты консультации"
        body="Лид выбирает время прямо в форме"
      />
    );

    expect(markup).toContain('<article');
    expect(markup).not.toContain('<a ');
    expect(markup).not.toContain('<ul');
  });

  it('reads a tag both as a plain string and as the repeatable CMS component', () => {
    const parsed = ChangelogItemBlockSchema.parse({
      __component: 'blocks.changelog-item',
      date: '2026-08-18',
      title: 'Слоты консультации',
      body: 'Лид выбирает время прямо в форме',
      tags: ['Сайт', { value: 'Формы' }]
    });

    expect(parsed.tags).toEqual(['Сайт', 'Формы']);
  });
});
