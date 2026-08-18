import type { BlockLink } from '../blocks/shared';
import {
  CATEGORY_LABELS,
  INTEGRATION_CATEGORIES,
  IntegrationSlugSchema,
  type Integration,
  type IntegrationCategory
} from './integration-schema';

/**
 * Адрес карточек каталога: `/integrations/<слаг>` — это маршрут записи типа
 * контента, а не страница из CMS. Витрина же собирается блоком на любой
 * странице, поэтому базовым путём для её ссылок он служит лишь по умолчанию.
 */
export const CATALOG_PATH = '/integrations';

/** Куда ведёт запрос на недоступную интеграцию — на страницу с формой заявки. */
export const LEAD_PATH = '/products/private-agent';

/** Публичное имя параметра адреса: оно из спеки и в урле остаётся snake_case. */
export const REQUESTED_INTEGRATION_PARAM = 'requested_integration';

export interface CatalogQuery {
  readonly category?: IntegrationCategory | undefined;
  readonly query?: string | undefined;
}

/**
 * Категория приезжает из адресной строки, то есть от кого угодно. Всё, чего нет
 * в списке категорий, считаем «фильтр не задан»: страница обязана открыться и
 * по битой ссылке.
 */
export function parseCategory(raw: string | readonly string[] | undefined): IntegrationCategory | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  return INTEGRATION_CATEGORIES.find((category) => category === raw);
}

/** Поисковый запрос из адреса: пустая строка равносильна отсутствию поиска. */
export function parseQuery(raw: string | readonly string[] | undefined): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Какая интеграция понадобилась посетителю — читаем из адреса страницы с
 * формой. Значение приходит от кого угодно, поэтому всё, что не выглядит
 * слагом каталога, считаем отсутствующим: заявку это не ломает, а записать
 * в неё килобайт чужого текста через ссылку не даёт.
 */
export function parseRequestedIntegration(
  raw: string | readonly string[] | undefined
): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const parsed = IntegrationSlugSchema.safeParse(raw.trim());

  return parsed.success ? parsed.data : undefined;
}

export function filterIntegrations(
  integrations: readonly Integration[],
  { category, query }: CatalogQuery
): readonly Integration[] {
  const needle = query?.toLocaleLowerCase('ru');

  return integrations.filter(
    (integration) =>
      (category === undefined || integration.category === category) &&
      (needle === undefined || integration.name.toLocaleLowerCase('ru').includes(needle))
  );
}

/** Стена логотипов показывает только то, что уже работает. */
export function availableIntegrations(
  integrations: readonly Integration[]
): readonly Integration[] {
  return integrations.filter((integration) => integration.status === 'available');
}

/**
 * Путь страницы в виде, пригодном для ссылки: с ведущим слэшем и без хвостового.
 * Витрина — блок, её могут поставить на любую страницу, поэтому базовый путь
 * приходит снаружи и доверять его форме нельзя.
 */
function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim().replace(/\/+$/, '');
  if (trimmed.length === 0) {
    return '/';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Адрес витрины с сохранённым состоянием фильтра — им можно поделиться.
 * Базовый путь задаёт страница, на которой стоит блок: витрина не привязана
 * к одному маршруту и работает там, куда её поставил редактор.
 */
export function catalogHref(
  { category, query }: CatalogQuery,
  basePath: string = CATALOG_PATH
): string {
  const base = normalizeBasePath(basePath);
  const params = new URLSearchParams();
  if (category !== undefined) {
    params.set('category', category);
  }
  if (query !== undefined) {
    params.set('q', query);
  }
  const search = params.toString();

  return search.length === 0 ? base : `${base}?${search}`;
}

export interface CategoryFilter {
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}

export function categoryFilters(
  current: CatalogQuery,
  basePath: string = CATALOG_PATH
): readonly CategoryFilter[] {
  const all: CategoryFilter = {
    label: 'Все',
    href: catalogHref({ query: current.query }, basePath),
    current: current.category === undefined
  };

  return [
    all,
    ...INTEGRATION_CATEGORIES.map((category) => ({
      label: CATEGORY_LABELS[category],
      href: catalogHref({ category, query: current.query }, basePath),
      current: current.category === category
    }))
  ];
}

export interface CtaOptions {
  /** Адрес кабинета; пока его нет, «Подключить» вести некуда. */
  readonly cabinetUrl?: string | undefined;
}

/**
 * Кнопка карточки. Работающая интеграция ведёт в кабинет, всё остальное — в
 * заявку с проставленной интеграцией: спрос на то, чего ещё нет, тоже надо
 * собирать, а не упираться в пустоту.
 */
export function integrationCta(integration: Integration, { cabinetUrl }: CtaOptions): BlockLink {
  if (integration.status === 'available' && cabinetUrl !== undefined && cabinetUrl.length > 0) {
    return {
      label: 'Подключить',
      href: `${cabinetUrl.replace(/\/+$/, '')}/integrations/${integration.slug}`
    };
  }

  return {
    label: 'Нужна эта интеграция',
    href: `${LEAD_PATH}?${REQUESTED_INTEGRATION_PARAM}=${encodeURIComponent(integration.slug)}#lead`
  };
}

/** Абзацы из текстового поля CMS: markdown не рендерим, только plain text. */
export function textParagraphs(value: string): readonly string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
