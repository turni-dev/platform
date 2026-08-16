import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CaseCards } from '../case-cards/case-cards.js';
import { FaqAccordion } from '../faq/faq.js';
import { FeatureGrid } from '../feature-grid/feature-grid.js';
import { Footer } from '../footer/footer.js';
import { Hero } from '../hero/hero.js';
import { LeadForm } from '../lead-form/lead-form.js';
import type { LeadFormBlock } from '../lead-form/schema.js';
import { Nav } from '../nav/nav.js';
import { SecurityList } from '../security-list/security-list.js';
import { Steps } from '../steps/steps.js';

describe('Nav', () => {
  it('names the navigation landmark and keeps every link', () => {
    const markup = renderToStaticMarkup(
      <Nav
        __component="blocks.nav"
        brand="Turni"
        links={[
          { label: 'Услуга', href: '#service' },
          { label: 'Как работает', href: '#steps' }
        ]}
        cta={{ label: 'Оставить заявку', href: '/brief' }}
      />
    );

    expect(markup).toContain('aria-label="Основная навигация"');
    expect(markup).toContain('href="#service"');
    expect(markup).toContain('href="/brief"');
  });

  it('renders without a call to action', () => {
    const markup = renderToStaticMarkup(
      <Nav __component="blocks.nav" brand="Turni" links={[]} />
    );

    expect(markup).toContain('Turni');
  });
});

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
});

describe('Footer', () => {
  it('keeps contacts and legal links apart', () => {
    const markup = renderToStaticMarkup(
      <Footer
        __component="blocks.footer"
        contacts={[{ label: 'hi@turni.ru', href: 'mailto:hi@turni.ru' }]}
        legalLinks={[{ label: 'Политика', href: '/legal/privacy' }]}
        note="Скоро — самостоятельный сервис"
      />
    );

    expect(markup).toContain('aria-label="Контакты"');
    expect(markup).toContain('aria-label="Правовая информация"');
    expect(markup).toContain('Скоро — самостоятельный сервис');
  });
});
